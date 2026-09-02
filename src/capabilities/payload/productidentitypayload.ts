// productidentitypayload.ts
// Capability module for product identity payload in the ANQR product.

// --- Type definitions ---

export type PayloadKind = 'gs1_digital_link' | 'plain_url';

export const PAYLOAD_KINDS = ['gs1_digital_link', 'plain_url'] as const;

export interface DigitalLinkPayload {
  readonly kind: 'gs1_digital_link';
  readonly uri: string;
  readonly identifierKeys: readonly string[];
  readonly primaryKey: string;
  readonly primaryValue: string;
}

export interface PlainUrlPayload {
  readonly kind: 'plain_url';
  readonly uri: string;
}

export type Payload = DigitalLinkPayload | PlainUrlPayload;

export type PayloadResult =
  | { readonly success: true; readonly payload: Payload }
  | { readonly success: false; readonly error: PayloadError };

export interface PayloadError {
  readonly message: string;
  readonly code: 'invalid_uri' | 'not_digital_link' | 'missing_identifier';
  readonly kind: 'payload_error';
}

export type ProductIdentityClassification = 'product_identity' | 'not_product_identity';

export const PRODUCT_IDENTITY_OUTCOMES = ['product_identity', 'not_product_identity'] as const;

// --- Constants ---

// GS1 Application Identifiers recognised in product identity Digital Links.
// Each entry pairs the AI numeric code with the path key used to address it.
export const GS1_IDENTIFIER_KEYS = [
  'gtin',
  'itip',
  'gmn',
  'cpid',
  'srn',
  'giai',
  'gln',
  'sscc',
  'grai',
  'gdti',
  'gsrnp',
  'gcn',
  'csp',
] as const;

export type Gs1IdentifierKey = (typeof GS1_IDENTIFIER_KEYS)[number];

const PRIMARY_KEYS: ReadonlySet<Gs1IdentifierKey> = new Set([
  'gtin',
  'itip',
  'gmn',
  'cpid',
  'srn',
  'giai',
  'gln',
  'sscc',
  'grai',
  'gdti',
  'gsrnp',
  'gcn',
]);

// --- Pure parsing helpers ---

function isAbsoluteHttpUri(value: string): boolean {
  // Permit only well-formed absolute http(s) URIs; no scheme-relative, opaque,
  // or path-only strings qualify as a Digital Link.
  if (value.length === 0) {
    return false;
  }
  const lower = value.toLowerCase();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
    return false;
  }
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function extractPrimary(entries: ReadonlyMap<string, string>): {
  primaryKey: string;
  primaryValue: string;
} | null {
  for (const key of PRIMARY_KEYS) {
    const value = entries.get(key);
    if (value !== undefined && value.length > 0) {
      return { primaryKey: key, primaryValue: value };
    }
  }
  return null;
}

// --- Core parsing function ---

/**
 * Parses a URI string into a payload.
 *
 * - A URI that conforms to the GS1 Digital Link path grammar is accepted as
 *   a `gs1_digital_link` payload, and the function reports the identifier
 *   keys recognised within it.
 * - A URI that is well-formed but does not carry GS1 identifier keys is
 *   refused as a Digital Link rather than silently demoted to a plain URL;
 *   it returns a failure with code `not_digital_link`.
 * - A string that is not even a well-formed URI returns a failure with
 *   code `invalid_uri`.
 *
 * The result is a discriminated union so callers can narrow on `success`
 * before reading `payload` or `error`.
 */
