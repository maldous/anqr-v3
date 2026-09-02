export type PayloadKind = 'gs1_digital_link' | 'plain_url';

// --- Type definitions ---

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

export type PayloadErrorCode = 'invalid_uri' | 'not_digital_link' | 'missing_identifier';

export const PAYLOAD_ERROR_CODES = ['invalid_uri', 'not_digital_link', 'missing_identifier'] as const;

export interface PayloadError {
  readonly message: string;
  readonly code: PayloadErrorCode;
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
  '01',
  '10',
  'lot',
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
  'csp',
  '01',
  '10',
  'lot',
]);

// --- Pure parsing helpers ---

function isAbsoluteHttpUri(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  const lower = value.toLowerCase();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
    return false;
  }
  try {
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

// --- Digital Link contract surface (requirement: productidentitypayloadcontracts) ---

export type DigitalLinkPayloadResult =
  | { readonly success: true; readonly payload: DigitalLinkPayload; readonly identifierKeys: readonly string[] }
  | { readonly success: false; readonly error: PayloadError };

export function parseDigitalLinkPayload(uri: string): DigitalLinkPayloadResult {
  const result = parsePayload(uri);
  if (!result.success) {
    return { success: false, error: result.error };
  }
  if (result.payload.kind !== 'gs1_digital_link') {
    return {
      success: false,
      error: {
        message: 'URI is not a GS1 Digital Link.',
        code: 'not_digital_link',
        kind: 'payload_error',
      },
    };
  }
  return {
    success: true,
    payload: result.payload,
    identifierKeys: result.payload.identifierKeys,
  };
}

export type IdentifierKeysResult =
  | { readonly success: true; readonly keys: readonly string[] }
  | { readonly success: false; readonly error: PayloadError };

export function recogniseDigitalLinkKeys(uri: string): IdentifierKeysResult {
  const result = parseDigitalLinkPayload(uri);
  if (!result.success) {
    return { success: false, error: result.error };
  }
  return { success: true, keys: result.identifierKeys };
}

// --- Plain URL helpers ---

export function isWellFormedUri(uri: string): boolean {
  if (uri.length === 0) {
    return false;
  }
  const lower = uri.toLowerCase();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
    return false;
  }
  try {
    new URL(uri);
    return true;
  } catch {
    return false;
  }
}

export function parsePayloadAllowingPlainUrl(uri: string): PayloadResult {
  if (!isWellFormedUri(uri)) {
    return {
      success: false,
      error: {
        message: 'Input is not a well-formed URI.',
        code: 'invalid_uri',
        kind: 'payload_error',
      },
    };
  }
  return parsePayload(uri);
}

export function classifyPayloadKind(uri: string): PayloadResult {
  return parsePayloadAllowingPlainUrl(uri);
}

// --- Classification functions (requirement: productidentitypayloadvalidation) ---

export type PayloadVector = { readonly uri: string; readonly kind: PayloadKind };

export function isProductIdentityPayload(payload: Payload): boolean {
  return payload.kind === 'gs1_digital_link';
}

export function isProductIdentityPayloadKind(kind: PayloadKind): boolean {
  return kind === 'gs1_digital_link';
}

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

export function classifyProductIdentityKind(kind: PayloadKind): ProductIdentityClassification {
  return isProductIdentityPayloadKind(kind) ? 'product_identity' : 'not_product_identity';
}

export function classifyProductIdentityVector(
  vector: PayloadVector
): ProductIdentityClassification {
  return classifyProductIdentityKind(vector.kind);
}

// --- Error model helpers (requirement: productidentitypayloaderrormodel) ---

export function isPayloadError(value: unknown): value is PayloadError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { kind?: unknown; code?: unknown; message?: unknown };
  return (
    candidate.kind === 'payload_error' &&
    typeof candidate.message === 'string' &&
    typeof candidate.code === 'string' &&
    (PAYLOAD_ERROR_CODES as readonly string[]).includes(candidate.code)
  );
}

