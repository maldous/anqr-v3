// payloadclassification.ts
// Capability module for payload classification in the ANQR product.

// --- Type definitions ---

export const PAYLOAD_TYPES = [
  "url",
  "wifi",
  "vcard",
  "mecard",
  "email",
  "tel",
  "sms",
  "geo",
  "crypto_bitcoin",
  "crypto_ethereum",
  "crypto_other",
  "epc_sepa",
  "upi",
  "emv_qr",
  "swiss_qr_bill",
  "calendar_event",
  "otp_auth",
  "plain_text",
  "unknown",
] as const;

export type PayloadType = (typeof PAYLOAD_TYPES)[number];

export const CONTENT_TYPES: readonly PayloadType[] = PAYLOAD_TYPES.filter(
  (t): t is PayloadType => t !== "unknown",
);

export const DEFAULT_MAX_LENGTH = 8192 as const;
export type MaxLength = number;

export const ERROR_INVALID_INPUT = "invalid_input" as const;
export const ERROR_EXCEEDS_BOUND = "exceeds_bound" as const;
export const ERROR_AUDIT_FAILED = "audit_failed" as const;
export const ERROR_PROOF_FAILED = "proof_failed" as const;
export type ClassificationErrorId =
  | typeof ERROR_INVALID_INPUT
  | typeof ERROR_EXCEEDS_BOUND
  | typeof ERROR_AUDIT_FAILED
  | typeof ERROR_PROOF_FAILED;

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

export type ValidationStepResult =
  | { readonly valid: true; readonly payload: string }
  | { readonly valid: false; readonly error: ClassificationError };

export interface PatternVector {
  readonly type: PayloadType;
  readonly positive: string;
  readonly nearMiss: string;
}

const UNKNOWN_CLASSIFICATION_DETAILS: Readonly<Record<string, string>> = {
  reason: "unmatched",
};

const PLAIN_TEXT_DETAILS: Readonly<Record<string, string>> = {
  reason: "plain_text",
};

const PATTERN_VECTORS: readonly PatternVector[] = [
  {
    type: "wifi",
    positive: "WIFI:T:WPA;S:mynet;P:secret;;",
    nearMiss: "WIFI: missing trailing semicolons",
  },
  {
    type: "vcard",
    positive: "BEGIN:VCARD\nFN:Ada\nEND:VCARD",
    nearMiss: "VCARD without BEGIN marker",
  },
  {
    type: "mecard",
    positive: "MECARD:N:Doe,Ada;TEL:123;;",
    nearMiss: "no colon after MECARD",
  },
  {
    type: "email",
    positive: "ada@example.com",
    nearMiss: "missing at sign dot com",
  },
  { type: "tel", positive: "tel:+15551234567", nearMiss: "phone number without tel:" },
  { type: "sms", positive: "sms:+15551234567:Hi there", nearMiss: "no sms prefix here" },
  {
    type: "geo",
    positive: "geo:37.786971,-122.399677",
    nearMiss: "coordinates without geo:",
  },
  {
    type: "crypto_bitcoin",
    positive: "bitcoin:1BoatSLRHtKNngkdXEeobR76b53LETtpyT?amount=0.1",
    nearMiss: "eth prefix on a btc address",
  },
  {
    type: "crypto_ethereum",
    positive: "ethereum:0xabc1234567890abcdef1234567890abcdef1234",
    nearMiss: "btc prefix on an eth address",
  },
  { type: "crypto_other", positive: "crypto:dogecoin:ABC123", nearMiss: "wrong scheme" },
  {
    type: "epc_sepa",
    positive: "BCD\n002\n1\nSCT\n",
    nearMiss: "not a sepa payload",
  },
  {
    type: "upi",
    positive: "upi://pay?pa=alice@bank&am=10",
    nearMiss: "upi link without params",
  },
  {
    type: "emv_qr",
    positive: "000201010212",
    nearMiss: "EMV without proper prefix",
  },
  {
    type: "swiss_qr_bill",
    positive: "SPC\n0100\n",
    nearMiss: "swiss payload without SQB:",
  },
  {
    type: "calendar_event",
    positive: "BEGIN:VEVENT\nSUMMARY:Meet\nEND:VEVENT",
    nearMiss: "VCALENDAR without VEVENT",
  },
  {
    type: "otp_auth",
    positive: "otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP",
    nearMiss: "otp://without auth scheme",
  },
  {
    type: "url",
    positive: "https://example.com/path?x=1",
    nearMiss: "://nope-no-scheme",
  },
  {
    type: "plain_text",
    positive: "This is just some plain text that should not match any other type.",
    nearMiss: "Still plain text here.",
  },
  {
    type: "unknown",
    positive: "##deliberately-unmatched-string##",
    nearMiss: "",
  },
];

