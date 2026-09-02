// encodingcontrolsurface.ts
// Capability module for encoding control surface in the ANQR product.

// --- Type definitions ---

export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';
export type EncodingMode = 'auto' | 'numeric' | 'alphanumeric' | 'byte' | 'kanji';
export type ResolvedMode = 'numeric' | 'alphanumeric' | 'byte' | 'kanji';

export interface EncodingOptions {
  readonly errorCorrection: ErrorCorrectionLevel;
  readonly encodingMode: EncodingMode;
  readonly size: number;
  readonly margin: number;
  readonly mask: number;
}

export interface Artefact {
  readonly resolvedMode?: ResolvedMode;
  readonly preview: string;
}

export interface EncodingResult {
  readonly success: true;
  readonly artefact: Artefact;
  readonly resolvedMode?: ResolvedMode;
}

export interface EncodingError {
  readonly success: false;
  readonly message: string;
  readonly bound?: { min: number; max: number };
  readonly incompatibleMode?: EncodingMode;
}

export type EncodingOutcome = EncodingResult | EncodingError;

// --- Constants ---

export const ERROR_CORRECTION_LEVELS: readonly ErrorCorrectionLevel[] = ['L', 'M', 'Q', 'H'] as const;
export const ENCODING_MODES: readonly EncodingMode[] = ['auto', 'numeric', 'alphanumeric', 'byte', 'kanji'] as const;
export const RESOLVED_MODES: readonly ResolvedMode[] = ['numeric', 'alphanumeric', 'byte', 'kanji'] as const;

export const DEFAULT_ERROR_CORRECTION: ErrorCorrectionLevel = 'M';
export const DEFAULT_ENCODING_MODE: EncodingMode = 'auto';
export const DEFAULT_SIZE = 200;
export const DEFAULT_MARGIN = 4;
export const DEFAULT_MASK = 0;

export const SIZE_BOUNDS = { min: 100, max: 1000 } as const;
export const MARGIN_BOUNDS = { min: 0, max: 100 } as const;
export const MASK_BOUNDS = { min: 0, max: 7 } as const;

// --- Character set validation ---

const NUMERIC_REGEX = /^[0-9]+$/;
const ALPHANUMERIC_REGEX = /^[0-9A-Z $%*+\-./:]+$/;

function isValidForMode(payload: string, mode: ResolvedMode): boolean {
  switch (mode) {
    case 'numeric':
      return NUMERIC_REGEX.test(payload);
    case 'alphanumeric':
      return ALPHANUMERIC_REGEX.test(payload);
    case 'byte':
      return payload.length > 0; // byte mode accepts any string
    case 'kanji':
      return payload.length > 0; // kanji mode accepts any string (simplified)
    default:
      return false;
  }
}

function resolveAutoMode(payload: string): ResolvedMode | null {
  if (NUMERIC_REGEX.test(payload)) return 'numeric';
  if (ALPHANUMERIC_REGEX.test(payload)) return 'alphanumeric';
  if (payload.length > 0) return 'byte'; // default fallback
  return null;
}

// --- Factory functions ---

export function createDefaultOptions(): EncodingOptions {
  return {
    errorCorrection: DEFAULT_ERROR_CORRECTION,
    encodingMode: DEFAULT_ENCODING_MODE,
    size: DEFAULT_SIZE,
    margin: DEFAULT_MARGIN,
    mask: DEFAULT_MASK,
  };
}

// --- Validation functions ---

function validateBounds(value: number, bounds: { min: number; max: number }, name: string): EncodingError | null {
  if (!Number.isInteger(value) || value < bounds.min || value > bounds.max) {
    return {
      success: false,
      message: `${name} must be an integer between ${bounds.min} and ${bounds.max}`,
      bound: bounds,
    };
  }
  return null;
}

function validateErrorCorrection(level: string): EncodingError | null {
  if (!ERROR_CORRECTION_LEVELS.includes(level as ErrorCorrectionLevel)) {
    return {
      success: false,
      message: `Error correction must be one of: ${ERROR_CORRECTION_LEVELS.join(', ')}`,
    };
  }
  return null;
}

