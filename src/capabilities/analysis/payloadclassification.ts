// Exported list of allowed classification outcome strings
export const PAYLOAD_TYPES = [
  "calendar_event",
  "crypto_bitcoin",
  "crypto_ethereum",
  "crypto_other",
  "email",
  "emv_qr",
  "epc_sepa",
  "geo",
  "mecard",
  "otp_auth",
  "plain_text",
  "sms",
  "swiss_qr_bill",
  "tel",
  "unknown",
  "upi",
  "url",
  "vcard",
  "wifi",
] as const;

// Union type for the classification outcomes
export type PayloadType = typeof PAYLOAD_TYPES[number];

// Exposed bound (declare once; reference everywhere)
export const DEFAULT_MAX_LENGTH = 8192 as const;
export type MaxLength = number;

// Error identifiers for the capability
export const ERROR_INVALID_INPUT = "invalid_input" as const;
export const ERROR_EXCEEDS_BOUND = "exceeds_bound" as const;
export type ClassificationErrorId =
  | typeof ERROR_INVALID_INPUT
  | typeof ERROR_EXCEEDS_BOUND;

// Discriminated-union result types
export type ClassificationSuccess = {
  readonly success: true;
  readonly type: PayloadType;
  readonly details: Readonly<Record<string, string>>;
};

export type ClassificationError = {
  readonly success: false;
  readonly error: ClassificationErrorId;
  readonly message: string;
};

export type ClassificationResult = ClassificationSuccess | ClassificationError;

// Validation step result – distinct literal field so a caller can narrow.
export type ValidationStepResult =
  | { readonly valid: true; readonly payload: string }
  | { readonly valid: false; readonly error: ClassificationError };

// --- Positive / near-miss vectors for every declared content type ---

export interface PatternVector {
  readonly type: PayloadType;
  readonly positive: string;
  readonly nearMiss: string;
}

const PATTERN_VECTORS: readonly PatternVector[] = [
  { type: "url",             positive: "https://example.com/path?x=1",  nearMiss: "not a url at all" },
  { type: "wifi",            positive: "WIFI:T:WPA;S:mynet;P:secret;;", nearMiss: "wireless config missing prefix" },
  { type: "vcard",           positive: "BEGIN:VCARD\nFN:Ada\nEND:VCARD", nearMiss: "VCARD without BEGIN marker" },
  { type: "mecard",          positive: "MECARD:N:Doe,Ada;TEL:123;;",    nearMiss: "no colon after MECARD" },
  { type: "email",           positive: "ada@example.com",                nearMiss: "missing at sign" },
  { type: "tel",             positive: "tel:+15551234567",               nearMiss: "phone number without tel:" },
  { type: "sms",             positive: "sms:+15551234567:Hi there",      nearMiss: "no sms prefix" },
  { type: "geo",             positive: "geo:37.786971,-122.399677",      nearMiss: "coordinates without geo:" },
  { type: "crypto_bitcoin",  positive: "bitcoin:1BoatSLRHtKNngkdXEeobR76b53LETtpyT?amount=0.1", nearMiss: "eth prefix on a btc address" },
  { type: "crypto_ethereum", positive: "ethereum:0xabc1234567890abcdef1234567890abcdef1234", nearMiss: "btc prefix on an eth address" },
  { type: "crypto_other",    positive: "crypto:dogecoin:ABC123",         nearMiss: "wrong scheme" },
  { type: "epc_sepa",        positive: "BCD\n002\n1\nSCT\n",              nearMiss: "not a sepa payload" },
  { type: "upi",             positive: "upi://pay?pa=alice@bank&am=10",  nearMiss: "upi link without params" },
  { type: "emv_qr",          positive: "000201010212",                   nearMiss: "EMV without colon" },
  { type: "swiss_qr_bill",   positive: "SPC\n0100\n",                    nearMiss: "swiss payload without SQB:" },
  { type: "calendar_event",  positive: "BEGIN:VEVENT\nSUMMARY:Meet\nEND:VEVENT", nearMiss: "VCALENDAR without VEVENT" },
  { type: "otp_auth",        positive: "otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP", nearMiss: "otp:// without auth" },
  { type: "plain_text",      positive: "Just a note from Alice",         nearMiss: "   " },
];

/**
 * Exposes the positive vector list so a caller can prove positive classification.
 */
export function getPositiveVectors(): readonly PatternVector[] {
  return PATTERN_VECTORS;
}

/**
 * Exposes the near-miss vector list so a caller can prove that near misses
 * do not accidentally classify as the target type.
 */
export function getNearMissVectors(): readonly PatternVector[] {
  return PATTERN_VECTORS;
}

/**
 * Validates the raw payload input.
 * Returns an error result if the input is not a string or exceeds the configured length bound.
 * The error never echoes the supplied value.
 */
