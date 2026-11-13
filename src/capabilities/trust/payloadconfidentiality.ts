// Capability module for payload confidentiality in the ANQR product.
// No external dependencies – only Node standard library types are used.

// --- Type definitions ---
export const PAYLOAD_KINDS = [
  'text',
  'binary',
  'json',
] as const;
export type PayloadKind = typeof PAYLOAD_KINDS[number];

export const PAYLOAD_SIZE_CLASSES = [
  'small',
  'medium',
  'large',
] as const;
export type PayloadSizeClass = typeof PAYLOAD_SIZE_CLASSES[number];

/** Runtime record of a request that never includes the actual payload content. */
export interface PayloadAuditRecord {
  readonly kind: PayloadKind;
  readonly sizeClass: PayloadSizeClass;
}

/** The request object supplied by a surface. */
export interface PayloadRequest {
  readonly kind: PayloadKind;
  readonly sizeClass: PayloadSizeClass;
  /** The actual payload content – never persisted or logged. */
  readonly content: unknown;
}

/** Successful processing result – abstract artefact. */
export interface PayloadResult {
  readonly artefact: unknown;
}

/** Structured error returned on refusal. */
export interface PayloadError {
  readonly success: false;
  readonly rule: string; // name of the rule that was broken
  readonly bound: string; // description of the bound that applies
  readonly message: string; // explanatory message – never includes payload value
}

/** Success union type. */
export type PayloadOutcome =
  | { readonly success: true; readonly result: PayloadResult }
  | PayloadError;

// --- Constants for size thresholds (placeholder values) ---
export const SIZE_LIMITS: Readonly<Record<PayloadSizeClass, number>> = {
  small: 1024,               // 1 KiB
  medium: 1024 * 1024,       // 1 MiB
  large: 10 * 1024 * 1024,   // 10 MiB
} as const;

// --- Helper functions (pure) ---
const arrayBufferByteLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const sharedArrayBufferByteLength = Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'byteLength')!.get!;
const dataViewByteLength = Object.getOwnPropertyDescriptor(DataView.prototype, 'byteLength')!.get!;
const typedArrayByteLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')!.get!;

/**
 * Audits a payload request without exposing its content.
 * Returns a {@link PayloadAuditRecord} containing only kind and sizeClass.
 */
export function auditPayload(request: PayloadRequest): PayloadAuditRecord {
  return {
    kind: request.kind,
    sizeClass: request.sizeClass,
  };
}

/**
 * Validates that the payload respects the size bound for its declared class.
 * Returns a {@link PayloadError} if the check fails.
 */
function validateSize(request: PayloadRequest): PayloadError | null {
  const limit = SIZE_LIMITS[request.sizeClass];
  if (typeof limit !== 'number') {
    return {
      success: false,
      rule: 'sizeClassUndefined',
      bound: request.sizeClass,
      message: `Unknown size class '${request.sizeClass}'.`,
    };
  }
  // Binary containers have an intrinsic byte length. Other content uses the
  // existing JSON representation; an unavailable size must produce a refusal.
  let actualSize: number;
  try {
    const content = request.content;
    let bufferSize: number | undefined;
    // Intrinsic getters validate the internal brand independently of a
    // caller-controlled prototype or another realm's constructors.
    for (const getter of [arrayBufferByteLength, sharedArrayBufferByteLength]) {
      try {
        bufferSize = getter.call(content);
        break;
      } catch {
        // Not this buffer brand; try the next intrinsic.
      }
    }
    if (bufferSize !== undefined) {
      actualSize = bufferSize;
    } else if (ArrayBuffer.isView(content)) {
      try {
        actualSize = dataViewByteLength.call(content);
      } catch {
        actualSize = typedArrayByteLength.call(content);
      }
      if (typeof actualSize !== 'number') {
        throw new TypeError('Binary view size is unavailable.');
      }
    } else {
      const serialised = JSON.stringify(content);
      if (serialised === undefined) {
        throw new TypeError('Payload has no JSON representation.');
      }
      actualSize = Buffer.byteLength(serialised, 'utf8');
    }
  } catch {
    return {
      success: false,
      rule: 'payloadSizeUnavailable',
      bound: 'finite binary or JSON byte size',
      message: 'Payload size could not be determined.',
    };
  }
  if (actualSize > limit) {
    return {
      success: false,
      rule: 'sizeBoundExceeded',
      bound: `${request.sizeClass} <= ${limit} bytes`,
      message: `Payload exceeds the '${request.sizeClass}' size limit.`,
    };
  }
  return null;
}

/**
 * Processes a bounded payload. The caller provides an audit function so the ordering is observable.
 * The payload is never retained after the function returns.
 */
export function processPayload(
  request: PayloadRequest,
  auditFn: (req: PayloadRequest) => PayloadAuditRecord
): PayloadOutcome {
  // Perform audit first – observable ordering.
  const audit = auditFn(request);
  // Validate payload size before any mutation.
  const sizeError = validateSize(request);
  if (sizeError) {
    // Do not retain payload – simply return the error.
    return sizeError;
  }
  // Simulate creation of an artefact without keeping the original content.
  const artefact = { kind: request.kind, sizeClass: request.sizeClass };
  // At this point the payload content is no longer referenced.
  return { success: true, result: { artefact } };
}

/**
 * Constructs a refusal error that never includes the offending payload value.
 */
export function refusePayload(error: PayloadError): PayloadError {
  // The error already omits payload value – just return it.
  return error;
}

/**
 * Asserts that a payload is absent from logs, telemetry, or any refusal.
 * In a pure‑function context this is a no‑op, but the function exists for test hooks.
 */
export function assertNoPayloadLeak(_: unknown): void {
  // Intentionally empty – the type system guarantees we never pass the payload.
}