export function isNotDigitalLinkError(value: unknown): value is PayloadError {
  return isPayloadError(value) && value.code === 'not_digital_link';
}

export function isInvalidUriError(value: unknown): value is PayloadError {
  return isPayloadError(value) && value.code === 'invalid_uri';
}

export function isMissingIdentifierError(value: unknown): value is PayloadError {
  return isPayloadError(value) && value.code === 'missing_identifier';
}

// --- Guarded mutation helper ---

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

// --- Known Digital Link sample vectors (for contract assertion) ---

export const KNOWN_DIGITAL_LINK_VECTORS: readonly string[] = [
  'https://id.gs1.org/gtin/09506000134352',
  'https://id.example.com/01/09506000134352/10/ABC123',
  'https://resolver.example.org/gtin/09506000134352/lot/ABC?',
] as const;

export const KNOWN_PLAIN_URL_VECTORS: readonly string[] = [
  'https://example.com/products/12345',
  'https://example.org/page?ref=home',
] as const;

// --- Convenience constructors ---

export function makeDigitalLinkPayload(
  uri: string,
  primaryKey: Gs1IdentifierKey,
  primaryValue: string,
  extraPairs: ReadonlyArray<readonly [Gs1IdentifierKey, string]> = []
): DigitalLinkPayload {
  const map: Map<Gs1IdentifierKey, string> = new Map();
  map.set(primaryKey, primaryValue);
  for (const [key, value] of extraPairs) {
    if (value.length > 0) {
      map.set(key, value);
    }
  }
  const identifierKeys: string[] = Array.from(map.keys());
  return {
    kind: 'gs1_digital_link',
    uri,
    identifierKeys,
    primaryKey,
    primaryValue,
  };
}

export function makePlainUrlPayload(uri: string): PlainUrlPayload {
  return { kind: 'plain_url', uri };
}

// --- Recognised identifier keys export (for contract assertion) ---

export const RECOGNISED_DIGITAL_LINK_KEYS: readonly Gs1IdentifierKey[] = GS1_IDENTIFIER_KEYS;

// --- Aggregate contract summary (for requirement: productidentitypayloadcontracts) ---

export type DigitalLinkContractResult =
  | {
      readonly accepted: true;
      readonly payload: DigitalLinkPayload;
      readonly identifierKeys: readonly string[];
    }
  | { readonly accepted: false; readonly error: PayloadError };

export function assertDigitalLinkContract(uri: string): DigitalLinkContractResult {
  const parsed = parseDigitalLinkPayload(uri);
  if (!parsed.success) {
    return { accepted: false, error: parsed.error };
  }
  return {
    accepted: true,
    payload: parsed.payload,
    identifierKeys: parsed.identifierKeys,
  };
}

export function rejectNonDigitalLinkUri(uri: string): boolean {
  const result = parseDigitalLinkPayload(uri);
  return !result.success && isNotDigitalLinkError(result.error);
}

// --- Classification aggregate (for requirement: productidentitypayloadvalidation) ---

export type VectorClassificationResult =
  | {
      readonly kind: 'gs1_digital_link';
      readonly uri: string;
      readonly classification: 'product_identity';
      readonly payload: DigitalLinkPayload;
    }
  | {
      readonly kind: 'plain_url';
      readonly uri: string;
      readonly classification: 'not_product_identity';
      readonly payload: PlainUrlPayload;
    };

export function classifyPayloadVector(uri: string): VectorClassificationResult {
  const parsed = parsePayloadAllowingPlainUrl(uri);
  if (!parsed.success) {
    // Fail-closed default branch: a non-parseable URI cannot be product identity.
    const fallback: PlainUrlPayload = { kind: 'plain_url', uri };
    return {
      kind: 'plain_url',
      uri,
      classification: 'not_product_identity',
      payload: fallback,
    };
  }
  if (parsed.payload.kind === 'gs1_digital_link') {
    return {
      kind: 'gs1_digital_link',
      uri,
      classification: 'product_identity',
      payload: parsed.payload,
    };
  }
  return {
    kind: 'plain_url',
    uri,
    classification: 'not_product_identity',
    payload: parsed.payload,
  };
}

