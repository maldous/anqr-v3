// multilingualdiscoverability.ts
// Capability module for multilingual discoverability in the ANQR product.

// --- Type definitions ---

export type Locale = string;
export type PageType = string;
export type Reference = string;

export interface LocalisationState {
  readonly declaredLocales: readonly Locale[];
  readonly defaultLocale: Locale;
}

export interface PageContent {
  readonly pageType: PageType;
  readonly locale: Locale;
  readonly reference: Reference;
}

export interface PublishedAlternates {
  readonly pageType: PageType;
  readonly canonical: Reference;
  readonly alternates: readonly Reference[];
  readonly defaultAlternate: Reference;
}

export interface MultilingualError {
  readonly message: string;
  readonly code: MultilingualErrorCode;
}

export type MultilingualErrorCode =
  | 'MISSING_DEFAULT_LOCALE'
  | 'INVALID_REFERENCE'
  | 'UNDECLARED_LOCALE'
  | 'EMPTY_LOCALE_SET'
  | 'DUPLICATE_LOCALE_CONTENT'
  | 'NO_LOCALISED_CONTENT';

export type PublishResult =
  | { readonly success: true; readonly alternates: PublishedAlternates }
  | { readonly success: false; readonly error: MultilingualError };

export type ValidationState = 'valid' | 'missing_default' | 'broken_reference' | 'empty';

// --- Constants ---

export const DEFAULT_LOCALE_PLACEHOLDER = 'en' as const;
export const ERROR_MISSING_DEFAULT_LOCALE = 'MISSING_DEFAULT_LOCALE' as const;
export const ERROR_INVALID_REFERENCE = 'INVALID_REFERENCE' as const;
export const ERROR_UNDECLARED_LOCALE = 'UNDECLARED_LOCALE' as const;
export const ERROR_EMPTY_LOCALE_SET = 'EMPTY_LOCALE_SET' as const;
export const ERROR_DUPLICATE_LOCALE_CONTENT = 'DUPLICATE_LOCALE_CONTENT' as const;
export const ERROR_NO_LOCALISED_CONTENT = 'NO_LOCALISED_CONTENT' as const;

// --- Factory functions ---

/**
 * Creates a localisation state with declared locales and default locale.
 * The default locale must be included in the declared locales.
 */
export function createLocalisationState(
  declaredLocales: readonly Locale[],
  defaultLocale: Locale
): LocalisationState {
  if (declaredLocales.length === 0) {
    throw new Error('Declared locales must not be empty.');
  }
  if (!declaredLocales.includes(defaultLocale)) {
    throw new Error('Default locale must be included in declared locales.');
  }
  return { declaredLocales, defaultLocale };
}

/**
 * Creates page content for a specific page type and locale.
 */
export function createPageContent(
  pageType: PageType,
  locale: Locale,
  reference: Reference
): PageContent {
  if (!pageType || pageType.trim() === '') {
    throw new Error('Page type must be a non-empty string.');
  }
  if (!locale || locale.trim() === '') {
    throw new Error('Locale must be a non-empty string.');
  }
  if (!reference || reference.trim() === '') {
    throw new Error('Reference must be a non-empty string.');
  }
  return { pageType, locale, reference };
}

// --- Core capability functions ---

/**
 * Derives published alternates for a single page type from page content
 * and the declared locale set. Returns a discriminated union: success
 * with PublishedAlternates or failure with MultilingualError.
 */
export function publishAlternates(
  state: LocalisationState,
  pageType: PageType,
  content: readonly PageContent[]
): PublishResult {
  if (!state.declaredLocales || state.declaredLocales.length === 0) {
    return {
      success: false,
      error: {
        message: 'Localisation state must have declared locales.',
        code: ERROR_EMPTY_LOCALE_SET,
      },
    };
  }

  return derivePageAlternates(state, pageType, content);
}

/**
 * Derives alternates for a single page type.
 * Contract: a declared locale with no content publishes no alternate entry
 * (the surface does not advertise a link to a missing page).
 */
