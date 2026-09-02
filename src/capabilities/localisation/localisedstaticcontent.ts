// localisedstaticcontent.ts
// Capability module for localised static content in the ANQR product.

// --- Type definitions ---

export interface Link {
  readonly label: string;
  readonly href: string;
  readonly isInternal: boolean;
}

export interface Section {
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly bullets: readonly string[];
}

export interface PageDefinition {
  readonly title: string;
  readonly description: string;
  readonly lastUpdated: string; // ISO date string
  readonly primaryLinks: readonly Link[];
  readonly relatedLinks: readonly Link[];
  readonly sections: readonly Section[];
}

export interface LocaleContent {
  readonly localeCode: string;
  readonly pages: Record<string, PageDefinition>;
}

export interface StaticContentState {
  readonly sourceLocale: string;
  readonly locales: Record<string, LocaleContent>;
}

export interface GapReport {
  readonly localeCode: string;
  readonly pageType: string;
  readonly fallbackLocale: string;
}

export type PageResult =
  | { readonly success: true; readonly page: PageDefinition; readonly gap?: GapReport }
  | { readonly success: false; readonly error: string };

export type LocaleValidationResult =
  | { readonly success: true; readonly localeCode: string }
  | { readonly success: false; readonly error: string };

export type PageValidationResult =
  | { readonly success: true; readonly pageType: string }
  | { readonly success: false; readonly error: string };

export type RenderResult =
  | { readonly success: true; readonly page: PageDefinition; readonly localeCode: string; readonly gap?: GapReport }
  | { readonly success: false; readonly error: string };

// --- Constants ---

// No hardcoded locale defaults; source locale must be provided explicitly.

// --- Factory functions ---

/**
 * Creates a new link object with label, href, and internal flag.
 */
export function createLink(label: string, href: string, isInternal: boolean = true): Link {
  if (!label || label.trim() === '') {
    throw new Error('Link label must be a non-empty string.');
  }
  if (!href || href.trim() === '') {
    throw new Error('Link href must be a non-empty string.');
  }
  return { label: label.trim(), href: href.trim(), isInternal };
}

/**
 * Creates a new section with heading, paragraphs, and bullets.
 */
export function createSection(
  heading: string,
  paragraphs: readonly string[] = [],
  bullets: readonly string[] = []
): Section {
  if (!heading || heading.trim() === '') {
    throw new Error('Section heading must be a non-empty string.');
  }
  return {
    heading: heading.trim(),
    paragraphs: paragraphs.map(p => p.trim()).filter(p => p !== ''),
    bullets: bullets.map(b => b.trim()).filter(b => b !== ''),
  };
}

/**
 * Creates a new page definition with all required fields.
 */
export function createPageDefinition(
  title: string,
  description: string,
  lastUpdated: string,
  primaryLinks: readonly Link[] = [],
  relatedLinks: readonly Link[] = [],
  sections: readonly Section[] = []
): PageDefinition {
  if (!title || title.trim() === '') {
    throw new Error('Page title must be a non-empty string.');
  }
  if (!description || description.trim() === '') {
    throw new Error('Page description must be a non-empty string.');
  }
  if (!lastUpdated || !isValidDate(lastUpdated)) {
    throw new Error('Page lastUpdated must be a valid ISO date string.');
  }
  return {
    title: title.trim(),
    description: description.trim(),
    lastUpdated,
    primaryLinks: [...primaryLinks],
    relatedLinks: [...relatedLinks],
    sections: [...sections],
  };
}

/**
 * Creates a new locale content object.
 */
export function createLocaleContent(localeCode: string, pages: Record<string, PageDefinition> = {}): LocaleContent {
  if (!localeCode || localeCode.trim() === '') {
    throw new Error('Locale code must be a non-empty string.');
  }
  return { localeCode: localeCode.trim(), pages: { ...pages } };
}

/**
 * Creates initial static content state with source locale.
 * Source locale must be provided explicitly; no hardcoded default.
 */