export function parsePayload(uri: string): PayloadResult {
  if (!isAbsoluteHttpUri(uri)) {
    return {
      success: false,
      error: {
        message: 'Input is not a well-formed URI.',
        code: 'invalid_uri',
        kind: 'payload_error',
      },
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return {
      success: false,
      error: {
        message: 'Input could not be parsed as a URI.',
        code: 'invalid_uri',
        kind: 'payload_error',
      },
    };
  }

  // The GS1 Digital Link path grammar is "/<key>/<value>(/<key>/<value>)*".
  // Split the path into segments, ignore empty segments and a trailing slash,
  // and require segment pairs to be in (key, value) order.
  const rawSegments = parsed.pathname.split('/');
  const segments: string[] = [];
  for (const segment of rawSegments) {
    if (segment.length > 0) {
      segments.push(decodePathSegment(segment));
    }
  }

  if (segments.length < 2 || segments.length % 2 !== 0) {
    return {
      success: false,
      error: {
        message: 'URI is well-formed but is not a GS1 Digital Link.',
        code: 'not_digital_link',
        kind: 'payload_error',
      },
    };
  }

  const entries: Map<string, string> = new Map();
  for (let i = 0; i < segments.length; i += 2) {
    const key = segments[i];
    const value = segments[i + 1];
    if (key === undefined || value === undefined) {
      return {
        success: false,
        error: {
          message: 'URI is well-formed but is not a GS1 Digital Link.',
          code: 'not_digital_link',
          kind: 'payload_error',
        },
      };
    }
    if (value.length === 0) {
      return {
        success: false,
        error: {
          message: 'GS1 Digital Link path contains an empty identifier value.',
          code: 'not_digital_link',
          kind: 'payload_error',
        },
      };
    }
    // Only accept known GS1 application identifier keys.
    if (!(GS1_IDENTIFIER_KEYS as readonly string[]).includes(key)) {
      return {
        success: false,
        error: {
          message: `Unknown GS1 identifier key "${key}".`,
          code: 'not_digital_link',
          kind: 'payload_error',
        },
      };
    }
    entries.set(key, value);
  }

  const primary = extractPrimary(entries);
  if (primary === null) {
    return {
      success: false,
      error: {
        message: 'GS1 Digital Link is missing a primary product identifier.',
        code: 'missing_identifier',
        kind: 'payload_error',
      },
    };
  }

  const identifierKeys: string[] = Array.from(entries.keys());
  const payload: DigitalLinkPayload = {
    kind: 'gs1_digital_link',
    uri,
    identifierKeys,
    primaryKey: primary.primaryKey,
    primaryValue: primary.primaryValue,
  };
  return { success: true, payload };
}

/**
 * Returns the identifier keys recognised within a Digital Link URI.
 *
 * If the URI is not a well-formed Digital Link, the function returns an
 * empty array rather than throwing; callers wanting the error reason should
 * use `parsePayload` directly.
 */
export function recogniseIdentifierKeys(uri: string): readonly string[] {
  const result = parsePayload(uri);
  if (!result.success) {
    return [];
  }
  if (result.payload.kind !== 'gs1_digital_link') {
    return [];
  }
  return result.payload.identifierKeys;
}

/**
 * Reports the payload kind that would be assigned to a URI string without
 * requiring callers to consume the full payload result.
 */
export function classifyPayloadKind(uri: string): PayloadKind {
  const result = parsePayload(uri);
  if (!result.success) {
    return 'plain_url';
  }
  return result.payload.kind;
}

// --- Classification functions ---

/**
 * Classifies a Digital Link vector as product identity.
 *
 * Any non-empty set of recognised identifier keys is sufficient to count
 * the payload as a product identity payload.
 */
export function isProductIdentityPayload(payload: Payload): boolean {
  if (payload.kind !== 'gs1_digital_link') {
    return false;
  }
  return payload.identifierKeys.length > 0;
}

/**
 * Classifies a URI string for product identity, returning the fixed set of
 * outcomes declared as `PRODUCT_IDENTITY_OUTCOMES`.
 */
export function classifyProductIdentity(uri: string): ProductIdentityClassification {
  const result = parsePayload(uri);
  if (!result.success) {
    return 'not_product_identity';
  }
  if (isProductIdentityPayload(result.payload)) {
    return 'product_identity';
  }
  return 'not_product_identity';
}

// --- Guarded mutation helper ---

/**
 * Records a payload into a state bag only after the audit function
 * approves the payload. The audit function is invoked first; if it throws
 * or returns a failure value, the state bag is left unchanged and the
 * failure (or thrown error) is surfaced to the caller. On approval, a new
 * state bag is returned containing the recorded payload.
 *
 * This makes the "check before mutation" ordering observable.
 */
export interface PayloadState {
  readonly recorded: readonly Payload[];
}

export type AuditOutcome =
  | { readonly success: true }
  | { readonly success: false; readonly reason: string };

export function recordPayloadGuarded<S extends PayloadState>(
  state: S,
  payload: Payload,
  audit: (candidate: Payload) => AuditOutcome
): S | { readonly success: false; readonly reason: string; readonly state: S } {
  let outcome: AuditOutcome;
  try {
    outcome = audit(payload);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Audit threw a non-null value.';
    return { success: false, reason: `Audit threw: ${reason}`, state };
  }

  if (!outcome.success) {
    return { success: false, reason: outcome.reason, state };
  }

  return {
    ...state,
    recorded: [...state.recorded, payload],
  } as S;
}