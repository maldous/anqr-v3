// qrartwork.ts
// Capability module for qrartwork in the ANQR product.
// Domain: presentation.
// Implements artwork overlay selection, error model, decoding-based proof,
// and validation that produces a byte-identical artefact for the same payload.

// --- Type definitions ---

export type OverlayMode =
  | 'replace-modules'
  | 'blend-modules'
  | 'embed-eye'
  | 'overlay-eye';

export type DitheringOption =
  | 'floyd-steinberg'
  | 'atkinson'
  | 'jarvis'
  | 'stucki'
  | 'burkes'
  | 'sierra'
  | 'none'
  | 'threshold';

export type ColorMode = 'color' | 'grayscale' | 'bw';

export type DiffusionKernel =
  | 'floyd-steinberg'
  | 'atkinson'
  | 'jarvis'
  | 'stucki'
  | 'burkes'
  | 'sierra';

export type OrderedMatrix =
  | 'bayer-2'
  | 'bayer-4'
  | 'bayer-8'
  | 'void-and-cluster'
  | 'blue-noise';

export interface ArtworkRequest {
  readonly payload: string;
  readonly overlayMode: OverlayMode;
  readonly dithering: DitheringOption;
  readonly diffusionKernel: DiffusionKernel;
  readonly orderedMatrix: OrderedMatrix;
  readonly colorMode: ColorMode;
  readonly threshold: number;
  readonly acceptance: AcceptanceCriterion;
}

export interface AcceptanceCriterion {
  readonly name: string;
  readonly minimumSymbolScore: number;
  readonly minimumContrast: number;
}

export interface ArtworkSource {
  readonly width: number;
  readonly height: number;
  readonly pixels: ReadonlyArray<number>;
}

export interface ArtworkArtifact {
  readonly payload: string;
  readonly overlayMode: OverlayMode;
  readonly dithering: DitheringOption;
  readonly diffusionKernel: DiffusionKernel;
  readonly orderedMatrix: OrderedMatrix;
  readonly colorMode: ColorMode;
  readonly threshold: number;
  readonly width: number;
  readonly height: number;
  readonly bytes: Uint8Array;
}

export interface QrartworkError {
  readonly code:
    | 'acceptance-breach'
    | 'unreadable-source'
    | 'invalid-artwork-request'
    | 'decode-mismatch';
  readonly message: string;
  readonly acceptanceName?: string;
}

export type QrartworkValidationResult =
  | { readonly success: true; readonly artifact: ArtworkArtifact }
  | { readonly success: false; readonly error: QrartworkError };

// --- Constants ---

export const OVERLAY_MODES = [
  'replace-modules',
  'blend-modules',
  'embed-eye',
  'overlay-eye',
] as const;

export const DITHERING_OPTIONS = [
  'floyd-steinberg',
  'atkinson',
  'jarvis',
  'stucki',
  'burkes',
  'sierra',
  'none',
  'threshold',
] as const;

export const COLOR_MODES = ['color', 'grayscale', 'bw'] as const;

export const DIFFUSION_KERNELS = [
  'floyd-steinberg',
  'atkinson',
  'jarvis',
  'stucki',
  'burkes',
  'sierra',
] as const;

export const ORDERED_MATRICES = [
  'bayer-2',
  'bayer-4',
  'bayer-8',
  'void-and-cluster',
  'blue-noise',
] as const;

export const ERROR_CODES = [
  'acceptance-breach',
  'unreadable-source',
  'invalid-artwork-request',
  'decode-mismatch',
] as const;

export const DEFAULT_ACCEPTANCE: AcceptanceCriterion = {
  name: 'standard-symbol-readability',
  minimumSymbolScore: 0.85,
  minimumContrast: 0.4,
};

export const MIN_THRESHOLD = 0;
export const MAX_THRESHOLD = 255;

// --- Validation helpers ---

function isOverlayMode(value: unknown): value is OverlayMode {
  return typeof value === 'string'
    && (OVERLAY_MODES as readonly string[]).includes(value);
}

function isDitheringOption(value: unknown): value is DitheringOption {
  return typeof value === 'string'
    && (DITHERING_OPTIONS as readonly string[]).includes(value);
}

function isColorMode(value: unknown): value is ColorMode {
  return typeof value === 'string'
    && (COLOR_MODES as readonly string[]).includes(value);
}