export function isProductIdentityVector(uri: string): boolean {
  return classifyProductIdentity(uri) === 'product_identity';
}

// --- Direct payload-kind classifier for vectors ---

export function classifyVectorByPayloadKind(payload: Payload): ProductIdentityClassification {
  return isProductIdentityPayload(payload) ? 'product_identity' : 'not_product_identity';
}

export function classifyDigitalLinkPayload(payload: DigitalLinkPayload): ProductIdentityClassification {
  return 'product_identity';
}

export function classifyPlainUrlPayload(payload: PlainUrlPayload): ProductIdentityClassification {
  return 'not_product_identity';
}

// --- Vector-based product identity predicate ---

export interface PayloadKindVector {
  readonly kind: PayloadKind;
}

export function isProductIdentityByVectorKind(kind: PayloadKind): boolean {
  return kind === 'gs1_digital_link';
}

export function isProductIdentityByVector(vector: PayloadKindVector): boolean {
  return isProductIdentityByVectorKind(vector.kind);
}

// --- Digital Link vector contract surface ---

export type DigitalLinkVectorClassification =
  | {
      readonly kind: 'gs1_digital_link';
      readonly uri: string;
      readonly classification: 'product_identity';
      readonly payload: DigitalLinkPayload;
      readonly identifierKeys: readonly string[];
    }
  | {
      readonly kind: 'plain_url';
      readonly uri: string;
      readonly classification: 'not_product_identity';
      readonly payload: PlainUrlPayload;
      readonly error: PayloadError;
    };

export function classifyDigitalLinkVector(uri: string): DigitalLinkVectorClassification {
  const parsed = parseDigitalLinkPayload(uri);
  if (parsed.success) {
    return {
      kind: 'gs1_digital_link',
      uri,
      classification: 'product_identity',
      payload: parsed.payload,
      identifierKeys: parsed.identifierKeys,
    };
  }
  // Fail-closed default: a URI that is not a Digital Link is refused as such,
  // not accepted as a plain URL.
  const error = parsed.error;
  return {
    kind: 'plain_url',
    uri,
    classification: 'not_product_identity',
    payload: { kind: 'plain_url', uri },
    error,
  };
}

export function isDigitalLinkVector(uri: string): boolean {
  return classifyDigitalLinkVector(uri).kind === 'gs1_digital_link';
}

export function isProductIdentityDigitalLinkVector(uri: string): boolean {
  return classifyDigitalLinkVector(uri).classification === 'product_identity';
}

export function getDigitalLinkVectorKeys(uri: string): readonly string[] {
  const result = classifyDigitalLinkVector(uri);
  return result.kind === 'gs1_digital_link' ? result.identifierKeys : [];
}

export function getDigitalLinkVectorPayload(uri: string): DigitalLinkPayload | null {
  const result = classifyDigitalLinkVector(uri);
  return result.kind === 'gs1_digital_link' ? result.payload : null;
}

// --- Direct URI-vector classification (requirement: productidentitypayloadvalidation) ---

export type UriVectorClassification =
  | {
      readonly kind: 'gs1_digital_link';
      readonly uri: string;
      readonly classification: 'product_identity';
      readonly payload: DigitalLinkPayload;
      readonly identifierKeys: readonly string[];
    }
  | {
      readonly kind: 'plain_url';
      readonly uri: string;
      readonly classification: 'not_product_identity';
      readonly payload: PlainUrlPayload;
    };