export function createStaticContentState(sourceLocale: string): StaticContentState {
  if (!sourceLocale || sourceLocale.trim() === '') {
    throw new Error('Source locale must be a non-empty string.');
  }
  return {
    sourceLocale,
    locales: {},
  };
}

// --- Validation functions ---

function isValidDate(dateString: string): boolean {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime()) && dateString === date.toISOString().split('T')[0];
}

/**
 * Validates that a locale exists in the state.
 */
export function validateLocaleExists(
  state: StaticContentState,
  localeCode: string
): LocaleValidationResult {
  if (!localeCode || localeCode.trim() === '') {
    return { success: false, error: 'Locale code must be a non-empty string.' };
  }
  if (!state.locales[localeCode]) {
    return { success: false, error: `Locale ${localeCode} not found in state.` };
  }
  return { success: true, localeCode };
}

/**
 * Validates that a page type exists in a locale.
 */
export function validatePageExists(
  locale: LocaleContent,
  pageType: string
): PageValidationResult {
  if (!pageType || pageType.trim() === '') {
    return { success: false, error: 'Page type must be a non-empty string.' };
  }
  if (!locale.pages[pageType]) {
    return { success: false, error: `Page type ${pageType} not found in locale ${locale.localeCode}.` };
  }
  return { success: true, pageType };
}

// --- Core capability functions ---

/**
 * Adds a new locale to the static content state.
 * Returns new state; does not mutate input.
 */
export function addLocale(
  state: StaticContentState,
  localeContent: LocaleContent
): StaticContentState {
  if (!localeContent.localeCode || localeContent.localeCode.trim() === '') {
    throw new Error('Locale code must be a non-empty string.');
  }
  if (state.locales[localeContent.localeCode]) {
    throw new Error(`Locale ${localeContent.localeCode} already exists.`);
  }
  if (localeContent.localeCode === state.sourceLocale) {
    throw new Error('Cannot add source locale as a new locale.');
  }

  return {
    ...state,
    locales: {
      ...state.locales,
      [localeContent.localeCode]: localeContent,
    },
  };
}

/**
 * Adds a page definition to a locale.
 * Returns new locale content; does not mutate input.
 */
export function addPageToLocale(
  locale: LocaleContent,
  pageType: string,
  page: PageDefinition
): LocaleContent {
  if (!pageType || pageType.trim() === '') {
    throw new Error('Page type must be a non-empty string.');
  }
  return {
    ...locale,
    pages: {
      ...locale.pages,
      [pageType]: page,
    },
  };
}

/**
 * Gets a page from a locale with fallback to source language.
 * Reports gap if page type is missing in requested locale (locale must exist).
 * Does NOT fallback if the locale itself is missing.
 */
export function getPage(
  state: StaticContentState,
  localeCode: string,
  pageType: string
): PageResult {
  if (!localeCode || localeCode.trim() === '') {
    return { success: false, error: 'Locale code must be a non-empty string.' };
  }
  if (!pageType || pageType.trim() === '') {
    return { success: false, error: 'Page type must be a non-empty string.' };
  }

  const locale = state.locales[localeCode];
  if (!locale) {
    // Locale does not exist: fail-closed, no fallback
    return { success: false, error: `Locale ${localeCode} not found in state.` };
  }

  // Locale exists; check for page
  if (locale.pages[pageType]) {
    return { success: true, page: locale.pages[pageType] };
  }

  // Page type missing in this locale: fallback to source language and report gap
  const sourceLocale = state.locales[state.sourceLocale];
  if (sourceLocale && sourceLocale.pages[pageType]) {
    const gapReport: GapReport = {
      localeCode,
      pageType,
      fallbackLocale: state.sourceLocale,
    };
    return {
      success: true,
      page: sourceLocale.pages[pageType],
      gap: gapReport,
    };
  }

  return { success: false, error: `Page type ${pageType} not found in locale ${localeCode} or source locale.` };
}

/**
 * Resolves internal links within a specific locale.
 * Ensures links point to pages that exist in the same locale.
 */
