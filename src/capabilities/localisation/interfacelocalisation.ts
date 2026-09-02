// interfacelocalisation.ts
// Capability module for interface localisation in the ANQR product.

// --- Type definitions ---

export interface Locale {
  readonly code: string;
  readonly englishName: string;
  readonly nativeName: string;
  readonly direction: 'ltr' | 'rtl';
  readonly strings: readonly LocalisationString[];
}

export interface LocalisationString {
  readonly key: string;
  readonly value: string;
}

export interface LocalisationState {
  readonly availableLocales: readonly Locale[];
  readonly activeLocaleCode: string;
  readonly sourceLocaleCode: string;
}

export interface ResolveResult {
  readonly resolved: string;
  readonly missing: boolean;
}

export interface ValidationResult {
  readonly success: true;
}

export interface ValidationFailure {
  readonly success: false;
  readonly error: string;
}

export type LocalisationValidationResult = ValidationResult | ValidationFailure;

// --- Constants ---

export const DIRECTION_LTR = 'ltr' as const;
export const DIRECTION_RTL = 'rtl' as const;

export const SOURCE_LOCALE_CODE = 'en' as const;

export const AVAILABLE_LOCALE_CODES = ['en', 'es', 'fr', 'de', 'ja', 'ar'] as const;
export type LocaleCode = typeof AVAILABLE_LOCALE_CODES[number];

// --- Factory functions ---

/**
 * Creates a locale with code, names, direction, and string mappings.
 */
export function createLocale(
  code: string,
  englishName: string,
  nativeName: string,
  direction: 'ltr' | 'rtl',
  strings: readonly LocalisationString[]
): Locale {
  if (!code || code.trim() === '') {
    throw new Error('Locale code must be a non-empty string.');
  }
  if (!englishName || englishName.trim() === '') {
    throw new Error('Locale englishName must be a non-empty string.');
  }
  if (!nativeName || nativeName.trim() === '') {
    throw new Error('Locale nativeName must be a non-empty string.');
  }
  if (direction !== DIRECTION_LTR && direction !== DIRECTION_RTL) {
    throw new Error('Locale direction must be "ltr" or "rtl".');
  }

  return {
    code,
    englishName,
    nativeName,
    direction,
    strings,
  };
}

/**
 * Creates initial localisation state with available locales and active locale.
 */
export function createInitialLocalisationState(
  availableLocales: readonly Locale[],
  activeLocaleCode: string = SOURCE_LOCALE_CODE
): LocalisationState {
  if (!availableLocales || availableLocales.length === 0) {
    throw new Error('At least one locale must be provided.');
  }
  
  const codes = availableLocales.map(l => l.code);
  if (!codes.includes(activeLocaleCode)) {
    throw new Error(`Active locale code "${activeLocaleCode}" not found in available locales.`);
  }
  if (!codes.includes(SOURCE_LOCALE_CODE)) {
    throw new Error(`Source locale code "${SOURCE_LOCALE_CODE}" not found in available locales.`);
  }

  return {
    availableLocales,
    activeLocaleCode,
    sourceLocaleCode: SOURCE_LOCALE_CODE,
  };
}

// --- Core functions ---

/**
 * Resolves a string key against the active locale, falling back to source locale.
 * Returns the resolved string and whether the key was missing in the active locale.
 */
export function resolveString(
  state: LocalisationState,
  key: string,
  placeholders?: readonly string[]
): ResolveResult {
  if (!key || key.trim() === '') {
    throw new Error('Key must be a non-empty string.');
  }

  const activeLocale = state.availableLocales.find(l => l.code === state.activeLocaleCode);
  if (!activeLocale) {
    throw new Error(`Active locale "${state.activeLocaleCode}" not found.`);
  }

  const sourceLocale = state.availableLocales.find(l => l.code === state.sourceLocaleCode);
  if (!sourceLocale) {
    throw new Error(`Source locale "${state.sourceLocaleCode}" not found.`);
  }

  // Try active locale first
  const activeString = activeLocale.strings.find(s => s.key === key);
  if (activeString) {
    return {
      resolved: substitutePlaceholders(activeString.value, placeholders),
      missing: false,
    };
  }

  // Fall back to source locale
  const sourceString = sourceLocale.strings.find(s => s.key === key);
  if (sourceString) {
    return {
      resolved: substitutePlaceholders(sourceString.value, placeholders),
      missing: true,
    };
  }

  // Key not found in any locale - this should not happen if validation passes
  throw new Error(`Key "${key}" not found in any locale.`);
}