export function classifyUriVector(uri: string): UriVectorClassification {
  const parsed = parsePayloadAllowingPlainUrl(uri);
  if (!parsed.success) {
    const fallback: PlainUrlPayload = { kind: 'plain_url', uri };
    return {
      kind: 'plain_url',
      uri,
      classification: 'not_product_identity',
      payload: fallback,
    };
  }
  if (parsed.payload.kind === 'gs1_digital_link') {
    return {
      kind: 'gs1_digital_link',
      uri,
      classification: 'product_identity',
      payload: parsed.payload,
      identifierKeys: parsed.payload.identifierKeys,
    };
  }
  return {
    kind: 'plain_url',
    uri,
    classification: 'not_product_identity',
    payload: parsed.payload,
  };
}

export function classifyUriVectorKind(uri: string): UriVectorClassification {
  return classifyUriVector(uri);
}

// --- Digital Link URI vector classifier (requirement: productidentitypayloadvalidation) ---
//
// A "vector" here is the literal classification pair: { kind, uri }. A Digital
// Link vector classifies as product identity when and only when the URI parses
// as a GS1 Digital Link with at least one recognised identifier key. A plain
// URL vector (URI that is well-formed but not a Digital Link, or that fails to
// parse at all) is never classified as product identity.

export type DigitalLinkUriVectorClassification =
  | {
      readonly kind: 'gs1_digital_link';
      readonly uri: string;
      readonly classification: 'product_identity';
      readonly payload: DigitalLinkPayload;
      readonly identifierKeys: readonly string[];
    }
  | {
      readonly kind: 'plain_url';
      readonly uri: string;
      readonly classification: 'not_product_identity';
      readonly payload: PlainUrlPayload;
    };

export function classifyDigitalLinkUriVector(uri: string): DigitalLinkUriVectorClassification {
  const parsed = parseDigitalLinkPayload(uri);
  if (parsed.success) {
    return {
      kind: 'gs1_digital_link',
      uri,
      classification: 'product_identity',
      payload: parsed.payload,
      identifierKeys: parsed.identifierKeys,
    };
  }
  // Fail-closed default branch: a non-Digital-Link URI is classified as a
  // plain URL vector with classification "not_product_identity".
  const fallback: PlainUrlPayload = { kind: 'plain_url', uri };
  return {
    kind: 'plain_url',
    uri,
    classification: 'not_product_identity',
    payload: fallback,
  };
}

export function isProductIdentityDigitalLinkUriVector(uri: string): boolean {
  return classifyDigitalLinkUriVector(uri).classification === 'product_identity';
}

// --- Vector-based product identity classifier (requirement: productidentitypayloadvalidation) ---

export type PayloadUriVector = { readonly uri: string; readonly kind: PayloadKind };

export const PRODUCT_IDENTITY_VECTOR_OUTCOMES = ['product_identity', 'not_product_identity'] as const;
export type ProductIdentityVectorOutcome = (typeof PRODUCT_IDENTITY_VECTOR_OUTCOMES)[number];

export type ProductIdentityVectorResult =
  | {
      readonly outcome: 'product_identity';
      readonly vector: PayloadUriVector;
      readonly payload: DigitalLinkPayload;
    }
  | {
      readonly outcome: 'not_product_identity';
      readonly vector: PayloadUriVector;
    };

export function classifyProductIdentityVectorByUri(uri: string): ProductIdentityVectorResult {
  const parsed = parsePayload(uri);
  if (parsed.success && parsed.payload.kind === 'gs1_digital_link') {
    return {
      outcome: 'product_identity',
      vector: { uri, kind: 'gs1_digital_link' },
      payload: parsed.payload,
    };
  }
  return {
    outcome: 'not_product_identity',
    vector: { uri, kind: 'plain_url' },
  };
}

export function isProductIdentityVectorByUri(uri: string): boolean {
  return classifyProductIdentityVectorByUri(uri).outcome === 'product_identity';
}

export function isPlainUrlVectorByUri(uri: string): boolean {
  return classifyProductIdentityVectorByUri(uri).outcome === 'not_product_identity';
}

// --- Direct Digital Link payload kind contract (requirement: productidentitypayloadcontracts) ---