export function resolveInternalLinks(
  state: StaticContentState,
  localeCode: string,
  page: PageDefinition
): PageResult {
  const localeValidation = validateLocaleExists(state, localeCode);
  if (!localeValidation.success) {
    return { success: false, error: localeValidation.error };
  }

  const resolvedPrimaryLinks: Link[] = [];
  const resolvedRelatedLinks: Link[] = [];

  for (const link of page.primaryLinks) {
    if (link.isInternal) {
      const pageResult = getPage(state, localeCode, link.href);
      if (pageResult.success) {
        resolvedPrimaryLinks.push(link);
      } else {
        return { success: false, error: `Internal link ${link.href} could not be resolved in locale ${localeCode}.` };
      }
    } else {
      resolvedPrimaryLinks.push(link);
    }
  }

  for (const link of page.relatedLinks) {
    if (link.isInternal) {
      const pageResult = getPage(state, localeCode, link.href);
      if (pageResult.success) {
        resolvedRelatedLinks.push(link);
      } else {
        return { success: false, error: `Internal link ${link.href} could not be resolved in locale ${localeCode}.` };
      }
    } else {
      resolvedRelatedLinks.push(link);
    }
  }

  const resolvedPage: PageDefinition = {
    ...page,
    primaryLinks: resolvedPrimaryLinks,
    relatedLinks: resolvedRelatedLinks,
  };

  return { success: true, page: resolvedPage };
}

/**
 * Renders a page: loads it (with fallback) and resolves internal links in the page's own locale.
 * Returns the rendered page, the locale it was served from, and an optional gap report.
 */
export function renderPage(
  state: StaticContentState,
  localeCode: string,
  pageType: string
): RenderResult {
  const pageResult = getPage(state, localeCode, pageType);
  if (!pageResult.success) {
    return { success: false, error: pageResult.error };
  }

  // Determine the locale that actually served the page
  const servedLocale = pageResult.gap ? pageResult.gap.fallbackLocale : localeCode;

  // Resolve internal links in the served locale (so navigation matches body language)
  const resolveResult = resolveInternalLinks(state, servedLocale, pageResult.page);
  if (!resolveResult.success) {
    return { success: false, error: resolveResult.error };
  }

  return {
    success: true,
    page: resolveResult.page,
    localeCode: servedLocale,
    gap: pageResult.gap,
  };
}

/**
 * Validates that all declared locales and page types are loaded and rendered,
 * and that internal links are resolved within each locale.
 *
 * Renders every page in every locale; for non-source locales, uses the requested locale
 * (so a gap is recorded when a page type is missing in that locale).
 */
export function validateContentCompleteness(state: StaticContentState): {
  readonly localeValidations: LocaleValidationResult[];
  readonly pageValidations: PageValidationResult[];
  readonly missingPages: GapReport[];
  readonly renderingErrors: string[];
} {
  const localeValidations: LocaleValidationResult[] = [];
  const pageValidations: PageValidationResult[] = [];
  const missingPages: GapReport[] = [];
  const renderingErrors: string[] = [];

  // Validate every declared locale
  for (const localeCode of Object.keys(state.locales)) {
    const locale = state.locales[localeCode];
    if (locale) {
      localeValidations.push({ success: true, localeCode });

      // Check each page in this locale can be rendered (loads + links resolve)
      for (const pageType of Object.keys(locale.pages)) {
        const renderResult = renderPage(state, localeCode, pageType);
        if (!renderResult.success) {
          renderingErrors.push(`Locale ${localeCode}, page ${pageType}: ${renderResult.error}`);
        }
        // Also record page existence validation
        pageValidations.push({ success: true, pageType });
      }

      // Detect pages missing in this locale compared to source
      const sourceLocale = state.locales[state.sourceLocale];
      if (sourceLocale && localeCode !== state.sourceLocale) {
        for (const pageType of Object.keys(sourceLocale.pages)) {
          if (!locale.pages[pageType]) {
            missingPages.push({
              localeCode,
              pageType,
              fallbackLocale: state.sourceLocale,
            });
          }
        }
      }
    } else {
      localeValidations.push({ success: false, error: `Locale ${localeCode} not found in state.` });
    }
  }

  // Validate source locale pages explicitly
  const sourceLocale = state.locales[state.sourceLocale];
  if (sourceLocale) {
    for (const pageType of Object.keys(sourceLocale.pages)) {
      const validation = validatePageExists(sourceLocale, pageType);
      pageValidations.push(validation);
    }
  }

  return {
    localeValidations,
    pageValidations,
    missingPages,
    renderingErrors,
  };
}