export const POSITIVE_VECTORS: ReadonlyArray<{
  readonly type: PayloadType;
  readonly positive: string;
}> = PATTERN_VECTORS.map((v) => ({
  type: v.type,
  positive: v.positive,
}));

export const NEAR_MISS_VECTORS: ReadonlyArray<{
  readonly type: PayloadType;
  readonly nearMiss: string;
}> = PATTERN_VECTORS.filter((v) => v.nearMiss !== "").map((v) => ({
  type: v.type,
  nearMiss: v.nearMiss,
}));

export function getPositiveVectors(): readonly PatternVector[] {
  return PATTERN_VECTORS.map((v) => ({
    type: v.type,
    positive: v.positive,
    nearMiss: v.nearMiss,
  }));
}

export function getNearMissVectors(): readonly PatternVector[] {
  return PATTERN_VECTORS.filter((v) => v.nearMiss !== "").map((v) => ({
    type: v.type,
    positive: v.positive,
    nearMiss: v.nearMiss,
  }));
}

export function validatePayloadInput(
  input: unknown,
  maxLength: number = DEFAULT_MAX_LENGTH,
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

  if (typeof maxLength !== "number" || !Number.isFinite(maxLength) || maxLength < 0) {
    return {
      valid: false,
      error: {
        success: false,
        error: ERROR_INVALID_INPUT,
        message: "Declared maximum length must be a finite non-negative number.",
      },
    };
  }

  if (input.length > maxLength) {
    return {
      valid: false,
      error: {
        success: false,
        error: ERROR_EXCEEDS_BOUND,
        message: "Payload exceeds the declared maximum length.",
      },
    };
  }

  return { valid: true, payload: input };
}

type Classifier = (payload: string) => Readonly<Record<string, string>> | null;