export type DigitalLinkPayloadKind = 'gs1_digital_link';
export const DIGITAL_LINK_PAYLOAD_KIND: DigitalLinkPayloadKind = 'gs1_digital_link';

export type DigitalLinkContractKeysResult =
  | {
      readonly accepted: true;
      readonly uri: string;
      readonly kind: 'gs1_digital_link';
      readonly identifierKeys: readonly string[];
      readonly payload: DigitalLinkPayload;
    }
  | { readonly accepted: false; readonly uri: string; readonly error: PayloadError };

export function recogniseDigitalLinkContract(uri: string): DigitalLinkContractKeysResult {
  const parsed = parseDigitalLinkPayload(uri);
  if (!parsed.success) {
    return { accepted: false, uri, error: parsed.error };
  }
  return {
    accepted: true,
    uri,
    kind: 'gs1_digital_link',
    identifierKeys: parsed.identifierKeys,
    payload: parsed.payload,
  };
}

export function isAcceptedDigitalLinkContract(
  result: DigitalLinkContractKeysResult
): result is { readonly accepted: true; readonly uri: string; readonly kind: 'gs1_digital_link'; readonly identifierKeys: readonly string[]; readonly payload: DigitalLinkPayload } {
  return result.accepted === true;
}

// --- Plain URL vector classifier (requirement: productidentitypayloadvalidation) ---

export type PlainUrlVectorResult =
  | {
      readonly isProductIdentity: false;
      readonly vector: PayloadUriVector;
    };

export function classifyPlainUrlVector(uri: string): PlainUrlVectorResult {
  return {
    isProductIdentity: false,
    vector: { uri, kind: 'plain_url' },
  };
}

// --- Vector kind classifier (requirement: productidentitypayloadvalidation) ---

export type PayloadKindVectorClassification =
  | {
      readonly kind: 'gs1_digital_link';
      readonly isProductIdentity: true;
    }
  | {
      readonly kind: 'plain_url';
      readonly isProductIdentity: false;
    };

export function classifyPayloadKindVector(kind: PayloadKind): PayloadKindVectorClassification {
  if (kind === 'gs1_digital_link') {
    return { kind: 'gs1_digital_link', isProductIdentity: true };
  }
  return { kind: 'plain_url', isProductIdentity: false };
}

// --- Canonical contract surface (requirement: productidentitypayloadcontracts) ---

export type DigitalLinkContractAcceptance =
  | {
      readonly accepted: true;
      readonly kind: 'gs1_digital_link';
      readonly uri: string;
      readonly payload: DigitalLinkPayload;
      readonly identifierKeys: readonly string[];
    }
  | {
      readonly accepted: false;
      readonly kind: 'plain_url';
      readonly uri: string;
      readonly error: PayloadError;
    };

export function acceptDigitalLinkContract(uri: string): DigitalLinkContractAcceptance {
  const parsed = parseDigitalLinkPayload(uri);
  if (parsed.success) {
    return {
      accepted: true,
      kind: 'gs1_digital_link',
      uri,
      payload: parsed.payload,
      identifierKeys: parsed.identifierKeys,
    };
  }
  return {
    accepted: false,
    kind: 'plain_url',
    uri,
    error: parsed.error,
  };
}

export function reportDigitalLinkIdentifierKeys(uri: string): readonly string[] {
  const result = acceptDigitalLinkContract(uri);
  return result.accepted ? result.identifierKeys : [];
}

// --- Canonical validation surface (requirement: productidentitypayloadvalidation) ---

export type DigitalLinkValidationOutcome =
  | {
      readonly classification: 'product_identity';
      readonly kind: 'gs1_digital_link';
      readonly uri: string;
      readonly payload: DigitalLinkPayload;
      readonly identifierKeys: readonly string[];
    }
  | {
      readonly classification: 'not_product_identity';
      readonly kind: 'plain_url';
      readonly uri: string;
    };

