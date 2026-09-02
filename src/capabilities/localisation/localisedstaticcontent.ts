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
  readonly lastUpdated: string;
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
  readonly reported: true;
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

export type ContentCompletenessResult =
  | {
      readonly success: true;
      readonly localeValidations: readonly LocaleValidationResult[];
      readonly pageValidations: readonly PageValidationResult[];
      readonly missingPages: readonly GapReport[];
      readonly renderFailures: readonly string[];
    }
  | { readonly success: false; readonly error: string };

export const ERR_LOCALE_NOT_FOUND = 'locale_not_found' as const;
export const ERR_PAGE_NOT_FOUND = 'page_not_found' as const;
export const ERR_INVALID_DATE = 'invalid_date' as const;
export const ERR_INVALID_INPUT = 'invalid_input' as const;
export const ERR_INTERNAL_LINK_UNRESOLVED = 'internal_link_unresolved' as const;
export const ERR_SOURCE_LOCALE_MISSING = 'source_locale_missing' as const;
export const ERR_INVALID_AUDIT = 'invalid_audit' as const;
export const ERR_GAP_REPORT = 'gap_reported' as const;

export type StaticContentErrorId =
  | typeof ERR_LOCALE_NOT_FOUND
  | typeof ERR_PAGE_NOT_FOUND
  | typeof ERR_INVALID_DATE
  | typeof ERR_INVALID_INPUT
  | typeof ERR_INTERNAL_LINK_UNRESOLVED
  | typeof ERR_SOURCE_LOCALE_MISSING
  | typeof ERR_INVALID_AUDIT
  | typeof ERR_GAP_REPORT;

export const STATIC_CONTENT_ERROR_IDS: readonly StaticContentErrorId[] = [
  ERR_LOCALE_NOT_FOUND,
  ERR_PAGE_NOT_FOUND,
  ERR_INVALID_DATE,
  ERR_INVALID_INPUT,
  ERR_INTERNAL_LINK_UNRESOLVED,
  ERR_SOURCE_LOCALE_MISSING,
  ERR_INVALID_AUDIT,
  ERR_GAP_REPORT,
] as const;

export const PAGE_TYPE_HOME = 'home' as const;
export const PAGE_TYPE_ABOUT = 'about' as const;
export const PAGE_TYPE_FAQ = 'faq' as const;
export const PAGE_TYPE_NAVIGATION = 'navigation' as const;
export const PAGE_TYPE_CONTACT = 'contact' as const;

export type KnownPageType =
  | typeof PAGE_TYPE_HOME
  | typeof PAGE_TYPE_ABOUT
  | typeof PAGE_TYPE_FAQ
  | typeof PAGE_TYPE_NAVIGATION
  | typeof PAGE_TYPE_CONTACT;

export const KNOWN_PAGE_TYPES: readonly KnownPageType[] = [
  PAGE_TYPE_HOME,
  PAGE_TYPE_ABOUT,
  PAGE_TYPE_FAQ,
  PAGE_TYPE_NAVIGATION,
  PAGE_TYPE_CONTACT,
] as const;

export function createLink(label: string, href: string, isInternal: boolean = true): Link {
  if (!label || label.trim() === '') {
    throw new Error('Link label must be a non-empty string.');
  }
  if (!href || href.trim() === '') {
    throw new Error('Link href must be a non-empty string.');
  }
  return { label: label.trim(), href: href.trim(), isInternal };
}

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
    paragraphs: paragraphs.map((p) => p.trim()).filter((p) => p !== ''),
    bullets: bullets.map((b) => b.trim()).filter((b) => b !== ''),
  };
}

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

export function createLocaleContent(localeCode: string, pages: Record<string, PageDefinition> = {}): LocaleContent {
  if (!localeCode || localeCode.trim() === '') {
    throw new Error('Locale code must be a non-empty string.');
  }
  return { localeCode: localeCode.trim(), pages: { ...pages } };
}

