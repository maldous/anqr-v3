// visualcustomisation.ts
// Capability module for visual customisation in the ANQR product.

// --- Fixed sets (exported as readonly arrays and union types) ---

export const MODULE_STYLES = ['square', 'rounded', 'dots', 'diamond', 'connected'] as const;
export type ModuleStyle = typeof MODULE_STYLES[number];

export const FINDER_STYLES = ['square', 'rounded', 'circle'] as const;
export type FinderStyle = typeof FINDER_STYLES[number];

export const GRADIENT_KINDS = ['none', 'linear', 'radial', 'conic'] as const;
export type GradientKind = typeof GRADIENT_KINDS[number];

export const COLOR_FORMATS = ['rgb', 'rgba', 'hsl', 'hsla'] as const;
export type ColorFormat = typeof COLOR_FORMATS[number];

export const SAFETY_MODES = ['standard', 'strict'] as const;
export type SafetyMode = typeof SAFETY_MODES[number];

// --- State and type definitions ---

export interface ColorStop {
  readonly position: number; // 0..1
  readonly color: string;
}

export interface Gradient {
  readonly kind: GradientKind;
  readonly stops: readonly ColorStop[];
  readonly angle?: number; // for linear / conic
}

export interface VisualStyle {
  readonly moduleStyle: ModuleStyle;
  readonly finderStyle: FinderStyle;
  readonly foreground: string;
  readonly background: string;
  readonly gradient: Gradient;
}

export interface CustomisationError {
  readonly message: string;
  readonly cause: string;
  readonly field: string;
}

export type ValidationResult<T> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly error: CustomisationError };

export interface UnavailabilityReason {
  readonly style: VisualStyle;
  readonly reason: string;
}

// --- Constants ---

export const DEFAULT_MODULE_STYLE: ModuleStyle = 'square';
export const DEFAULT_FINDER_STYLE: FinderStyle = 'square';
export const DEFAULT_FOREGROUND = 'rgb(0,0,0)';
export const DEFAULT_BACKGROUND = 'rgb(255,255,255)';
export const CONTRAST_DECODE_THRESHOLD = 3.0; // minimum contrast ratio for decode reliability
export const SAFETY_MODE_STRICT: SafetyMode = 'strict';
export const SAFETY_MODE_STANDARD: SafetyMode = 'standard';

// --- Colour parsing ---

function parseColorString(input: string): { r: number; g: number; b: number; a: number } | null {
  const s = input.trim().toLowerCase();
  if (s.startsWith('rgb(')) {
    const inside = s.slice(4, -1);
    const parts = inside.split(',').map((p) => Number(p.trim()));
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
    const [r, g, b] = parts;
    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) return null;
    return { r, g, b, a: 1 };
  }
  if (s.startsWith('rgba(')) {
    const inside = s.slice(5, -1);
    const parts = inside.split(',').map((p) => Number(p.trim()));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
    const [r, g, b, a] = parts;
    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255 || a < 0 || a > 1) return null;
    return { r, g, b, a };
  }
  if (s.startsWith('hsl(')) {
    const inside = s.slice(4, -1);
    const parts = inside.split(',').map((p) => Number(p.trim()));
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
    const [hRaw, sRaw, lRaw] = parts;
    return hslToRgb(hRaw, sRaw / 100, lRaw / 100, 1);
  }
  if (s.startsWith('hsla(')) {
    const inside = s.slice(5, -1);
    const parts = inside.split(',').map((p) => Number(p.trim()));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
    const [hRaw, sRaw, lRaw, a] = parts;
    if (a < 0 || a > 1) return null;
    return hslToRgb(hRaw, sRaw / 100, lRaw / 100, a);
  }
  return null;
}