export function validateDigitalLinkVector(uri: string): DigitalLinkValidationOutcome {
  const parsed = parseDigitalLinkPayload(uri);
  if (parsed.success) {
    return {
      classification: 'product_identity',
      kind: 'gs1_digital_link',
      uri,
      payload: parsed.payload,
      identifierKeys: parsed.identifierKeys,
    };
  }
  return {
    classification: 'not_product_identity',
    kind: 'plain_url',
    uri,
  };
}

export function validatePlainUrlVector(uri: string): DigitalLinkValidationOutcome {
  return {
    classification: 'not_product_identity',
    kind: 'plain_url',
    uri,
  };
}

// --- Vector-typed product identity classifier (requirement: productidentitypayloadvalidation) ---
//
// A vector is the pair { kind, uri }. A Digital Link vector classifies as
// product identity; a plain URL vector does not.

export type DigitalLinkVectorOutcomeKind = 'gs1_digital_link' | 'plain_url';

export const DIGITAL_LINK_VECTOR_OUTCOMES: readonly DigitalLinkVectorOutcomeKind[] = [
  'gs1_digital_link',
  'plain_url',
] as const;

export type DigitalLinkVectorResult =
  | {
      readonly vectorKind: 'gs1_digital_link';
      readonly uri: string;
      readonly isProductIdentity: true;
      readonly payload: DigitalLinkPayload;
      readonly identifierKeys: readonly string[];
    }
  | {
      readonly vectorKind: 'plain_url';
      readonly uri: string;
      readonly isProductIdentity: false;
      readonly payload: PlainUrlPayload;
    };

export function classifyDigitalLinkVectorByKind(uri: string): DigitalLinkVectorResult {
  const parsed = parseDigitalLinkPayload(uri);
  if (parsed.success) {
    return {
      vectorKind: 'gs1_digital_link',
      uri,
      isProductIdentity: true,
      payload: parsed.payload,
      identifierKeys: parsed.identifierKeys,
    };
  }
  const fallback: PlainUrlPayload = { kind: 'plain_url', uri };
  return {
    vectorKind: 'plain_url',
    uri,
    isProductIdentity: false,
    payload: fallback,
  };
}

export function isDigitalLinkVectorByKind(uri: string): boolean {
  return classifyDigitalLinkVectorByKind(uri).vectorKind === 'gs1_digital_link';
}

export function isProductIdentityVectorByKind(uri: string): boolean {
  return classifyDigitalLinkVectorByKind(uri).isProductIdentity === true;
}

// --- Vector result discriminated by literal field ---
//
// Each variant is discriminated by the literal "classification" field so a
// caller can narrow the union before reading "kind" or "payload".

export type DigitalLinkVectorClassificationResult =
  | {
      readonly classification: 'product_identity';
      readonly kind: 'gs1_digital_link';
      readonly uri: string;
      readonly payload: DigitalLinkPayload;
      readonly identifierKeys: readonly string[];
    }
  | {
      readonly classification: 'not_product_identity';
      readonly kind: 'plain_url';
      readonly uri: string;
      readonly payload: PlainUrlPayload;
    };

export function classifyDigitalLinkVectorResult(uri: string): DigitalLinkVectorClassificationResult {
  const parsed = parseDigitalLinkPayload(uri);
  if (parsed.success) {
    return {
      classification: 'product_identity',
      kind: 'gs1_digital_link',
      uri,
      payload: parsed.payload,
      identifierKeys: parsed.identifierKeys,
    };
  }
  const fallback: PlainUrlPayload = { kind: 'plain_url', uri };
  return {
    classification: 'not_product_identity',
    kind: 'plain_url',
    uri,
    payload: fallback,
  };
}

export function isProductIdentityDigitalLinkVectorResult(
  result: DigitalLinkVectorClassificationResult
): result is {
  readonly classification: 'product_identity';
  readonly kind: 'gs1_digital_link';
  readonly uri: string;
  readonly payload: DigitalLinkPayload;
  readonly identifierKeys: readonly string[];
} {
  return result.classification === 'product_identity';
}

