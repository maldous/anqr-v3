// localetypography.ts
// Capability module for localised typography in the ANQR product.

// --- Type definitions ---

export type Locale = string;
export type FontResource = string;
export type SystemFont = string;

export interface LocaleFontMap {
  readonly [locale: Locale]: FontResource;
}

export interface TypographyState {
  readonly localeFontMap: LocaleFontMap;
  readonly loadedFonts: ReadonlySet<FontResource>;
  readonly failedFonts: ReadonlySet<FontResource>;
  readonly systemFont: SystemFont;
}

export interface FontLoadResult {
  readonly success: true;
  readonly font: FontResource;
}

export interface FontLoadError {
  readonly success: false;
  readonly font: FontResource;
  readonly fallback: SystemFont;
  readonly reason: string;
}

export type FontLoadOutcome = FontLoadResult | FontLoadError;

export interface TypographyRender {
  readonly text: string;
  readonly locale: Locale;
  readonly font: FontResource | SystemFont;
  readonly isFallback: boolean;
}

// --- Constants ---

export const DEFAULT_SYSTEM_FONT: SystemFont = 'system-ui';
export const FALLBACK_FONT: SystemFont = 'sans-serif';

export const FONT_LOAD_OUTCOMES = ['success', 'failure'] as const;
export type FontLoadOutcomeType = typeof FONT_LOAD_OUTCOMES[number];

// --- Factory functions ---

/**
 * Creates initial typography state with a locale-to-font map and system font.
 */
export function createTypographyState(
  localeFontMap: LocaleFontMap = {},
  systemFont: SystemFont = DEFAULT_SYSTEM_FONT
): TypographyState {
  return {
    localeFontMap: { ...localeFontMap },
    loadedFonts: new Set(),
    failedFonts: new Set(),
    systemFont,
  };
}

/**
 * Creates a font load result indicating successful loading.
 */
export function createFontLoadSuccess(font: FontResource): FontLoadResult {
  return { success: true, font };
}

/**
 * Creates a font load error with fallback information.
 */
export function createFontLoadError(
  font: FontResource,
  reason: string,
  fallback: SystemFont = FALLBACK_FONT
): FontLoadError {
  return { success: false, font, fallback, reason };
}

// --- Core functions ---

/**
 * Resolves which font should be requested for a given locale.
 * Returns the font resource if declared, null if none should be requested.
 * Pure function: does not modify state.
 */
export function resolveLocaleFont(
  locale: Locale,
  state: TypographyState
): FontResource | null {
  return state.localeFontMap[locale] || null;
}

/**
 * Checks if a font should be requested based on locale resolution.
 * Returns true only when a font is declared for the locale.
 */
export function shouldRequestFont(
  locale: Locale,
  state: TypographyState
): boolean {
  return resolveLocaleFont(locale, state) !== null;
}

/**
 * Processes a font load outcome and returns new typography state.
 * On success: adds font to loadedFonts.
 * On failure: adds font to failedFonts and returns fallback information.
 * Pure function: does not mutate input state.
 */
export function processFontLoadOutcome(
  outcome: FontLoadOutcome,
  state: TypographyState
): TypographyState {
  if (outcome.success) {
    return {
      ...state,
      loadedFonts: new Set([...state.loadedFonts, outcome.font]),
    };
  }
  
  return {
    ...state,
    failedFonts: new Set([...state.failedFonts, outcome.font]),
  };
}

/**
 * Gets the effective font for rendering text in a given locale.
 * Returns the loaded font if available, system font as fallback.
 * Pure function.
 */
export function getEffectiveFont(
  locale: Locale,
  state: TypographyState
): FontResource | SystemFont {
  const declaredFont = resolveLocaleFont(locale, state);
  
  if (!declaredFont) {
    return state.systemFont;
  }
  
  if (state.loadedFonts.has(declaredFont)) {
    return declaredFont;
  }
  
  if (state.failedFonts.has(declaredFont)) {
    return FALLBACK_FONT;
  }
  
  // Font is declared but not yet loaded or failed - use system font for immediate render
  return state.systemFont;
}

/**
 * Creates a typography render representation for text in a given locale.
 * Shows whether the render uses a fallback font.
 * Pure function.
 */
export function createTypographyRender(
  text: string,
  locale: Locale,
  state: TypographyState
): TypographyRender {
  const effectiveFont = getEffectiveFont(locale, state);
  const declaredFont = resolveLocaleFont(locale, state);
  const isFallback = declaredFont ? 
    (state.failedFonts.has(declaredFont) || !state.loadedFonts.has(declaredFont)) : 
    false;

  return {
    text,
    locale,
    font: effectiveFont,
    isFallback,
  };
}

/**
 * Audit function that validates font loading prerequisites.
 * Throws if font should not be loaded or is already in a terminal state.
 */
export function auditFontLoad(
  font: FontResource,
  state: TypographyState
): void {
  if (state.loadedFonts.has(font)) {
    throw new Error(`Font ${font} is already loaded`);
  }
  
  if (state.failedFonts.has(font)) {
    throw new Error(`Font ${font} has already failed loading`);
  }
}

/**
 * Mutation function that processes font loading with audit guard.
 * Only mutates state if audit passes.
 * Returns new state or throws error.
 */
export function loadFontWithAudit(
  font: FontResource,
  outcome: FontLoadOutcome,
  state: TypographyState,
  audit: (font: FontResource, state: TypographyState) => void = auditFontLoad
): TypographyState {
  // Audit must precede mutation - audit throws on failure
  audit(font, state);
  
  // Only proceed with mutation if audit passed
  return processFontLoadOutcome(outcome, state);
}

/**
 * Validates that resolving a locale with declared font requests that font,
 * and resolving one without requests none.
 * Returns true if validation passes.
 */
export function validateLocaleResolution(
  locale: Locale,
  state: TypographyState
): boolean {
  const declaredFont = resolveLocaleFont(locale, state);
  
  if (declaredFont) {
    // Should request font - check it's not already loaded/failed
    return !state.loadedFonts.has(declaredFont) && 
           !state.failedFonts.has(declaredFont);
  }
  
  // No font declared - should not request any
  return true;
}

/**
 * Gets all locales that have declared fonts but haven't been loaded yet.
 */
export function getPendingLocales(state: TypographyState): Locale[] {
  return Object.keys(state.localeFontMap).filter(locale => {
    const font = state.localeFontMap[locale];
    return !state.loadedFonts.has(font) && !state.failedFonts.has(font);
  });
}

/**
 * Gets all failed fonts with their fallback information.
 */
export function getFailedFontFallbacks(state: TypographyState): Array<{
  font: FontResource;
  fallback: SystemFont;
}> {
  return Array.from(state.failedFonts).map(font => ({
    font,
    fallback: FALLBACK_FONT,
  }));
}