export function createStaticContentState(
  sourceLocale: string,
  initialLocales: Record<string, LocaleContent> = {}
): StaticContentState {
  if (!sourceLocale || sourceLocale.trim() === '') {
    throw new Error('Source locale must be a non-empty string.');
  }
  const normalizedSourceLocale = sourceLocale.trim();
  const locales: Record<string, LocaleContent> = { ...initialLocales };
  locales[normalizedSourceLocale] = locales[normalizedSourceLocale] ?? createLocaleContent(normalizedSourceLocale, {});
  return {
    sourceLocale: normalizedSourceLocale,
    locales,
  };
}

function isValidDate(dateString: string): boolean {
  if (!dateString || typeof dateString !== 'string') {
    return false;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return false;
  }
  const date = new Date(dateString + 'T00:00:00.000Z');
  if (isNaN(date.getTime())) {
    return false;
  }
  return date.toISOString().slice(0, 10) === dateString;
}

export function validateLocaleExists(
  state: StaticContentState,
  localeCode: string
): LocaleValidationResult {
  if (!localeCode || localeCode.trim() === '') {
    return { success: false, error: ERR_INVALID_INPUT };
  }
  if (!state.locales[localeCode]) {
    return { success: false, error: ERR_LOCALE_NOT_FOUND };
  }
  return { success: true, localeCode };
}

export function validatePageExists(
  locale: LocaleContent,
  pageType: string
): PageValidationResult {
  if (!pageType || pageType.trim() === '') {
    return { success: false, error: ERR_INVALID_INPUT };
  }
  if (!locale.pages[pageType]) {
    return { success: false, error: ERR_PAGE_NOT_FOUND };
  }
  return { success: true, pageType };
}

export function isPageSuccess(result: PageResult): result is { readonly success: true; readonly page: PageDefinition; readonly gap?: GapReport } {
  return result.success === true;
}

export function isGapReported(gap: GapReport | undefined): boolean {
  return gap !== undefined && gap.reported === true;
}

export function createGapReport(
  localeCode: string,
  pageType: string,
  fallbackLocale: string
): GapReport {
  if (!localeCode || localeCode.trim() === '') {
    throw new Error('Gap report localeCode must be a non-empty string.');
  }
  if (!pageType || pageType.trim() === '') {
    throw new Error('Gap report pageType must be a non-empty string.');
  }
  if (!fallbackLocale || fallbackLocale.trim() === '') {
    throw new Error('Gap report fallbackLocale must be a non-empty string.');
  }
  return {
    localeCode,
    pageType,
    fallbackLocale,
    reported: true,
  };
}

export function addLocale(
  state: StaticContentState,
  localeContent: LocaleContent,
  audit: (locale: LocaleContent) => boolean = () => true
): StaticContentState {
  if (!localeContent.localeCode || localeContent.localeCode.trim() === '') {
    throw new Error('Locale code must be a non-empty string.');
  }
  if (localeContent.localeCode === state.sourceLocale) {
    return state;
  }
  if (state.locales[localeContent.localeCode]) {
    return state;
  }

  let auditSucceeded = false;
  let auditThrew = false;
  try {
    auditSucceeded = audit(localeContent);
  } catch {
    auditThrew = true;
    auditSucceeded = false;
  }
  if (auditThrew) {
    throw new Error(ERR_INVALID_AUDIT);
  }
  if (auditSucceeded !== true) {
    return state;
  }

  return {
    ...state,
    locales: {
      ...state.locales,
      [localeContent.localeCode]: localeContent,
    },
  };
}

export function addPageToLocale(
  locale: LocaleContent,
  pageType: string,
  page: PageDefinition,
  audit: (pageType: string, page: PageDefinition) => boolean = () => true
): LocaleContent {
  if (!pageType || pageType.trim() === '') {
    throw new Error('Page type must be a non-empty string.');
  }

  let auditSucceeded = false;
  let auditThrew = false;
  try {
    auditSucceeded = audit(pageType, page);
  } catch {
    auditThrew = true;
    auditSucceeded = false;
  }
  if (auditThrew) {
    throw new Error(ERR_INVALID_AUDIT);
  }
  if (auditSucceeded !== true) {
    return locale;
  }

  return {
    ...locale,
    pages: {
      ...locale.pages,
      [pageType]: page,
    },
  };
}