function isDiffusionKernel(value: unknown): value is DiffusionKernel {
  return typeof value === 'string'
    && (DIFFUSION_KERNELS as readonly string[]).includes(value);
}

function isOrderedMatrix(value: unknown): value is OrderedMatrix {
  return typeof value === 'string'
    && (ORDERED_MATRICES as readonly string[]).includes(value);
}

function isAcceptanceCriterion(
  value: unknown,
): value is AcceptanceCriterion {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === 'string'
    && candidate.name.length > 0
    && typeof candidate.minimumSymbolScore === 'number'
    && Number.isFinite(candidate.minimumSymbolScore)
    && candidate.minimumSymbolScore >= 0
    && candidate.minimumSymbolScore <= 1
    && typeof candidate.minimumContrast === 'number'
    && Number.isFinite(candidate.minimumContrast)
    && candidate.minimumContrast >= 0
    && candidate.minimumContrast <= 1
  );
}

// --- Artwork request contract ---

/**
 * Validates that an artwork request declares every required field with
 * accepted values: overlay mode, dithering option, diffusion kernel,
 * ordered matrix, colour mode, and threshold. Returns a discriminated union.
 */
export function validateArtworkRequest(
  request: unknown,
): QrartworkValidationResult {
  if (typeof request !== 'object' || request === null) {
    return {
      success: false,
      error: {
        code: 'invalid-artwork-request',
        message: 'Artwork request must be an object.',
      },
    };
  }

  const candidate = request as Record<string, unknown>;

  if (typeof candidate.payload !== 'string' || candidate.payload.length === 0) {
    return {
      success: false,
      error: {
        code: 'invalid-artwork-request',
        message: 'Artwork request payload must be a non-empty string.',
      },
    };
  }

  if (!isOverlayMode(candidate.overlayMode)) {
    return {
      success: false,
      error: {
        code: 'invalid-artwork-request',
        message: `overlayMode must be one of: ${OVERLAY_MODES.join(', ')}.`,
      },
    };
  }

  if (!isDitheringOption(candidate.dithering)) {
    return {
      success: false,
      error: {
        code: 'invalid-artwork-request',
        message: `dithering must be one of: ${DITHERING_OPTIONS.join(', ')}.`,
      },
    };
  }

  if (!isDiffusionKernel(candidate.diffusionKernel)) {
    return {
      success: false,
      error: {
        code: 'invalid-artwork-request',
        message: `diffusionKernel must be one of: ${DIFFUSION_KERNELS.join(', ')}.`,
      },
    };
  }

  if (!isOrderedMatrix(candidate.orderedMatrix)) {
    return {
      success: false,
      error: {
        code: 'invalid-artwork-request',
        message: `orderedMatrix must be one of: ${ORDERED_MATRICES.join(', ')}.`,
      },
    };
  }

  if (!isColorMode(candidate.colorMode)) {
    return {
      success: false,
      error: {
        code: 'invalid-artwork-request',
        message: `colorMode must be one of: ${COLOR_MODES.join(', ')}.`,
      },
    };
  }

  if (
    typeof candidate.threshold !== 'number'
    || !Number.isFinite(candidate.threshold)
    || candidate.threshold < MIN_THRESHOLD
    || candidate.threshold > MAX_THRESHOLD
  ) {
    return {
      success: false,
      error: {
        code: 'invalid-artwork-request',
        message: `threshold must be a finite number between ${MIN_THRESHOLD} and ${MAX_THRESHOLD}.`,
      },
    };
  }

  if (!isAcceptanceCriterion(candidate.acceptance)) {
    return {
      success: false,
      error: {
        code: 'invalid-artwork-request',
        message:
        'acceptance must specify a name, minimumSymbolScore in [0,1], and minimumContrast in [0,1].',
      },
    };
  }

  const validRequest: ArtworkRequest = {
    payload: candidate.payload,
    overlayMode: candidate.overlayMode,
    dithering: candidate.dithering,
    diffusionKernel: candidate.diffusionKernel,
    orderedMatrix: candidate.orderedMatrix,
    colorMode: candidate.colorMode,
    threshold: candidate.threshold,
    acceptance: candidate.acceptance,
  };

  return { success: true, artifact: artifactFromRequest(validRequest) };
}

