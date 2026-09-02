// paymentpayloadrepresentation.ts
// Capability module for payment payload representation in the ANQR product.

// --- Type definitions ---

export type PaymentKind =
  | 'epc_sepa'
  | 'upi'
  | 'paynow'
  | 'promptpay'
  | 'pix'
  | 'swiss_qr_bill'
  | 'qris'
  | 'duitnow'
  | 'bharatqr'
  | 'vietqr'
  | 'qrph'
  | 'twqr'
  | 'hkqr'
  | 'jpqr'
  | 'auspaynet'
  | 'emv_generic'
  | 'crypto'
  | 'lightning'
  | 'ethereum_eip681'
  | 'paypal_me'
  | 'cashapp';

export interface SchemeVector {
  readonly scheme: PaymentKind;
  readonly representative: string;
  readonly classification: string;
}

export interface SchemeRegistry {
  readonly schemes: ReadonlyMap<PaymentKind, SchemeVector>;
}

export interface PaymentField {
  readonly name: string;
  readonly value: string;
}

export interface PaymentPayload {
  readonly scheme: PaymentKind;
  readonly fields: readonly PaymentField[];
}

export interface PayloadRepresentationError {
  readonly kind: 'field_required' | 'unverified_scheme' | 'unsupported_scheme' | 'format_error';
  readonly scheme: PaymentKind;
  readonly field?: string;
  readonly message: string;
}

export type ValidationResult =
  | { readonly success: true; readonly payload: PaymentPayload }
  | { readonly success: false; readonly error: PayloadRepresentationError };

export type ConformanceResult =
  | { readonly success: true; readonly scheme: PaymentKind; readonly claim: string }
  | { readonly success: false; readonly error: PayloadRepresentationError };

export type FormatResult =
  | { readonly success: true; readonly formatted: string }
  | { readonly success: false; readonly error: PayloadRepresentationError };

// --- Constants ---

export const DECLARED_PAYMENT_KINDS: readonly PaymentKind[] = [
  'epc_sepa',
  'upi',
  'paynow',
  'promptpay',
  'pix',
  'swiss_qr_bill',
  'qris',
  'duitnow',
  'bharatqr',
  'vietqr',
  'qrph',
  'twqr',
  'hkqr',
  'jpqr',
  'auspaynet',
  'emv_generic',
  'crypto',
  'lightning',
  'ethereum_eip681',
  'paypal_me',
  'cashapp',
] as const;

// --- Required fields per scheme (the canonical "what must be present") ---

const REQUIRED_FIELDS: ReadonlyMap<PaymentKind, readonly string[]> = new Map([
  ['epc_sepa', ['iban', 'beneficiary', 'amount']],
  ['upi', ['pa', 'pn', 'am']],
  ['paynow', ['payee', 'amount']],
  ['promptpay', ['promptpay_id', 'amount']],
  ['pix', ['pix_key', 'merchant', 'amount']],
  ['swiss_qr_bill', ['iban', 'creditor', 'amount']],
  ['qris', ['merchant_id', 'amount']],
  ['duitnow', ['duitnow_id', 'amount']],
  ['bharatqr', ['merchant_id', 'amount']],
  ['vietqr', ['bank_code', 'account', 'amount']],
  ['qrph', ['merchant_id', 'amount']],
  ['twqr', ['merchant_id', 'amount']],
  ['hkqr', ['merchant_id', 'amount']],
  ['jpqr', ['merchant_id', 'amount']],
  ['auspaynet', ['bsb', 'account', 'amount']],
  ['emv_generic', ['merchant_id', 'amount']],
  ['crypto', ['address', 'amount']],
  ['lightning', ['lnurl', 'amount']],
  ['ethereum_eip681', ['address', 'chain_id']],
  ['paypal_me', ['handle']],
  ['cashapp', ['handle', 'amount']],
]);

// --- Registry factory ---

/**
 * Returns a registry with no schemes registered. Pure: builds a new registry each call.
 */
export function createSchemeRegistry(): SchemeRegistry {
  return { schemes: new Map() };
}

/**
 * Adds a scheme vector to the registry. The mutation is gated on the audit
 * function returning success. If the audit throws or returns a failure, the
 * registry is left unchanged (fail-closed, observable ordering).
 */
export function registerScheme(
  registry: SchemeRegistry,
  vector: SchemeVector,
  audit: (v: SchemeVector) => { readonly success: boolean; readonly reason?: string }
): SchemeRegistry {
  // Audit FIRST. If the audit throws, the catch block returns the original registry.
  let auditResult: { readonly success: boolean; readonly reason?: string };
  try {
    auditResult = audit(vector);
  } catch (_e) {
    return registry; // Fail-closed: do not mutate.
  }
  if (!auditResult.success) {
    return registry; // Fail-closed: do not mutate.
  }
  // Only now do we mutate: build a new map with the entry added.
  const newMap = new Map(registry.schemes);
  newMap.set(vector.scheme, vector);
  return { schemes: newMap };
}

/**
 * Looks up a scheme in the registry. Returns the vector if present, otherwise null.
 */
export function lookupScheme(
  registry: SchemeRegistry,
  kind: PaymentKind
): SchemeVector | null {
  const found = registry.schemes.get(kind);
  if (found === undefined) {
    return null;
  }
  return found;
}

// --- Validation ---