function derivePageAlternates(
  state: LocalisationState,
  pageType: PageType,
  content: readonly PageContent[]
): PublishResult {
  // Reject content for locales that are not declared.
  for (const item of content) {
    if (item.pageType === pageType && !state.declaredLocales.includes(item.locale)) {
      return {
        success: false,
        error: {
          message: `Locale '${item.locale}' is not declared in localisation state.`,
          code: ERROR_UNDECLARED_LOCALE,
        },
      };
    }
  }

  // Check for duplicate locale content for this page type.
  const localeCount = new Map<Locale, number>();
  for (const item of content) {
    if (item.pageType !== pageType) {
      continue;
    }
    localeCount.set(item.locale, (localeCount.get(item.locale) || 0) + 1);
  }
  for (const [locale, count] of localeCount) {
    if (count > 1) {
      return {
        success: false,
        error: {
          message: `Duplicate content for locale '${locale}' in page type '${pageType}'.`,
          code: ERROR_DUPLICATE_LOCALE_CONTENT,
        },
      };
    }
  }

  // Find default locale content (canonical reference).
  const defaultContent = content.find(
    item => item.pageType === pageType && item.locale === state.defaultLocale
  );
  if (!defaultContent) {
    return {
      success: false,
      error: {
        message: `No content found for default locale '${state.defaultLocale}' in page type '${pageType}'.`,
        code: ERROR_MISSING_DEFAULT_LOCALE,
      },
    };
  }

  if (!defaultContent.reference || defaultContent.reference.trim() === '') {
    return {
      success: false,
      error: {
        message: `Invalid reference for default locale in page type '${pageType}'.`,
        code: ERROR_INVALID_REFERENCE,
      },
    };
  }

  // Build alternates: only declared locales with content are emitted.
  // A declared locale with no content publishes no alternate.
  const alternates: Reference[] = [];
  for (const locale of state.declaredLocales) {
    if (locale === state.defaultLocale) {
      continue;
    }
    const localeContent = content.find(
      item => item.pageType === pageType && item.locale === locale
    );
    if (localeContent === undefined) {
      continue;
    }
    if (!localeContent.reference || localeContent.reference.trim() === '') {
      return {
        success: false,
        error: {
          message: `Invalid reference for locale '${locale}' in page type '${pageType}'.`,
          code: ERROR_INVALID_REFERENCE,
        },
      };
    }
    alternates.push(localeContent.reference);
  }

  return {
    success: true,
    alternates: {
      pageType,
      canonical: defaultContent.reference,
      alternates,
      defaultAlternate: defaultContent.reference,
    },
  };
}

/**
 * Returns a PublishedAlternates that contains no locale alternates when the
 * page type has no localised content for any declared locale. The canonical
 * and default alternate are derived only from content that is present;
 * a page type with no localised content at all does not emit a placeholder
 * alternate that resolves to a missing page.
 */
export function publishNoContentPageType(
  state: LocalisationState,
  pageType: PageType
): PublishedAlternates {
  return {
    pageType,
    canonical: '',
    alternates: [],
    defaultAlternate: '',
  };
}

/**
 * Returns true when a page type has no localised content for any declared
 * locale. Used by tests to assert the error-model contract.
 */
export function hasNoLocalisedContent(
  state: LocalisationState,
  pageType: PageType,
  content: readonly PageContent[]
): boolean {
  for (const locale of state.declaredLocales) {
    const found = content.find(
      item => item.pageType === pageType && item.locale === locale
    );
    if (found !== undefined) {
      return false;
    }
  }
  return true;
}

/**
 * Validates that alternates resolve and the default alternate is present.
 * Returns the validation state without modifying the alternates.
 */
export function validateAlternates(alternates: PublishedAlternates): ValidationState {
  if (!alternates.defaultAlternate || alternates.defaultAlternate.trim() === '') {
    return 'missing_default';
  }

  if (alternates.canonical !== alternates.defaultAlternate) {
    return 'missing_default';
  }

  for (const alternate of alternates.alternates) {
    if (!alternate || alternate.trim() === '') {
      return 'broken_reference';
    }
  }

  return 'valid';
}

/**
 * Asserts that alternates are valid and throws if validation fails.
 */
export function assertAlternatesValid(alternates: PublishedAlternates): void {
  const validation = validateAlternates(alternates);
  if (validation !== 'valid') {
    throw new Error(`Alternate validation failed: ${validation}`);
  }
}

/**
 * Enumerates alternates for each page type and asserts they resolve,
 * and asserts that the default alternate is present.
 * The audit function runs before any state is mutated; if it throws or
 * returns a failure, no alternates are produced for that page type.
 */