export function isNotProductIdentityDigitalLinkVectorResult(
  result: DigitalLinkVectorClassificationResult
): result is {
  readonly classification: 'not_product_identity';
  readonly kind: 'plain_url';
  readonly uri: string;
  readonly payload: PlainUrlPayload;
} {
  return result.classification === 'not_product_identity';
}

export function reportDigitalLinkVectorIdentifierKeys(
  result: DigitalLinkVectorClassificationResult
): readonly string[] {
  return result.classification === 'product_identity' ? result.identifierKeys : [];
}

// --- Vector-typed contract surface (requirement: productidentitypayloadcontracts) ---

export type DigitalLinkVectorContractResult =
  | {
      readonly accepted: true;
      readonly vectorKind: 'gs1_digital_link';
      readonly uri: string;
      readonly payload: DigitalLinkPayload;
      readonly identifierKeys: readonly string[];
    }
  | {
      readonly accepted: false;
      readonly vectorKind: 'plain_url';
      readonly uri: string;
      readonly error: PayloadError;
    };

export function acceptDigitalLinkVector(uri: string): DigitalLinkVectorContractResult {
  const parsed = parseDigitalLinkPayload(uri);
  if (parsed.success) {
    return {
      accepted: true,
      vectorKind: 'gs1_digital_link',
      uri,
      payload: parsed.payload,
      identifierKeys: parsed.identifierKeys,
    };
  }
  return {
    accepted: false,
    vectorKind: 'plain_url',
    uri,
    error: parsed.error,
  };
}

export function reportDigitalLinkVectorKeys(uri: string): readonly string[] {
  const result = acceptDigitalLinkVector(uri);
  return result.accepted ? result.identifierKeys : [];
}

// --- Digital Link vector classifier (requirement: productidentitypayloadvalidation) ---
//
// The Digital Link payload kind is accepted by its canonical surface; a vector
// with kind "plain_url" is never accepted.

export type DigitalLinkVectorKind = 'gs1_digital_link' | 'plain_url';

export const DIGITAL_LINK_VECTOR_KINDS: readonly DigitalLinkVectorKind[] = [
  'gs1_digital_link',
  'plain_url',
] as const;

export type DigitalLinkVectorKindResult =
  | {
      readonly vectorKind: 'gs1_digital_link';
      readonly uri: string;
      readonly classification: 'product_identity';
      readonly payload: DigitalLinkPayload;
      readonly identifierKeys: readonly string[];
    }
  | {
      readonly vectorKind: 'plain_url';
      readonly uri: string;
      readonly classification: 'not_product_identity';
      readonly payload: PlainUrlPayload;
    };

export function classifyDigitalLinkVectorKind(uri: string): DigitalLinkVectorKindResult {
  const parsed = parsePayloadAllowingPlainUrl(uri);
  if (!parsed.success) {
    const fallback: PlainUrlPayload = { kind: 'plain_url', uri };
    return {
      vectorKind: 'plain_url',
      uri,
      classification: 'not_product_identity',
      payload: fallback,
    };
  }
  if (parsed.payload.kind === 'gs1_digital_link') {
    return {
      vectorKind: 'gs1_digital_link',
      uri,
      classification: 'product_identity',
      payload: parsed.payload,
      identifierKeys: parsed.payload.identifierKeys,
    };
  }
  return {
    vectorKind: 'plain_url',
    uri,
    classification: 'not_product_identity',
    payload: parsed.payload,
  };
}

export function isDigitalLinkVectorByKindKind(uri: string): boolean {
  return classifyDigitalLinkVectorKind(uri).vectorKind === 'gs1_digital_link';
}

export function isProductIdentityVectorByKindKind(uri: string): boolean {
  return classifyDigitalLinkVectorKind(uri).classification === 'product_identity';
}

// --- Vector validation result (requirement: productidentitypayloadvalidation) ---