export function getPage(
  state: StaticContentState,
  localeCode: string,
  pageType: string
): PageResult {
  if (!localeCode || localeCode.trim() === '') {
    return { success: false, error: ERR_INVALID_INPUT };
  }
  if (!pageType || pageType.trim() === '') {
    return { success: false, error: ERR_INVALID_INPUT };
  }

  const sourceLocaleContent = state.locales[state.sourceLocale];
  if (!sourceLocaleContent) {
    return { success: false, error: ERR_SOURCE_LOCALE_MISSING };
  }

  const locale = state.locales[localeCode];
  if (!locale) {
    return { success: false, error: ERR_LOCALE_NOT_FOUND };
  }

  if (locale.pages[pageType]) {
    return { success: true, page: locale.pages[pageType] };
  }

  const sourcePage = sourceLocaleContent.pages[pageType];
  if (sourcePage) {
    const gapReport: GapReport = createGapReport(localeCode, pageType, state.sourceLocale);
    return {
      success: true,
      page: sourcePage,
      gap: gapReport,
    };
  }

  return { success: false, error: ERR_PAGE_NOT_FOUND };
}

export function reportMissingPage(
  state: StaticContentState,
  localeCode: string,
  pageType: string
): PageResult {
  if (!localeCode || localeCode.trim() === '') {
    return { success: false, error: ERR_INVALID_INPUT };
  }
  if (!pageType || pageType.trim() === '') {
    return { success: false, error: ERR_INVALID_INPUT };
  }

  const sourceLocaleContent = state.locales[state.sourceLocale];
  if (!sourceLocaleContent) {
    return { success: false, error: ERR_SOURCE_LOCALE_MISSING };
  }

  const locale = state.locales[localeCode];
  if (!locale) {
    return { success: false, error: ERR_LOCALE_NOT_FOUND };
  }

  const hasLocalPage = locale.pages[pageType] !== undefined;
  if (hasLocalPage) {
    return { success: true, page: locale.pages[pageType] };
  }

  const sourcePage = sourceLocaleContent.pages[pageType];
  if (sourcePage) {
    const gapReport: GapReport = createGapReport(localeCode, pageType, state.sourceLocale);
    return {
      success: true,
      page: sourcePage,
      gap: gapReport,
    };
  }

  return { success: false, error: ERR_PAGE_NOT_FOUND };
}

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
        return { success: false, error: ERR_INTERNAL_LINK_UNRESOLVED };
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
        return { success: false, error: ERR_INTERNAL_LINK_UNRESOLVED };
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