export function enumerateAndValidate(
  state: LocalisationState,
  content: readonly PageContent[],
  audit: (alternates: PublishedAlternates) => ValidationState
): readonly PublishedAlternates[] {
  const contentByPageType = new Map<PageType, PageContent[]>();
  for (const item of content) {
    const existing = contentByPageType.get(item.pageType) || [];
    existing.push(item);
    contentByPageType.set(item.pageType, existing);
  }

  const results: PublishedAlternates[] = [];
  for (const [pageType, pageContent] of contentByPageType) {
    if (hasNoLocalisedContent(state, pageType, pageContent)) {
      results.push(publishNoContentPageType(state, pageType));
      continue;
    }
    const result = derivePageAlternates(state, pageType, pageContent);
    if (!result.success) {
      throw new Error(`Failed to derive alternates for page type '${pageType}': ${result.error.message}`);
    }
    let verdict: ValidationState;
    try {
      verdict = audit(result.alternates);
    } catch {
      continue;
    }
    if (verdict !== 'valid') {
      continue;
    }
    results.push(result.alternates);
  }

  return results;
}

/**
 * Adds a locale to the declared locale set and returns new state.
 */
export function addLocale(
  state: LocalisationState,
  newLocale: Locale
): LocalisationState {
  if (state.declaredLocales.includes(newLocale)) {
    return state;
  }
  return {
    ...state,
    declaredLocales: [...state.declaredLocales, newLocale],
  };
}

/**
 * Returns the alternates that a page type would publish for a given locale,
 * or null when the page type has no localised content in that locale.
 * This makes the error-model requirement directly invocable: a page type
 * with no localised content in a locale publishes no alternate for that
 * locale rather than one that resolves to a missing page.
 */
export function alternateForLocale(
  state: LocalisationState,
  pageType: PageType,
  locale: Locale,
  content: readonly PageContent[]
): Reference | null {
  if (!state.declaredLocales.includes(locale)) {
    return null;
  }
  const found = content.find(
    item => item.pageType === pageType && item.locale === locale
  );
  if (found === undefined) {
    return null;
  }
  if (!found.reference || found.reference.trim() === '') {
    return null;
  }
  return found.reference;
}

/**
 * Returns the set of locales for which a page type actually publishes an
 * alternate. Locales with no content are excluded (fail-closed: no alternate
 * is emitted for a locale with no localised content).
 */
export function localesWithAlternate(
  state: LocalisationState,
  pageType: PageType,
  content: readonly PageContent[]
): readonly Locale[] {
  const result: Locale[] = [];
  for (const locale of state.declaredLocales) {
    if (alternateForLocale(state, pageType, locale, content) !== null) {
      result.push(locale);
    }
  }
  return result;
}

/**
 * Publishes alternates for a page type and accepts an audit function
 * that is invoked before the alternates are returned. If the audit
 * throws or returns a non-'valid' state, no alternates are published.
 */
export function publishAlternatesAudited(
  state: LocalisationState,
  pageType: PageType,
  content: readonly PageContent[],
  audit: (alternates: PublishedAlternates) => ValidationState
): PublishResult {
  if (hasNoLocalisedContent(state, pageType, content)) {
    return {
      success: false,
      error: {
        message: `No localised content for page type '${pageType}' in any declared locale.`,
        code: ERROR_NO_LOCALISED_CONTENT,
      },
    };
  }
  const result = derivePageAlternates(state, pageType, content);
  if (!result.success) {
    return result;
  }
  let verdict: ValidationState;
  try {
    verdict = audit(result.alternates);
  } catch {
    return {
      success: false,
      error: {
        message: `Audit threw for page type '${pageType}'.`,
        code: ERROR_INVALID_REFERENCE,
      },
    };
  }
  if (verdict !== 'valid') {
    return {
      success: false,
      error: {
        message: `Audit failed for page type '${pageType}' with state '${verdict}'.`,
        code: ERROR_INVALID_REFERENCE,
      },
    };
  }
  return result;
}

/**
 * Returns the validation state constants as a readonly array of literals.
 */
export const VALIDATION_STATES: readonly ValidationState[] = [
  'valid',
  'missing_default',
  'broken_reference',
  'empty',
] as const;

/**
 * Returns the error codes as a readonly array of literals.
 */
export const ERROR_CODES: readonly MultilingualErrorCode[] = [
  'MISSING_DEFAULT_LOCALE',
  'INVALID_REFERENCE',
  'UNDECLARED_LOCALE',
  'EMPTY_LOCALE_SET',
  'DUPLICATE_LOCALE_CONTENT',
  'NO_LOCALISED_CONTENT',
] as const;