export type DigitalLinkVectorValidationResult =
  | {
      readonly isAccepted: true;
      readonly vectorKind: 'gs1_digital_link';
      readonly uri: string;
      readonly classification: 'product_identity';
      readonly payload: DigitalLinkPayload;
      readonly identifierKeys: readonly string[];
    }
  | {
      readonly isAccepted: false;
      readonly vectorKind: 'plain_url';
      readonly uri: string;
      readonly classification: 'not_product_identity';
      readonly payload: PlainUrlPayload;
    };

export function validateDigitalLinkVectorKind(uri: string): DigitalLinkVectorValidationResult {
  const parsed = parsePayloadAllowingPlainUrl(uri);
  if (!parsed.success) {
    const fallback: PlainUrlPayload = { kind: 'plain_url', uri };
    return {
      isAccepted: false,
      vectorKind: 'plain_url',
      uri,
      classification: 'not_product_identity',
      payload: fallback,
    };
  }
  if (parsed.payload.kind === 'gs1_digital_link') {
    return {
      isAccepted: true,
      vectorKind: 'gs1_digital_link',
      uri,
      classification: 'product_identity',
      payload: parsed.payload,
      identifierKeys: parsed.payload.identifierKeys,
    };
  }
  return {
    isAccepted: false,
    vectorKind: 'plain_url',
    uri,
    classification: 'not_product_identity',
    payload: parsed.payload,
  };
}

export function isAcceptedDigitalLinkVectorKind(uri: string): boolean {
  return validateDigitalLinkVectorKind(uri).isAccepted === true;
}

export function isProductIdentityDigitalLinkVectorKind(uri: string): boolean {
  return validateDigitalLinkVectorKind(uri).classification === 'product_identity';
}

export function isPlainUrlDigitalLinkVectorKind(uri: string): boolean {
  return validateDigitalLinkVectorKind(uri).vectorKind === 'plain_url';
}

// --- Vector result via parsePayloadAllowingPlainUrl (requirement: productidentitypayloadvalidation) ---

export type DigitalLinkVectorParseResult =
  | {
      readonly vectorKind: 'gs1_digital_link';
      readonly uri: string;
      readonly isProductIdentity: true;
      readonly payload: DigitalLinkPayload;
      readonly identifierKeys: readonly string[];
    }
  | {
      readonly vectorKind: 'plain_url';
      readonly uri: string;
      readonly isProductIdentity: false;
      readonly payload: PlainUrlPayload;
    };

export function parseDigitalLinkVector(uri: string): DigitalLinkVectorParseResult {
  const parsed = parsePayloadAllowingPlainUrl(uri);
  if (!parsed.success) {
    const fallback: PlainUrlPayload = { kind: 'plain_url', uri };
    return {
      vectorKind: 'plain_url',
      uri,
      isProductIdentity: false,
      payload: fallback,
    };
  }
  if (parsed.payload.kind === 'gs1_digital_link') {
    return {
      vectorKind: 'gs1_digital_link',
      uri,
      isProductIdentity: true,
      payload: parsed.payload,
      identifierKeys: parsed.payload.identifierKeys,
    };
  }
  return {
    vectorKind: 'plain_url',
    uri,
    isProductIdentity: false,
    payload: parsed.payload,
  };
}

export function isProductIdentityDigitalLinkVectorParse(uri: string): boolean {
  return parseDigitalLinkVector(uri).isProductIdentity === true;
}

export function isDigitalLinkVectorParse(uri: string): boolean {
  return parseDigitalLinkVector(uri).vectorKind === 'gs1_digital_link';
}

export function getDigitalLinkVectorParseKeys(uri: string): readonly string[] {
  const result = parseDigitalLinkVector(uri);
  return result.vectorKind === 'gs1_digital_link' ? result.identifierKeys : [];
}

export function getDigitalLinkVectorParsePayload(uri: string): DigitalLinkPayload | null {
  const result = parseDigitalLinkVector(uri);
  return result.vectorKind === 'gs1_digital_link' ? result.payload : null;
}