/**
 * Sets the active locale and returns new state.
 * Throws if the locale code is not available.
 */
export function setActiveLocale(
  state: LocalisationState,
  localeCode: string
): LocalisationState {
  const locale = state.availableLocales.find(l => l.code === localeCode);
  if (!locale) {
    throw new Error(`Locale code "${localeCode}" not found in available locales.`);
  }

  return {
    ...state,
    activeLocaleCode: localeCode,
  };
}

/**
 * Gets available locales sorted by native name for language selection.
 */
export function getLocalesByNativeName(
  state: LocalisationState
): readonly Locale[] {
  return [...state.availableLocales].sort((a, b) => 
    a.nativeName.localeCompare(b.nativeName)
  );
}

// --- Validation functions ---

/**
 * Validates that a locale string has no raw keys and properly closed placeholders.
 */
export function validateLocaleString(
  key: string,
  value: string
): LocalisationValidationResult {
  if (value === key) {
    return {
      success: false,
      error: `Raw key detected: string value equals key "${key}"`,
    };
  }

  // Check for unclosed placeholders
  const placeholderRegex = /\{(\d+)\}/g;
  const openBraces: number[] = [];
  let match;
  
  while ((match = placeholderRegex.exec(value)) !== null) {
    const placeholderNum = parseInt(match[1], 10);
    // Check for duplicate placeholder numbers
    if (openBraces.includes(placeholderNum)) {
      return {
        success: false,
        error: `Duplicate placeholder {${placeholderNum}} in key "${key}"`,
      };
    }
    openBraces.push(placeholderNum);
  }

  // Check for unmatched braces
  const braceCount = (value.match(/{/g) || []).length;
  const closeBraceCount = (value.match(/}/g) || []).length;
  
  if (braceCount !== closeBraceCount) {
    return {
      success: false,
      error: `Unmatched braces in key "${key}": ${braceCount} open, ${closeBraceCount} close`,
    };
  }

  return { success: true };
}

/**
 * Validates all strings in a locale.
 */
export function validateLocale(locale: Locale): LocalisationValidationResult {
  for (const string of locale.strings) {
    const result = validateLocaleString(string.key, string.value);
    if (!result.success) {
      return {
        success: false,
        error: `Locale "${locale.code}": ${result.error}`,
      };
    }
  }
  return { success: true };
}

/**
 * Validates all locales in the state.
 */
export function validateAllLocales(state: LocalisationState): LocalisationValidationResult {
  for (const locale of state.availableLocales) {
    const result = validateLocale(locale);
    if (!result.success) {
      return result;
    }
  }
  return { success: true };
}

// --- Helper functions ---

function substitutePlaceholders(
  template: string,
  placeholders?: readonly string[]
): string {
  if (!placeholders || placeholders.length === 0) {
    return template;
  }

  return template.replace(/\{(\d+)\}/g, (match, num) => {
    const index = parseInt(num, 10);
    return index < placeholders.length ? placeholders[index] : match;
  });
}

/**
 * Gets the active locale from state.
 */
export function getActiveLocale(state: LocalisationState): Locale {
  const locale = state.availableLocales.find(l => l.code === state.activeLocaleCode);
  if (!locale) {
    throw new Error(`Active locale "${state.activeLocaleCode}" not found.`);
  }
  return locale;
}

/**
 * Gets the source locale from state.
 */
export function getSourceLocale(state: LocalisationState): Locale {
  const locale = state.availableLocales.find(l => l.code === state.sourceLocaleCode);
  if (!locale) {
    throw new Error(`Source locale "${state.sourceLocaleCode}" not found.`);
  }
  return locale;
}