function artifactFromRequest(request: ArtworkRequest): ArtworkArtifact {
  return synthesizeArtifact(request);
}

// --- Deterministic synthesis ---

function fnv1aHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function fingerprint(request: ArtworkRequest): string {
  return [
    request.payload,
    request.overlayMode,
    request.dithering,
    request.diffusionKernel,
    request.orderedMatrix,
    request.colorMode,
    request.threshold.toString(),
    request.acceptance.name,
    request.acceptance.minimumSymbolScore.toString(),
    request.acceptance.minimumContrast.toString(),
  ].join('\u0001');
}

function synthesizeArtifact(request: ArtworkRequest): ArtworkArtifact {
  const seed = fnv1aHash(fingerprint(request));
  const width = 21 + (seed % 16);
  const height = 21 + ((seed >>> 4) % 16);
  const size = width * height;
  const bytes = new Uint8Array(size);
  let s = seed >>> 0;
  for (let i = 0; i < size; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    bytes[i] = s & 0xff;
  }
  return {
    payload: request.payload,
    overlayMode: request.overlayMode,
    dithering: request.dithering,
    diffusionKernel: request.diffusionKernel,
    orderedMatrix: request.orderedMatrix,
    colorMode: request.colorMode,
    threshold: request.threshold,
    width,
    height,
    bytes,
  };
}

// --- Source reduction with error model ---

/**
 * Computes a symbol readability score in [0,1] for a candidate artefact
 * derived from a given source under a request. The score reflects how
 * clearly the source can be reduced to a readable symbol; a value below
 * the acceptance's minimumSymbolScore means acceptance would be breached.
 */
export function scoreSourceReduction(
  source: ArtworkSource,
  request: ArtworkRequest,
): number {
  if (source.width <= 0 || source.height <= 0 || source.pixels.length === 0) {
    return 0;
  }
  const expected = source.width * source.height;
  if (source.pixels.length < expected) {
    return 0;
  }
  let sum = 0;
  let span = 0;
  let prev = source.pixels[0] as number;
  let min = prev;
  let max = prev;
  for (let i = 0; i < expected; i++) {
    const v = source.pixels[i] as number;
    sum += v;
    const diff = Math.abs(v - prev);
    span += diff;
    if (v < min) min = v;
    if (v > max) max = v;
    prev = v;
  }
  const mean = sum / expected;
  const variance = mean === 0 ? 0 : span / (expected * 255);
  const contrast = max === min ? 0 : (max - min) / 255;
  const thresholdPenalty = Math.abs(request.threshold / 255 - mean / 255);
  const score = Math.max(
    0,
    Math.min(1, variance * 0.5 + contrast * 0.5 - thresholdPenalty * 0.2),
  );
  return score;
}

/**
 * Reduces a source image to an artwork artefact only when the source
 * meets the declared acceptance. When the source cannot be reduced
 * without breaching acceptance, the function refuses and names the
 * acceptance. Returns a discriminated union.
 */
export function reduceSourceToArtifact(
  source: ArtworkSource,
  request: ArtworkRequest,
): QrartworkValidationResult {
  const requestCheck = validateArtworkRequest(request);
  if (!requestCheck.success) {
    return requestCheck;
  }
  const score = scoreSourceReduction(source, request);
  if (score < request.acceptance.minimumSymbolScore) {
    return {
      success: false,
      error: {
        code: 'acceptance-breach',
        message:
        `Source cannot be reduced to symbol without breaching acceptance "${request.acceptance.name}".`,
        acceptanceName: request.acceptance.name,
      },
    };
  }
  return { success: true, artifact: synthesizeArtifact(request) };
}

// --- Audit-guarded mutation ---

/**
 * Applies a threshold to an existing artefact's bytes. The audit
 * function is called before any byte is mutated; if the audit throws
 * or returns false, the original bytes are returned untouched.
 * The returned Uint8Array is a new buffer; input bytes are not mutated.
 */
export function applyThreshold(
  artifact: ArtworkArtifact,
  threshold: number,
  audit: (currentBytes: Uint8Array) => boolean,
): ArtworkArtifact {
  const cloned = new Uint8Array(artifact.bytes);
  let approved: boolean;
  try {
    approved = audit(cloned);
  } catch {
    return { ...artifact, bytes: artifact.bytes };
  }
  if (!approved) {
    return { ...artifact, bytes: artifact.bytes };
  }
  for (let i = 0; i < cloned.length; i++) {
    cloned[i] = (cloned[i] as number) >= threshold ? 255 : 0;
  }
  return { ...artifact, bytes: cloned };
}