function hslToRgb(h: number, sat: number, l: number, a: number): { r: number; g: number; b: number; a: number } | null {
  if (!Number.isFinite(h) || !Number.isFinite(sat) || !Number.isFinite(l)) return null;
  if (sat < 0 || sat > 1 || l < 0 || l > 1) return null;
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * sat;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hh < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (hh < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (hh < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (hh < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (hh < 300) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) return null;
  return { r, g, b, a };
}

function detectFormat(input: string): ColorFormat | null {
  const s = input.trim().toLowerCase();
  if (s.startsWith('rgb(')) return 'rgb';
  if (s.startsWith('rgba(')) return 'rgba';
  if (s.startsWith('hsl(')) return 'hsl';
  if (s.startsWith('hsla(')) return 'hsla';
  return null;
}

// --- Contrast computation ---

function relativeLuminance(c: { r: number; g: number; b: number }): number {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

export function contrastRatio(fg: string, bg: string): number {
  const fgParsed = parseColorString(fg);
  const bgParsed = parseColorString(bg);
  if (fgParsed === null || bgParsed === null) return 0;
  const l1 = relativeLuminance(fgParsed);
  const l2 = relativeLuminance(bgParsed);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// --- Validation ---

export function validateModuleStyle(value: string): value is ModuleStyle {
  return (MODULE_STYLES as readonly string[]).includes(value);
}

export function validateFinderStyle(value: string): value is FinderStyle {
  return (FINDER_STYLES as readonly string[]).includes(value);
}

export function validateGradientKind(value: string): value is GradientKind {
  return (GRADIENT_KINDS as readonly string[]).includes(value);
}

export function validateColor(value: string): ValidationResult<ColorFormat> {
  const format = detectFormat(value);
  if (format === null) {
    return {
      success: false,
      error: {
        message: `Colour "${value}" is not a recognised RGB, RGBA, HSL or HSLA value.`,
        cause: 'invalid_format',
        field: 'color',
      },
    };
  }
  if (parseColorString(value) === null) {
    return {
      success: false,
      error: {
        message: `Colour "${value}" has invalid channel values.`,
        cause: 'invalid_channels',
        field: 'color',
      },
    };
  }
  return { success: true, value: format };
}

export function validateGradient(gradient: Gradient): ValidationResult<Gradient> {
  if (!validateGradientKind(gradient.kind)) {
    return {
      success: false,
      error: {
        message: `Gradient kind "${gradient.kind}" is not one of none, linear, radial, conic.`,
        cause: 'invalid_gradient_kind',
        field: 'gradient.kind',
      },
    };
  }
  if (gradient.kind === 'none' && gradient.stops.length > 0) {
    return {
      success: false,
      error: {
        message: 'Gradient kind "none" must declare no stops.',
        cause: 'unexpected_stops',
        field: 'gradient.stops',
      },
    };
  }
  if (gradient.kind !== 'none' && gradient.stops.length < 2) {
    return {
      success: false,
      error: {
        message: `Gradient kind "${gradient.kind}" must declare at least two stops.`,
        cause: 'insufficient_stops',
        field: 'gradient.stops',
      },
    };
  }
  for (const stop of gradient.stops) {
    if (!Number.isFinite(stop.position) || stop.position < 0 || stop.position > 1) {
      return {
        success: false,
        error: {
          message: `Stop position ${stop.position} is outside 0..1.`,
          cause: 'invalid_stop_position',
          field: 'gradient.stops',
        },
      };
    }
    const stopColor = validateColor(stop.color);
    if (!stopColor.success) {
      return {
        success: false,
        error: {
          message: `Stop colour "${stop.color}" is invalid.`,
          cause: stopColor.error.cause,
          field: 'gradient.stops',
        },
      };
    }
  }
  if ((gradient.kind === 'linear' || gradient.kind === 'conic') && gradient.angle === undefined) {
    return {
      success: false,
      error: {
        message: `Gradient kind "${gradient.kind}" requires an angle.`,
        cause: 'missing_angle',
        field: 'gradient.angle',
      },
    };
  }
  return { success: true, value: gradient };
}

// --- Safety mode evaluation ---

export function isStyleAllowed(
  style: VisualStyle,
  mode: SafetyMode
): ValidationResult<VisualStyle> {
  if (mode !== SAFETY_MODE_STRICT) {
    return { success: true, value: style };
  }
  const ratio = contrastRatio(style.foreground, style.background);
  if (ratio < CONTRAST_DECODE_THRESHOLD) {
    return {
      success: false,
      error: {
        message: `Colour pair contrast ratio ${ratio.toFixed(2)} is below decode threshold ${CONTRAST_DECODE_THRESHOLD}.`,
        cause: 'contrast',
        field: 'foreground|background',
      },
    };
  }
  return { success: true, value: style };
}

// --- Default style ---

export function defaultStyle(): VisualStyle {
  return {
    moduleStyle: DEFAULT_MODULE_STYLE,
    finderStyle: DEFAULT_FINDER_STYLE,
    foreground: DEFAULT_FOREGROUND,
    background: DEFAULT_BACKGROUND,
    gradient: {
      kind: 'none',
      stops: [],
    },
  };
}

// --- Validation of a complete style ---

export function validateStyle(style: VisualStyle): ValidationResult<VisualStyle> {
  if (!validateModuleStyle(style.moduleStyle)) {
    return {
      success: false,
      error: {
        message: `Module style "${style.moduleStyle}" is not square, rounded, dots, diamond or connected.`,
        cause: 'invalid_module_style',
        field: 'moduleStyle',
      },
    };
  }
  if (!validateFinderStyle(style.finderStyle)) {
    return {
      success: false,
      error: {
        message: `Finder style "${style.finderStyle}" is not square, rounded or circle.`,
        cause: 'invalid_finder_style',
        field: 'finderStyle',
      },
    };
  }
  const fg = validateColor(style.foreground);
  if (!fg.success) {
    return {
      success: false,
      error: {
        message: `Foreground ${fg.error.message}`,
        cause: fg.error.cause,
        field: 'foreground',
      },
    };
  }
  const bg = validateColor(style.background);
  if (!bg.success) {
    return {
      success: false,
      error: {
        message: `Background ${bg.error.message}`,
        cause: bg.error.cause,
        field: 'background',
      },
    };
  }
  const grad = validateGradient(style.gradient);
  if (!grad.success) {
    return {
      success: false,
      error: {
        message: grad.error.message,
        cause: grad.error.cause,
        field: grad.error.field,
      },
    };
  }
  return { success: true, value: style };
}

// --- Construction with audit (validation precedes persistence) ---

export function createStyle(
  candidate: VisualStyle,
  audit: (style: VisualStyle) => ValidationResult<VisualStyle>
): ValidationResult<VisualStyle> {
  const result = audit(candidate);
  if (!result.success) {
    return result;
  }
  return { success: true, value: result.value };
}

// --- Mutable update that respects audit ordering ---

export interface StyledArtefact<P> {
  readonly payload: P;
  readonly outputFormat: string;
  readonly style: VisualStyle;
}

export function withStyle<P>(
  artefact: StyledArtefact<P>,
  nextStyle: VisualStyle,
  audit: (style: VisualStyle) => ValidationResult<VisualStyle>
): ValidationResult<StyledArtefact<P>> {
  const result = audit(nextStyle);
  if (!result.success) {
    return result;
  }
  return {
    success: true,
    value: {
      payload: artefact.payload,
      outputFormat: artefact.outputFormat,
      style: result.value,
    },
  };
}

// --- Orthogonality: style change does not affect payload or output format ---

export function applyStyle<P>(
  artefact: StyledArtefact<P>,
  nextStyle: VisualStyle
): StyledArtefact<P> {
  return {
    payload: artefact.payload,
    outputFormat: artefact.outputFormat,
    style: nextStyle,
  };
}

export function payloadUnchanged<P>(
  before: StyledArtefact<P>,
  after: StyledArtefact<P>
): boolean {
  return before.payload === after.payload && before.outputFormat === after.outputFormat;
}

// --- Live preview: determine availability under safety mode ---

export function previewAvailability(
  style: VisualStyle,
  mode: SafetyMode
): { readonly available: boolean; readonly reason?: string } {
  const result = isStyleAllowed(style, mode);
  if (result.success) {
    return { available: true };
  }
  return { available: false, reason: result.error.cause };
}

// --- Decode round-trip: the styled artefact decodes back to the unstyled payload ---

export function decodeStyled<P>(artefact: StyledArtefact<P>): P {
  return artefact.payload;
}

export function decodeRoundTrip<P>(
  artefact: StyledArtefact<P>,
  style: VisualStyle
): ValidationResult<P> {
  const applied = applyStyle(artefact, style);
  return { success: true, value: decodeStyled(applied) };
}

// --- Apply a style change with a default audit that enforces safety mode ---

export function applyStyleWithMode<P>(
  artefact: StyledArtefact<P>,
  nextStyle: VisualStyle,
  mode: SafetyMode
): ValidationResult<StyledArtefact<P>> {
  return withStyle(artefact, nextStyle, (s) => isStyleAllowed(s, mode));
}