/**
 * Generates table of contents for a page in the same language as the body.
 * Ensures TOC matches the page's section headings.
 */
export function generateTableOfContents(page: PageDefinition): readonly string[] {
  return page.sections.map(section => section.heading);
}

/**
 * Gets the navigation structure for a locale, keeping it in the same language as the body.
 */
export function getLocaleNavigation(
  state: StaticContentState,
  localeCode: string
): PageResult {
  const pageResult = getPage(state, localeCode, 'navigation');
  if (!pageResult.success) {
    return pageResult;
  }

  return resolveInternalLinks(state, localeCode, pageResult.page);
}

/**
 * Removes a locale from the static content state.
 * Returns new state; does not mutate input.
 */
export function removeLocale(
  state: StaticContentState,
  localeCode: string
): StaticContentState {
  if (!localeCode || localeCode.trim() === '') {
    throw new Error('Locale code must be a non-empty string.');
  }
  if (localeCode === state.sourceLocale) {
    throw new Error('Cannot remove source locale.');
  }
  if (!state.locales[localeCode]) {
    throw new Error(`Locale ${localeCode} not found in state.`);
  }

  const newLocales: Record<string, LocaleContent> = {};
  for (const key of Object.keys(state.locales)) {
    if (key !== localeCode) {
      const locale = state.locales[key];
      if (locale) {
        newLocales[key] = locale;
      }
    }
  }

  return {
    ...state,
    locales: newLocales,
  };
}

// --- Composite workflow function ---

/**
 * Exercises the complete localised static content workflow.
 * Creates state, adds locales and pages, validates, and retrieves content.
 * Source locale is provided explicitly; no hardcoded defaults.
 */
export function exerciseLocalisedStaticContentWorkflow(): {
  readonly state: StaticContentState;
  readonly retrievedPage: PageResult;
  readonly completeness: {
    readonly localeValidations: LocaleValidationResult[];
    readonly pageValidations: PageValidationResult[];
    readonly missingPages: GapReport[];
    readonly renderingErrors: string[];
  };
} {
  let state = createStaticContentState('en');

  const enSections = [
    createSection('Introduction', ['This is the introduction paragraph.'], ['First bullet point', 'Second bullet point']),
    createSection('Details', ['Detailed information goes here.'], []),
  ];
  
  const enPage = createPageDefinition(
    'Home Page',
    'Welcome to our website',
    '2023-10-01',
    [createLink('About', 'about', true), createLink('Contact', 'https://example.com/contact', false)],
    [createLink('FAQ', 'faq', true)],
    enSections
  );

  const enLocale = createLocaleContent('en', { home: enPage });
  state = {
    ...state,
    locales: {
      ...state.locales,
      [enLocale.localeCode]: enLocale,
    },
  };

  const esSections = [
    createSection('Introducción', ['Este es el párrafo de introducción.'], ['Primer punto de lista', 'Segundo punto de lista']),
    createSection('Detalles', ['La información detallada va aquí.'], []),
  ];
  
  const esPage = createPageDefinition(
    'Página de Inicio',
    'Bienvenido a nuestro sitio web',
    '2023-10-02',
    [createLink('Acerca de', 'about', true), createLink('Contacto', 'https://example.com/contact', false)],
    [createLink('Preguntas', 'faq', true)],
    esSections
  );

  const esLocale = createLocaleContent('es', { home: esPage });
  state = addLocale(state, esLocale);

  const retrievedPage = getPage(state, 'es', 'home');

  const completeness = validateContentCompleteness(state);

  return {
    state,
    retrievedPage,
    completeness,
  };
}