/**
 * Validates a payment payload. Each scheme declares a set of required fields;
 * a missing field is reported by name and scheme, without echoing the value.
 * Returns a discriminated union: success with the payload, or failure with
 * a structured error.
 */
export function validatePayload(payload: PaymentPayload): ValidationResult {
  const required = REQUIRED_FIELDS.get(payload.scheme);
  if (required === undefined) {
    return {
      success: false,
      error: {
        kind: 'unsupported_scheme',
        scheme: payload.scheme,
        message: `Scheme "${payload.scheme}" is not a declared payment kind.`,
      },
    };
  }

  const present = new Set<string>();
  for (const f of payload.fields) {
    present.add(f.name);
  }

  for (const fieldName of required) {
    if (!present.has(fieldName)) {
      return {
        success: false,
        error: {
          kind: 'field_required',
          scheme: payload.scheme,
          field: fieldName,
          // Note: the field name is named, but no value is echoed.
          message: `Scheme "${payload.scheme}" requires field "${fieldName}" which is absent.`,
        },
      };
    }
  }

  return { success: true, payload };
}

// --- Conformance ---

/**
 * Asserts conformance to a published national standard. Conformance is claimed
 * only when a vector derived from that published standard is present in the
 * registry. Lexical plausibility of an arbitrary string is never conformance.
 * The "derived from" check is gated by the audit: it must confirm that the
 * stored vector is traceable to a published standard.
 */
export function assertConformance(
  registry: SchemeRegistry,
  kind: PaymentKind,
  audit: (v: SchemeVector) => { readonly success: boolean; readonly reason?: string }
): ConformanceResult {
  const vector = registry.schemes.get(kind);
  if (vector === undefined) {
    return {
      success: false,
      error: {
        kind: 'unverified_scheme',
        scheme: kind,
        message: `Scheme "${kind}" has no vector in the registry and cannot be claimed as conformant.`,
      },
    };
  }
  let auditResult: { readonly success: boolean; readonly reason?: string };
  try {
    auditResult = audit(vector);
  } catch (_e) {
    return {
      success: false,
      error: {
        kind: 'unverified_scheme',
        scheme: kind,
        message: `Scheme "${kind}" audit threw; conformance claim is refused.`,
      },
    };
  }
  if (!auditResult.success) {
    return {
      success: false,
      error: {
        kind: 'unverified_scheme',
        scheme: kind,
        message: `Scheme "${kind}" has no vector derived from a published standard; lexical plausibility is not conformance.`,
      },
    };
  }
  return { success: true, scheme: kind, claim: `Conformance to published standard for "${kind}" is established by registered vector.` };
}

// --- Format ---

/**
 * Formats a payment payload. This function takes no identity and stores nothing;
 * the payload is treated as confidential input and is not retained beyond this
 * call. Returns a discriminated union. The mutation-on-success ordering is
 * observable: if the audit throws or returns failure, no formatted output is
 * returned.
 */
export function formatPayload(
  payload: PaymentPayload,
  audit: (p: PaymentPayload) => { readonly success: boolean; readonly reason?: string }
): FormatResult {
  let auditResult: { readonly success: boolean; readonly reason?: string };
  try {
    auditResult = audit(payload);
  } catch (_e) {
    return {
      success: false,
      error: {
        kind: 'format_error',
        scheme: payload.scheme,
        message: `Format audit threw for scheme "${payload.scheme}"; formatting refused.`,
      },
    };
  }
  if (!auditResult.success) {
    return {
      success: false,
      error: {
        kind: 'format_error',
        scheme: payload.scheme,
        message: `Format audit refused for scheme "${payload.scheme}"; formatting refused.`,
      },
    };
  }

  // Build a representation. The payload is not stored; only a local string is produced.
  const parts: string[] = [];
  for (const f of payload.fields) {
    parts.push(`${f.name}=${f.value}`);
  }
  const formatted = `${payload.scheme}|${parts.join('&')}`;
  return { success: true, formatted };
}

// --- Reporting ---

/**
 * Returns a list of schemes that are reported as unverified (not present in
 * the registry, or present but lacking both a representative vector and a
 * classification vector). The "unverified" set must not be presented as
 * supported.
 */
export function reportUnverified(registry: SchemeRegistry): readonly PaymentKind[] {
  const unverified: PaymentKind[] = [];
  for (const kind of DECLARED_PAYMENT_KINDS) {
    const v = registry.schemes.get(kind);
    if (v === undefined) {
      unverified.push(kind);
      continue;
    }
    if (!v.representative || v.representative.trim() === '') {
      unverified.push(kind);
      continue;
    }
    if (!v.classification || v.classification.trim() === '') {
      unverified.push(kind);
      continue;
    }
  }
  return unverified;
}

/**
 * Returns a list of schemes that carry both a representative vector and a
 * classification vector. These may be presented as supported.
 */
export function reportSupported(registry: SchemeRegistry): readonly PaymentKind[] {
  const supported: PaymentKind[] = [];
  for (const kind of DECLARED_PAYMENT_KINDS) {
    const v = registry.schemes.get(kind);
    if (v === undefined) {
      continue;
    }
    if (!v.representative || v.representative.trim() === '') {
      continue;
    }
    if (!v.classification || v.classification.trim() === '') {
      continue;
    }
    supported.push(kind);
  }
  return supported;
}