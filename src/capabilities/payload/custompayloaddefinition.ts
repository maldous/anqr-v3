// Capability module for custom payload definition in the ANQR product.

// --- Type definitions ---

export interface CustomPayload {
  readonly value: string;
}

export interface PayloadError {
  readonly message: string;
  readonly code: PayloadErrorCode;
}

export type PayloadResult =
  | { readonly success: true; readonly payload: CustomPayload }
  | { readonly success: false; readonly error: PayloadError };

// --- Constants ---

export const MAX_PAYLOAD_LENGTH = 1000;
export const PAYLOAD_ERROR_CODES = [
  'CAPACITY_EXCEEDED',
  'INVALID_CHARACTER_SET',
  'ROUND_TRIP_FAILURE',
] as const;
export type PayloadErrorCode = typeof PAYLOAD_ERROR_CODES[number];

// --- Factory functions ---

/**
 * Creates a custom payload from a string value.
 * The payload is encoded unchanged with no formatting or scheme detection.
 */
export function createCustomPayload(value: string): PayloadResult {
  // Check capacity limit
  if (value.length > MAX_PAYLOAD_LENGTH) {
    return {
      success: false,
      error: {
        message: `Payload exceeds maximum length of ${MAX_PAYLOAD_LENGTH} characters.`,
        code: 'CAPACITY_EXCEEDED',
      },
    };
  }

  // Check character set - only refuse based on character-set limits
  // Allow all characters except control characters that might break round-trip
  for (let i = 0; i < value.length; i++) {
    const charCode = value.charCodeAt(i);
    // Reject null bytes and other problematic control characters
    if (charCode === 0 || (charCode < 32 && charCode !== 9 && charCode !== 10 && charCode !== 13)) {
      return {
        success: false,
        error: {
          message: 'Payload contains invalid control characters.',
          code: 'INVALID_CHARACTER_SET',
        },
      };
    }
  }

  // Verify round-trip byte-identical encoding
  const encoded = encodePayload(value);
  const decoded = decodePayload(encoded);
  
  if (value !== decoded) {
    return {
      success: false,
      error: {
        message: 'Payload failed round-trip verification.',
        code: 'ROUND_TRIP_FAILURE',
      },
    };
  }

  return {
    success: true,
    payload: { value },
  };
}

// --- Validation functions ---

/**
 * Validates that a payload can round-trip byte-identically.
 * This includes characters that resemble other schemes.
 */
export function validateRoundTrip(value: string): PayloadResult {
  const encoded = encodePayload(value);
  const decoded = decodePayload(encoded);
  
  if (value !== decoded) {
    return {
      success: false,
      error: {
        message: 'Payload failed round-trip verification.',
        code: 'ROUND_TRIP_FAILURE',
      },
    };
  }

  return {
    success: true,
    payload: { value },
  };
}

/**
 * Checks if a payload would be refused by capacity limits only.
 * No scheme rules are applied.
 */
export function validateCapacity(value: string): PayloadResult {
  if (value.length > MAX_PAYLOAD_LENGTH) {
    return {
      success: false,
      error: {
        message: `Payload exceeds maximum length of ${MAX_PAYLOAD_LENGTH} characters.`,
        code: 'CAPACITY_EXCEEDED',
      },
    };
  }

  return {
    success: true,
    payload: { value },
  };
}

/**
 * Checks if a payload would be refused by character-set limits only.
 * No scheme rules are applied.
 */
export function validateCharacterSet(value: string): PayloadResult {
  for (let i = 0; i < value.length; i++) {
    const charCode = value.charCodeAt(i);
    if (charCode === 0 || (charCode < 32 && charCode !== 9 && charCode !== 10 && charCode !== 13)) {
      return {
        success: false,
        error: {
          message: 'Payload contains invalid control characters.',
          code: 'INVALID_CHARACTER_SET',
        },
      };
    }
  }

  return {
    success: true,
    payload: { value },
  };
}

// --- Encoding functions ---

/**
 * Encodes a payload string unchanged.
 * Applies no formatting and no scheme detection.
 */
export function encodePayload(value: string): string {
  // For custom payload, we encode unchanged - just return the string as-is
  // This ensures byte-identical round-trip
  return value;
}

/**
 * Decodes a payload string unchanged.
 * Applies no formatting and no scheme detection.
 */
export function decodePayload(encoded: string): string {
  // For custom payload, we decode unchanged - just return the string as-is
  // This ensures byte-identical round-trip
  return encoded;
}

// --- Audit function for mutation prevention ---

/**
 * Audit function that validates a payload before mutation.
 * Returns true if the payload passes all checks.
 */
export function auditPayload(value: string): boolean {
  const capacityResult = validateCapacity(value);
  if (!capacityResult.success) return false;

  const characterSetResult = validateCharacterSet(value);
  if (!characterSetResult.success) return false;

  const roundTripResult = validateRoundTrip(value);
  return roundTripResult.success;
}

/**
 * Safely creates a custom payload with audit check.
 * The mutation (payload creation) only occurs if the audit function passes.
 */
export function createCustomPayloadWithAudit(
  value: string,
  audit: (val: string) => boolean = auditPayload
): PayloadResult {
  // Check must precede mutation
  if (!audit(value)) {
    return {
      success: false,
      error: {
        message: 'Payload failed audit check.',
        code: 'ROUND_TRIP_FAILURE',
      },
    };
  }

  return createCustomPayload(value);
}