export function renderPage(
  state: StaticContentState,
  localeCode: string,
  pageType: string
): RenderResult {
  const localeValidation = validateLocaleExists(state, localeCode);
  if (!localeValidation.success) {
    return { success: false, error: localeValidation.error };
  }

  const pageResult = getPage(state, localeCode, pageType);
  if (!pageResult.success) {
    return { success: false, error: pageResult.error };
  }

  const servedLocale = pageResult.gap ? pageResult.gap.fallbackLocale : localeCode;

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

export function validateContentCompleteness(state: StaticContentState): ContentCompletenessResult {
  const localeValidations: LocaleValidationResult[] = [];
  const pageValidations: PageValidationResult[] = [];
  const missingPages: GapReport[] = [];
  const renderFailures: string[] = [];

  if (!state.sourceLocale || state.sourceLocale.trim() === '') {
    return { success: false, error: ERR_SOURCE_LOCALE_MISSING };
  }
  if (!state.locales[state.sourceLocale]) {
    return { success: false, error: ERR_SOURCE_LOCALE_MISSING };
  }

  const localeCodes = Object.keys(state.locales);
  const allPageTypes = new Set<string>(KNOWN_PAGE_TYPES);
  for (const localeCode of localeCodes) {
    const locale = state.locales[localeCode];
    if (!locale) {
      continue;
    }
    for (const pageType of Object.keys(locale.pages)) {
      allPageTypes.add(pageType);
    }
  }

  const sourcePages = state.locales[state.sourceLocale]?.pages;

  for (const localeCode of localeCodes) {
    const locale = state.locales[localeCode];
    if (!locale) {
      localeValidations.push({ success: false, error: ERR_LOCALE_NOT_FOUND });
      continue;
    }

    const localeValidation = validateLocaleExists(state, localeCode);
    localeValidations.push(localeValidation);

    for (const pageType of allPageTypes) {
      const pageValidation = validatePageExists(locale, pageType);
      pageValidations.push(pageValidation);

      const renderResult = renderPage(state, localeCode, pageType);
      if (!renderResult.success) {
        renderFailures.push(renderResult.error);
      }

      if (!locale.pages[pageType]) {
        const sourceHasPage = sourcePages && sourcePages[pageType] !== undefined;
        if (sourceHasPage) {
          missingPages.push(createGapReport(localeCode, pageType, state.sourceLocale));
        }
      }
    }
  }

  return {
    success: true,
    localeValidations,
    pageValidations,
    missingPages,
    renderFailures,
  };
}

export function generateTableOfContents(page: PageDefinition): readonly string[] {
  return page.sections.map((section) => section.heading);
}

export function getLocaleNavigation(
  state: StaticContentState,
  localeCode: string
): PageResult {
  const pageResult = getPage(state, localeCode, PAGE_TYPE_NAVIGATION);
  if (!pageResult.success) {
    return pageResult;
  }

  const servedLocale = pageResult.gap ? pageResult.gap.fallbackLocale : localeCode;
  const resolveResult = resolveInternalLinks(state, servedLocale, pageResult.page);

  if (!resolveResult.success) {
    return resolveResult;
  }

  if (!pageResult.gap) {
    return resolveResult;
  }

  return {
    ...resolveResult,
    gap: pageResult.gap,
  };
}

export function removeLocale(
  state: StaticContentState,
  localeCode: string,
  audit: (localeCode: string) => boolean = () => true
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

  let auditSucceeded = false;
  let auditThrew = false;
  try {
    auditSucceeded = audit(localeCode);
  } catch {
    auditThrew = true;
    auditSucceeded = false;
  }
  if (auditThrew) {
    throw new Error(ERR_INVALID_AUDIT);
  }
  if (auditSucceeded !== true) {
    return state;
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

export function exerciseLocalisedStaticContentWorkflow(): {
  readonly state: StaticContentState;
  readonly retrievedPage: PageResult;
  readonly completeness: ContentCompletenessResult;
} {
  let state = createStaticContentState('en');

  const enSections = [
    createSection('Introduction', ['This is the introduction paragraph.'], ['First bullet point', 'Second bullet point']),
    createSection('Details', ['Detailed information goes here.'], []),
  ];

  const enHome = createPageDefinition(
    'Home Page',
    'Welcome to our website',
    '2023-10-01',
    [createLink('About', 'about', true), createLink('Contact', 'https://example.com/contact', false)],
    [createLink('FAQ', 'faq', true)],
    enSections
  );

  const enAbout = createPageDefinition(
    'About Us',
    'Learn more about us',
    '2023-10-01',
    [],
    [],
    []
  );

  const enFaq = createPageDefinition(
    'FAQ',
    'Frequently asked questions',
    '2023-10-01',
    [],
    [],
    []
  );

  const enNavigation = createPageDefinition(
    'Navigation',
    'Site navigation',
    '2023-10-01',
    [createLink('Home', 'home', true), createLink('About', 'about', true), createLink('FAQ', 'faq', true)],
    [],
    []
  );

  const enContact = createPageDefinition(
    'Contact',
    'Contact information',
    '2023-10-01',
    [],
    [],
    []
  );

  const enLocale = createLocaleContent('en', {
    home: enHome,
    about: enAbout,
    faq: enFaq,
    navigation: enNavigation,
    contact: enContact,
  });
  state = addLocale(state, enLocale);

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