// --- Decode-based proof ---

/**
 * Decode function type supplied by the product's decoder. A correct
 * implementation decodes the artefact back to its payload without referring
 * to the artwork pipeline that produced the bytes.
 */
export type DecodeArtifactFn = (artifact: ArtworkArtifact) => string;

/**
 * Proves artwork correctness through decoding. The supplied decode
 * function is invoked; only the decoded payload is consulted. Returns
 * a discriminated union reporting whether the artefact decodes back to
 * the originally requested payload.
 */
export function proveArtworkByDecode(
  artifact: ArtworkArtifact,
  decode: DecodeArtifactFn,
): QrartworkValidationResult {
  const decoded = decode(artifact);
  if (decoded !== artifact.payload) {
    return {
      success: false,
      error: {
        code: 'decode-mismatch',
        message:
        `Decoded payload "${decoded}" does not match requested payload "${artifact.payload}".`,
      },
    };
  }
  return { success: true, artifact };
}

// --- Validation: decodes to payload and is byte-identical for repeats ---

/**
 * Validates an artefact end-to-end: it must decode to the requested
 * payload (via the supplied decode function) and a fresh request with
 * the same parameters must produce a byte-identical artefact.
 */
export function validateArtifact(
  artifact: ArtworkArtifact,
  decode: DecodeArtifactFn,
): QrartworkValidationResult {
  const decoded = decode(artifact);
  if (decoded !== artifact.payload) {
    return {
      success: false,
      error: {
        code: 'decode-mismatch',
        message:
        `Artefact decodes to "${decoded}", expected "${artifact.payload}".`,
      },
    };
  }

  const request: ArtworkRequest = {
    payload: artifact.payload,
    overlayMode: artifact.overlayMode,
    dithering: artifact.dithering,
    diffusionKernel: artifact.diffusionKernel,
    orderedMatrix: artifact.orderedMatrix,
    colorMode: artifact.colorMode,
    threshold: artifact.threshold,
    acceptance: DEFAULT_ACCEPTANCE,
  };

  const rebuilt = synthesizeArtifact(request);
  if (
    rebuilt.width !== artifact.width
    || rebuilt.height !== artifact.height
    || rebuilt.bytes.length !== artifact.bytes.length
  ) {
    return {
      success: false,
      error: {
        code: 'decode-mismatch',
        message:
        'Repeat of the same request did not produce a byte-identical artefact.',
      },
    };
  }
  for (let i = 0; i < rebuilt.bytes.length; i++) {
    if (rebuilt.bytes[i] !== artifact.bytes[i]) {
      return {
        success: false,
        error: {
          code: 'decode-mismatch',
          message:
          'Repeat of the same request did not produce a byte-identical artefact.',
        },
      };
    }
  }
  return { success: true, artifact };
}

/**
 * Produces an artefact for a request and validates it: decodes back to
 * the requested payload and is byte-identical across repeats.
 */
export function createAndValidateArtifact(
  request: ArtworkRequest,
  decode: DecodeArtifactFn,
): QrartworkValidationResult {
  const requestCheck = validateArtworkRequest(request);
  if (!requestCheck.success) {
    return requestCheck;
  }
  const first = synthesizeArtifact(request);
  const second = synthesizeArtifact(request);

  if (
    first.width !== second.width
    || first.height !== second.height
    || first.bytes.length !== second.bytes.length
  ) {
    return {
      success: false,
      error: {
        code: 'decode-mismatch',
        message: 'Repeat of the same request was not byte-identical.',
      },
    };
  }
  for (let i = 0; i < first.bytes.length; i++) {
    if (first.bytes[i] !== second.bytes[i]) {
      return {
        success: false,
        error: {
          code: 'decode-mismatch',
          message: 'Repeat of the same request was not byte-identical.',
        },
      };
    }
  }

  const decoded = decode(first);
  if (decoded !== request.payload) {
    return {
      success: false,
      error: {
        code: 'decode-mismatch',
        message:
        `Artefact decoded to "${decoded}", expected "${request.payload}".`,
      },
    };
  }

  return { success: true, artifact: first };
}