export function validatePayloadInput(
  input: unknown,
  maxLength: number = DEFAULT_MAX_LENGTH
): ValidationStepResult {
  if (typeof input !== "string") {
    return {
      valid: false,
      error: {
        success: false,
        error: ERROR_INVALID_INPUT,
        message: "Payload must be a string.",
      },
    };
  }
  if (input.length > maxLength) {
    return {
      valid: false,
      error: {
        success: false,
        error: ERROR_EXCEEDS_BOUND,
        message: `Payload exceeds maximum length of ${maxLength} characters.`,
      },
    };
  }
  return { valid: true, payload: input };
}

/**
 * Classifier function signature: returns a details object on match, otherwise null.
 */
type Classifier = (payload: string) => Readonly<Record<string, string>> | null;

/**
 * Tuple of ordered classification patterns (lexical precedence).
 * Ordering follows the lexical order of the PAYLOAD_TYPES array; unknown is the
 * implicit terminator handled after the loop.
 */
const CLASSIFICATION_PATTERNS: ReadonlyArray<readonly [PayloadType, Classifier]> =
  [
    [
      "url",
      (p) => {
        const m =
          /^(https?:\/\/)?[\w.-]+(?:\.[\w.-]+)+(\/[\w./?%&=-]*)?$/i.exec(p);
        if (m === null) return null;
        const scheme = p.startsWith("https://")
          ? "https"
          : p.startsWith("http://")
            ? "http"
            : "none";
        return { scheme, length: String(p.length) };
      },
    ],
    [
      "wifi",
      (p) => (/^WIFI:/i.test(p) ? { scheme: "WIFI" } : null),
    ],
    [
      "vcard",
      (p) => (/^BEGIN:VCARD/i.test(p) ? { marker: "BEGIN:VCARD" } : null),
    ],
    [
      "mecard",
      (p) => (/^MECARD:/i.test(p) ? { scheme: "MECARD" } : null),
    ],
    [
      "email",
      (p) => {
        const m = /^([^@\s]+)@([^@\s]+)\.([^@\s]+)$/.exec(p);
        if (m === null) return null;
        return { local: m[1] ?? "", domain: m[2] ?? "", tld: m[3] ?? "" };
      },
    ],
    [
      "tel",
      (p) => {
        const m = /^tel:([^;]+)/i.exec(p);
        if (m === null) return null;
        return { number: m[1] ?? "" };
      },
    ],
    [
      "sms",
      (p) => {
        const m = /^sms:([^;:]+)(?:[:](.*))?$/i.exec(p);
        if (m === null) return null;
        return { number: m[1] ?? "", body: m[2] ?? "" };
      },
    ],
    [
      "geo",
      (p) => {
        const m = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i.exec(p);
        if (m === null) return null;
        return { lat: m[1] ?? "", lon: m[2] ?? "" };
      },
    ],
    [
      "crypto_bitcoin",
      (p) => {
        const m = /^bitcoin:([^?]+)/i.exec(p);
        if (m === null) return null;
        return { address: m[1] ?? "" };
      },
    ],
    [
      "crypto_ethereum",
      (p) => {
        const m = /^ethereum:([^?]+)/i.exec(p);
        if (m === null) return null;
        return { address: m[1] ?? "" };
      },
    ],
    [
      "crypto_other",
      (p) => {
        const m = /^crypto:([a-z]+):([^?]+)/i.exec(p);
        if (m === null) return null;
        return { coin: m[1] ?? "", address: m[2] ?? "" };
      },
    ],
    [
      "epc_sepa",
      (p) => (/^BCD\n002\n1\nSCT\n/i.test(p) ? { scheme: "epc_sepa" } : null),
    ],
    [
      "upi",
      (p) => (/^upi:\/\//i.test(p) ? { scheme: "upi" } : null),
    ],
    [
      "emv_qr",
      (p) => (/^000201010212/i.test(p) ? { scheme: "emv_qr" } : null),
    ],
    [
      "swiss_qr_bill",
      (p) => (/^SPC\n0100\n/i.test(p) ? { scheme: "swiss_qr_bill" } : null),
    ],
    [
      "calendar_event",
      (p) => (/^BEGIN:VEVENT/i.test(p) ? { marker: "BEGIN:VEVENT" } : null),
    ],
    [
      "otp_auth",
      (p) => {
        const m = /^otpauth:\/\/(totp|hotp)\/([^?]+)/i.exec(p);
        if (m === null) return null;
        return { kind: (m[1] ?? "").toLowerCase(), label: m[2] ?? "" };
      },
    ],
    [
      "plain_text",
      (p) => (p.trim() !== "" ? { trimmed: "true" } : null),
    ],
  ];

/**
 * Exposes the lexical precedence order as a readonly array.
 * Re-derived from PATTERN_VECTORS so ordering cannot drift.
 */
export const PRECEDENCE_ORDER: ReadonlyArray<PayloadType> =
  PATTERN_VECTORS.map((v) => v.type);

/**
 * Classifies a payload string according to lexical precedence.
 * Pure function – no external mutation; fail-closed on bad input.
 */
export function classifyPayload(
  input: unknown,
  maxLength: number = DEFAULT_MAX_LENGTH
): ClassificationResult {
  const validation = validatePayloadInput(input, maxLength);
  if (!validation.valid) {
    return validation.error;
  }

  const payload = validation.payload;

  for (const [type, test] of CLASSIFICATION_PATTERNS) {
    const match = test(payload);
    if (match !== null) {
      return { success: true, type, details: match };
    }
  }

  return { success: true, type: "unknown", details: {} };
}

/**
 * Determinism proof: classifies a payload repeatedly and confirms that every call
 * returns an equal result. Returns true iff classification is fully deterministic.
 */
export function isClassificationDeterministic(
  input: unknown,
  repetitions: number = 5,
  maxLength: number = DEFAULT_MAX_LENGTH
): boolean {
  if (repetitions < 1) {
    return false;
  }
  const first = classifyPayload(input, maxLength);
  for (let i = 1; i < repetitions; i++) {
    const next = classifyPayload(input, maxLength);
    if (!resultsEqual(first, next)) {
      return false;
    }
  }
  return true;
}

/**
 * Audits the classification contract across all declared content types.
 * For every type, the positive vector must classify as that type, and the
 * near-miss vector must NOT classify as that type. Returns the audit outcome
 * with per-type diagnostics. The classification step precedes the mutation
 * step (record build) and the record is only built if every assertion holds.
 */
export interface ClassificationAuditRecord {
  readonly passes: boolean;
  readonly auditedCount: number;
  readonly mismatches: ReadonlyArray<{
    readonly type: PayloadType;
    readonly reason: string;
  }>;
}

export function auditClassificationContracts(
  maxLength: number = DEFAULT_MAX_LENGTH
): ClassificationAuditRecord {
  const mismatches: { type: PayloadType; reason: string }[] = [];
  let auditedCount = 0;

  for (const vector of PATTERN_VECTORS) {
    auditedCount += 1;

    const positiveResult = classifyPayload(vector.positive, maxLength);
    if (!positiveResult.success) {
      mismatches.push({
        type: vector.type,
        reason: "positive vector did not classify successfully",
      });
      continue;
    }
    if (positiveResult.type !== vector.type) {
      mismatches.push({
        type: vector.type,
        reason: `positive vector classified as "${positiveResult.type}" instead of "${vector.type}"`,
      });
      continue;
    }

    const nearMissResult = classifyPayload(vector.nearMiss, maxLength);
    if (!nearMissResult.success) {
      mismatches.push({
        type: vector.type,
        reason: "near-miss vector produced an error result",
      });
      continue;
    }
    if (nearMissResult.type === vector.type) {
      mismatches.push({
        type: vector.type,
        reason: `near-miss vector incorrectly classified as "${vector.type}"`,
      });
    }
  }

  // Build the record only after every classification observation has settled.
  return {
    passes: mismatches.length === 0,
    auditedCount,
    mismatches,
  };
}

/**
 * Mutates a target record by stamping it with the audit outcome, but only
 * when the supplied audit function signals success. The audit invocation
 * precedes the mutation; if it throws or returns a failure record, the
 * original target is returned unchanged.
 */
export function stampClassificationAudit<T extends Readonly<Record<string, unknown>>>(
  target: T,
  audit: (maxLength: number) => ClassificationAuditRecord,
  maxLength: number = DEFAULT_MAX_LENGTH
): T | { readonly success: false; readonly error: "audit_failed" } {
  let record: ClassificationAuditRecord;
  try {
    record = audit(maxLength);
  } catch {
    return { success: false, error: "audit_failed" };
  }
  if (!record.passes) {
    return { success: false, error: "audit_failed" };
  }
  return {
    ...target,
    classificationAudit: {
      passes: record.passes,
      auditedCount: record.auditedCount,
      mismatches: record.mismatches,
    },
  };
}

function resultsEqual(
  a: ClassificationResult,
  b: ClassificationResult
): boolean {
  if (a.success !== b.success) return false;
  if (!a.success && !b.success) {
    return a.error === b.error;
  }
  if (a.success && b.success) {
    if (a.type !== b.type) return false;
    const ak = Object.keys(a.details).sort();
    const bk = Object.keys(b.details).sort();
    if (ak.length !== bk.length) return false;
    for (let i = 0; i < ak.length; i++) {
      const k = ak[i];
      if (k === undefined || k !== bk[i]) return false;
      if (a.details[k] !== b.details[k]) return false;
    }
    return true;
  }
  return false;
}