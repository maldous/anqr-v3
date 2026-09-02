// Exported list of allowed classification outcome strings
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

// Union type for the classification outcomes
export type PayloadType = typeof PAYLOAD_TYPES[number];

// Discriminated‑union result types
export type ClassificationSuccess = {
  readonly success: true;
  readonly type: PayloadType;
  readonly details: Record<string, unknown>;
};

export type ClassificationError = {
  readonly success: false;
  readonly error: "invalid_input" | "exceeds_bound";
  readonly message: string;
};

export type ClassificationResult = ClassificationSuccess | ClassificationError;

/**
 * Validates the raw payload input.
 * Returns an error result if the input is not a string or exceeds the configured length bound.
 */
export function validatePayloadInput(
  input: unknown,
  maxLength: number
): { valid: true; payload: string } | ClassificationError {
  if (typeof input !== "string") {
    return {
      success: false,
      error: "invalid_input",
      message: "Payload must be a string.",
    };
  }
  if (input.length > maxLength) {
    return {
      success: false,
      error: "exceeds_bound",
      message: `Payload exceeds maximum length of ${maxLength} characters.`,
    };
  }
  return { valid: true, payload: input } as const;
}

/**
 * Tuple of ordered classification patterns (lexical precedence).
 * Each entry is a [PayloadType, (payload: string) => Record<string, unknown> | null] pair.
 * The function returns a details object when the pattern matches, otherwise null.
 *
 * Replace the placeholder regexes with the exact patterns used by the foundation
 * if you have them; the ordering must follow the lexical order of the type names.
 */
const CLASSIFICATION_PATTERNS: readonly [
  PayloadType,
  (payload: string) => Record<string, unknown> | null
][] = [
  // url
  [
    "url",
    (p) =>
      /^(https?:\/\/)?[\w.-]+(?:\.[\w.-]+)+(\/[\w./?%&=-]*)?$/.test(p)
        ? {}
        : null,
  ],
  // wifi
  ["wifi", (p) => (/^WIFI:/i.test(p) ? {} : null)],
  // vcard
  ["vcard", (p) => (/^BEGIN:VCARD/i.test(p) ? {} : null)],
  // mecard
  ["mecard", (p) => (/^MECARD:/i.test(p) ? {} : null)],
  // email
  ["email", (p) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p) ? {} : null)],
  // tel
  ["tel", (p) => (/^tel:/i.test(p) ? {} : null)],
  // sms
  ["sms", (p) => (/^sms:/i.test(p) ? {} : null)],
  // geo
  ["geo", (p) => (/^geo:/i.test(p) ? {} : null)],
  // crypto_bitcoin
  ["crypto_bitcoin", (p) => (/^bitcoin:/i.test(p) ? {} : null)],
  // crypto_ethereum
  ["crypto_ethereum", (p) => (/^ethereum:/i.test(p) ? {} : null)],
  // crypto_other
  ["crypto_other", (p) => (/^crypto:/i.test(p) ? {} : null)],
  // epc_sepa
  ["epc_sepa", (p) => (/^sepa:/i.test(p) ? {} : null)],
  // upi
  ["upi", (p) => (/^upi:/i.test(p) ? {} : null)],
  // emv_qr
  ["emv_qr", (p) => (/^EMV:/i.test(p) ? {} : null)],
  // swiss_qr_bill
  ["swiss_qr_bill", (p) => (/^SQB:/i.test(p) ? {} : null)],
  // calendar_event
  ["calendar_event", (p) => (/^BEGIN:VEVENT/i.test(p) ? {} : null)],
  // otp_auth
  ["otp_auth", (p) => (/^otp:/i.test(p) ? {} : null)],
  // plain_text
  ["plain_text", (p) => (p.trim() !== "" ? {} : null)],
  // unknown – handled after the loop
] as const;

/**
 * Classifies a payload string according to lexical precedence.
 * Pure function – no external mutation.
 */
export function classifyPayload(
  input: unknown,
  maxLength: number = 8192 // default bound; can be overridden by caller
): ClassificationResult {
  const validation = validatePayloadInput(input, maxLength);
  if ("valid" in validation) {
    const payload = validation.payload;

    // Iterate patterns in lexical order; first match wins.
    for (const [type, test] of CLASSIFICATION_PATTERNS) {
      const match = test(payload);
      if (match) {
        return { success: true, type, details: match };
      }
    }

    // No pattern matched → unknown
    return { success: true, type: "unknown", details: {} };
  }

  // Validation failed – return the error without echoing the payload.
  return validation;
}

/**
 * Exposes the lexical precedence order as a readonly array.
 */
export const PRECEDENCE_ORDER = PAYLOAD_TYPES as ReadonlyArray<PayloadType>;