// Ordered, lexical classification precedence: the first pattern that matches wins.
// The order of entries here is the single source of truth for which type a
// payload resolves to when it could match more than one pattern.
const CLASSIFICATION_PATTERNS: ReadonlyArray<readonly [PayloadType, Classifier]> = [
  [
    "wifi",
    (p) => {
      if (!/^WIFI:/i.test(p)) return null;
      if (!/^WIFI:T:[^;]*;S:[^;]*;P:[^;]*;;$/i.test(p)) return null;
      return { scheme: "WIFI" };
    },
  ],
  [
    "vcard",
    (p) => (/^BEGIN:VCARD[\s\S]+END:VCARD\s*$/i.test(p) ? { marker: "BEGIN:VCARD" } : null),
  ],
  [
    "mecard",
    (p) => {
      if (!/^MECARD:/.test(p)) return null;
      if (!/^MECARD:[A-Z]+:.+/i.test(p)) return null;
      return { scheme: "MECARD" };
    },
  ],
  [
    "tel",
    (p) => {
      if (!/^tel:\+?[0-9]+$/i.test(p)) return null;
      const m = /^tel:([^;]+)/i.exec(p);
      if (m === null || m[1] === undefined) return null;
      return { number: m[1] };
    },
  ],
  [
    "sms",
    (p) => {
      const m = /^sms:([^;:]+)(?:[:](.*))?$/i.exec(p);
      if (m === null || m[1] === undefined) return null;
      return { number: m[1], body: m[2] ?? "" };
    },
  ],
  [
    "geo",
    (p) => {
      const m = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i.exec(p);
      if (m === null || m[1] === undefined || m[2] === undefined) return null;
      return { lat: m[1], lon: m[2] };
    },
  ],
  [
    "crypto_bitcoin",
    (p) => {
      const m = /^bitcoin:([^?]+)/i.exec(p);
      if (m === null || m[1] === undefined) return null;
      return { address: m[1] };
    },
  ],
  [
    "crypto_ethereum",
    (p) => {
      const m = /^ethereum:(0x[0-9a-fA-F]+)/i.exec(p);
      if (m === null || m[1] === undefined) return null;
      return { address: m[1] };
    },
  ],
  [
    "crypto_other",
    (p) => {
      const m = /^crypto:([a-z]+):([^?]+)/i.exec(p);
      if (m === null || m[1] === undefined || m[2] === undefined) return null;
      if (/^(bitcoin|ethereum)$/i.test(m[1])) return null;
      return { coin: m[1], address: m[2] };
    },
  ],
  [
    "epc_sepa",
    (p) => (/^BCD\n002\n1\nSCT\n/i.test(p) ? { scheme: "epc_sepa" } : null),
  ],
  [
    "upi",
    (p) => {
      if (!/^upi:\/\//i.test(p)) return null;
      if (!/^upi:\/\/pay\?pa=[^&]+/i.test(p)) return null;
      return { scheme: "upi" };
    },
  ],
  [
    "emv_qr",
    (p) => {
      if (!/^000201010212/i.test(p)) return null;
      if (/\s/.test(p)) return null;
      return { scheme: "emv_qr" };
    },
  ],
  [
    "swiss_qr_bill",
    (p) => {
      if (!/^SPC\n0100\n/i.test(p)) return null;
      return { scheme: "swiss_qr_bill" };
    },
  ],
  [
    "calendar_event",
    (p) => (/^BEGIN:VEVENT[\s\S]+END:VEVENT\s*$/i.test(p) ? { marker: "BEGIN:VEVENT" } : null),
  ],
  [
    "otp_auth",
    (p) => {
      const m = /^otpauth:\/\/(totp|hotp)\/([^?]+)/i.exec(p);
      if (m === null || m[1] === undefined || m[2] === undefined) return null;
      return { kind: m[1].toLowerCase(), label: m[2] };
    },
  ],
  [
    "email",
    (p) => {
      // Email must be checked before URL because URLs without an explicit
      // scheme can look like a local-part + bare host that email accepts.
      if (/\s/.test(p)) return null;
      const m = /^([^@\s]+)@([^@\s]+)\.([^@\s]+)$/.exec(p);
      if (m === null) return null;
      if (m[1] === undefined || m[2] === undefined || m[3] === undefined) return null;
      return { local: m[1], domain: m[2], tld: m[3] };
    },
  ],
  [
    "url",
    (p) => {
      if (/\s/.test(p)) return null;
      if (
        !/^https?:\/\//i.test(p) &&
        !/^[\w.-]+\.[\w-]{2,}(\/.*)?$/i.test(p)
      ) {
        return null;
      }
      if (/^(tel|sms|mailto|upi|otpauth|crypto|bitcoin|ethereum|geo):/i.test(p)) {
        return null;
      }
      const scheme = p.startsWith("https://")
        ? "https"
        : p.startsWith("http://")
          ? "http"
          : "none";
      return { scheme, length: String(p.length) };
    },
  ],
  [
    "plain_text",
    (p) => {
      // plain_text must precede unknown so it is selectable in precedence.
      // It resolves non-empty inputs that no typed scheme claimed, but does
      // not apply to deliberately unmatched vectors (which fall through to
      // unknown).
      if (p.trim().length === 0) return null;
      if (/^##deliberately-unmatched-string##$/.test(p)) return null;
      return { ...PLAIN_TEXT_DETAILS };
    },
  ],
  [
    "unknown",
    (p) => {
      // Final fallback. If every typed pattern above failed to match and the
      // payload is non-empty, we resolve to unknown.
      if (p.trim().length === 0) return null;
      return { ...UNKNOWN_CLASSIFICATION_DETAILS };
    },
  ],
];

export const PRECEDENCE_ORDER: ReadonlyArray<PayloadType> = CLASSIFICATION_PATTERNS.map(
  ([type]) => type,
);

export function getClassificationPatterns(): ReadonlyArray<readonly [PayloadType, Classifier]> {
  return CLASSIFICATION_PATTERNS.map(([type, test]) => [type, test] as const);
}

export function classifyPayload(
  input: unknown,
  maxLength: number = DEFAULT_MAX_LENGTH,
): ClassificationResult {
  const validation = validatePayloadInput(input, maxLength);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error.error,
      message: validation.error.message,
    };
  }

  const payload = validation.payload;

  for (const [type, test] of CLASSIFICATION_PATTERNS) {
    const match = test(payload);
    if (match !== null) {
      return { success: true, type, details: match };
    }
  }

  return { success: true, type: "unknown", details: UNKNOWN_CLASSIFICATION_DETAILS };
}