function validateEncodingMode(mode: string): EncodingError | null {
  if (!ENCODING_MODES.includes(mode as EncodingMode)) {
    return {
      success: false,
      message: `Encoding mode must be one of: ${ENCODING_MODES.join(', ')}`,
    };
  }
  return null;
}

// --- Mutation functions (with audit ordering) ---

export function setErrorCorrection(
  options: EncodingOptions,
  level: ErrorCorrectionLevel,
  audit: (opts: EncodingOptions) => EncodingError | null
): EncodingOptions | EncodingError {
  const auditResult = audit(options);
  if (auditResult && !auditResult.success) {
    return auditResult;
  }

  const validation = validateErrorCorrection(level);
  if (validation) return validation;

  return { ...options, errorCorrection: level };
}

export function setEncodingMode(
  options: EncodingOptions,
  mode: EncodingMode,
  payload: string,
  audit: (opts: EncodingOptions) => EncodingError | null
): EncodingOptions | EncodingError {
  const auditResult = audit(options);
  if (auditResult && !auditResult.success) {
    return auditResult;
  }

  const validation = validateEncodingMode(mode);
  if (validation) return validation;

  // Check mode compatibility if not auto
  if (mode !== 'auto') {
    if (!isValidForMode(payload, mode as ResolvedMode)) {
      return {
        success: false,
        message: `Mode "${mode}" is incompatible with payload characters`,
        incompatibleMode: mode,
      };
    }
  }

  return { ...options, encodingMode: mode };
}

export function setSize(
  options: EncodingOptions,
  size: number,
  audit: (opts: EncodingOptions) => EncodingError | null
): EncodingOptions | EncodingError {
  const auditResult = audit(options);
  if (auditResult && !auditResult.success) {
    return auditResult;
  }

  const validation = validateBounds(size, SIZE_BOUNDS, 'Size');
  if (validation) return validation;

  return { ...options, size };
}

export function setMargin(
  options: EncodingOptions,
  margin: number,
  audit: (opts: EncodingOptions) => EncodingError | null
): EncodingOptions | EncodingError {
  const auditResult = audit(options);
  if (auditResult && !auditResult.success) {
    return auditResult;
  }

  const validation = validateBounds(margin, MARGIN_BOUNDS, 'Margin');
  if (validation) return validation;

  return { ...options, margin };
}

export function setMask(
  options: EncodingOptions,
  mask: number,
  audit: (opts: EncodingOptions) => EncodingError | null
): EncodingOptions | EncodingError {
  const auditResult = audit(options);
  if (auditResult && !auditResult.success) {
    return auditResult;
  }

  const validation = validateBounds(mask, MASK_BOUNDS, 'Mask');
  if (validation) return validation;

  return { ...options, mask };
}

// --- Artefact generation ---

export function generateArtefact(
  options: EncodingOptions,
  payload: string,
  audit: (opts: EncodingOptions) => EncodingError | null
): EncodingOutcome {
  const auditResult = audit(options);
  if (auditResult && !auditResult.success) {
    return auditResult;
  }

  // Resolve encoding mode
  let resolvedMode: ResolvedMode | undefined;
  if (options.encodingMode === 'auto') {
    resolvedMode = resolveAutoMode(payload) || undefined;
    if (!resolvedMode) {
      return {
        success: false,
        message: 'Cannot resolve auto mode for empty payload',
      };
    }
  } else {
    resolvedMode = options.encodingMode as ResolvedMode;
    if (!isValidForMode(payload, resolvedMode)) {
      return {
        success: false,
        message: `Mode "${resolvedMode}" is incompatible with payload characters`,
        incompatibleMode: resolvedMode,
      };
    }
  }

  // Generate preview representation
  const preview = `QR(ec=${options.errorCorrection}, mode=${resolvedMode}, size=${options.size}, margin=${options.margin}, mask=${options.mask})`;

  return {
    success: true,
    artefact: { resolvedMode, preview },
    resolvedMode,
  };
}

// --- Grouped option visibility ---

export function getVisibleOptions(options: EncodingOptions): readonly (keyof EncodingOptions)[] {
  // All options are always visible in this implementation
  return Object.keys(options) as readonly (keyof EncodingOptions)[];
}