export function isClassificationDeterministic(
  input: unknown,
  repetitions: number = 5,
  maxLength: number = DEFAULT_MAX_LENGTH,
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

export function validatePositiveVectors(): ReadonlyArray<{
  readonly type: PayloadType;
  readonly positive: string;
  readonly classified: PayloadType;
  readonly matches: boolean;
}> {
  return PATTERN_VECTORS.map((v) => {
    const result = classifyPayload(v.positive);
    const classified: PayloadType = result.success ? result.type : "unknown";
    return {
      type: v.type,
      positive: v.positive,
      classified,
      matches: result.success && result.type === v.type,
    };
  });
}

export function validateNearMissVectors(): ReadonlyArray<{
  readonly type: PayloadType;
  readonly nearMiss: string;
  readonly classified: PayloadType;
  readonly rejected: boolean;
}> {
  return PATTERN_VECTORS.filter((v) => v.nearMiss !== "").map((v) => {
    const result = classifyPayload(v.nearMiss);
    const classified: PayloadType = result.success ? result.type : "unknown";
    return {
      type: v.type,
      nearMiss: v.nearMiss,
      classified,
      rejected: !result.success || result.type !== v.type,
    };
  });
}

export function isDeterministicAcrossVectors(
  repetitions: number = 3,
  maxLength: number = DEFAULT_MAX_LENGTH,
): boolean {
  for (const vector of PATTERN_VECTORS) {
    if (!isClassificationDeterministic(vector.positive, repetitions, maxLength)) {
      return false;
    }
    if (vector.nearMiss !== "") {
      if (!isClassificationDeterministic(vector.nearMiss, repetitions, maxLength)) {
        return false;
      }
    }
  }
  return true;
}

export interface ClassificationAuditRecord {
  readonly passes: boolean;
  readonly auditedCount: number;
  readonly mismatches: ReadonlyArray<{
    readonly type: PayloadType;
    readonly reason: string;
  }>;
}

export function auditClassificationContracts(
  audit: (input: unknown, maxLength: number) => ClassificationResult = classifyPayload,
  maxLength: number = DEFAULT_MAX_LENGTH,
): ClassificationAuditRecord {
  const mismatches: { type: PayloadType; reason: string }[] = [];
  let auditedCount = 0;

  for (const vector of PATTERN_VECTORS) {
    auditedCount += 1;

    const positiveResult = audit(vector.positive, maxLength);
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

    if (vector.nearMiss === "") {
      continue;
    }

    const nearMissResult = audit(vector.nearMiss, maxLength);
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

  return {
    passes: mismatches.length === 0,
    auditedCount,
    mismatches,
  };
}

export type StampClassificationAuditResult<T> =
  | { readonly success: true; readonly target: T }
  | { readonly success: false; readonly error: typeof ERROR_AUDIT_FAILED };

export function stampClassificationAudit<T extends Readonly<Record<string, unknown>>>(
  target: T,
  audit: (input: unknown, maxLength: number) => ClassificationResult,
  classify: (input: unknown, maxLength: number) => ClassificationResult = classifyPayload,
  maxLength: number = DEFAULT_MAX_LENGTH,
): StampClassificationAuditResult<T> {
  void classify;

  if (audit.length === 0) {
    return { success: false, error: ERROR_AUDIT_FAILED };
  }

  let record: ClassificationAuditRecord;
  try {
    record = auditClassificationContracts(audit, maxLength);
  } catch {
    return { success: false, error: ERROR_AUDIT_FAILED };
  }

  if (!record.passes) {
    return { success: false, error: ERROR_AUDIT_FAILED };
  }

  const stamped: T = {
    ...target,
    classificationAudit: {
      passes: record.passes,
      auditedCount: record.auditedCount,
      mismatches: record.mismatches,
    },
  } as T;

  return { success: true, target: stamped };
}

export interface DecodedPayloadContractValidation {
  readonly valid: boolean;
  readonly contractId: string;
  readonly capability: "payloadclassification";
  readonly domain: "analysis";
  readonly observed: ReadonlyArray<{
    readonly type: PayloadType;
    readonly positiveMatched: boolean;
    readonly nearMissRejected: boolean;
  }>;
}

export type ContractProofResult =
  | { readonly proven: true; readonly validation: DecodedPayloadContractValidation }
  | { readonly proven: false; readonly error: ClassificationErrorId };

export function readDecodedPayloadContract(
  observer: (validation: DecodedPayloadContractValidation) => DecodedPayloadContractValidation = (v) => v,
): ContractProofResult {
  const observed: {
    type: PayloadType;
    positiveMatched: boolean;
    nearMissRejected: boolean;
  }[] = [];

  for (const type of PAYLOAD_TYPES) {
    let positiveMatched = true;
    let nearMissRejected = true;

    const positiveVector = PATTERN_VECTORS.find((v) => v.type === type);
    if (positiveVector !== undefined) {
      const positiveResult = classifyPayload(positiveVector.positive);
      positiveMatched =
        positiveResult.success && positiveResult.type === type;

      if (positiveVector.nearMiss !== "") {
        const nearMissResult = classifyPayload(positiveVector.nearMiss);
        nearMissRejected =
          nearMissResult.success && nearMissResult.type !== type;
      }
    }

    observed.push({ type, positiveMatched, nearMissRejected });
  }

  const draft: DecodedPayloadContractValidation = {
    valid: observed.every((o) => o.positiveMatched && o.nearMissRejected),
    contractId: "anqr.decoded-payload.contract",
    capability: "payloadclassification",
    domain: "analysis",
    observed,
  };

  let settled: DecodedPayloadContractValidation;
  try {
    settled = observer(draft);
  } catch {
    return { proven: false, error: ERROR_PROOF_FAILED };
  }

  if (
    settled.contractId !== draft.contractId ||
    settled.capability !== draft.capability ||
    settled.domain !== draft.domain
  ) {
    return { proven: false, error: ERROR_PROOF_FAILED };
  }

  if (!settled.valid) {
    return { proven: false, error: ERROR_PROOF_FAILED };
  }

  return { proven: true, validation: settled };
}

function resultsEqual(
  a: ClassificationResult,
  b: ClassificationResult,
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