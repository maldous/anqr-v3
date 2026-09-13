// localeparity.ts
// Locale preparation and parity assessment for the ANQR product.
//
// The claimed language denominator lives in the semantic graph and reaches this
// repository as packages/architecture/locales.json, a derived projection. This
// module prepares a resource for every claimed locale and decides parity the
// only way the graph permits: by comparing each locale's key set against the
// reference locale's. File presence and file size decide nothing here, because
// eighty-six resources of the right shape prove nothing about coverage.
//
// A prepared locale is honestly untranslated. It carries the reference key set
// with no value against any key, so a translator can fill it and a checker can
// see at a glance that nothing has been filled yet. It is never reported as
// satisfied, and no value is ever invented to close a count.

// --- Type definitions ---

export type WritingDirection = 'ltr' | 'rtl';

export interface RegisteredLocale {
  readonly code: string;
  readonly direction: WritingDirection;
  readonly reference: boolean;
}

export interface LocaleRegistry {
  readonly schema: 'urn:anqr:locale-registry:1';
  readonly referenceCode: string;
  readonly localeCount: number;
  readonly rightToLeftCount: number;
  readonly locales: readonly RegisteredLocale[];
}

/** A translated value, or null where the key is prepared but not yet translated. */
export type LocaleTranslations = Readonly<Record<string, string | null>>;

export interface LocaleResource {
  readonly code: string;
  readonly direction: WritingDirection;
  readonly translations: LocaleTranslations;
}

export type LocaleParityState =
  | 'reference'
  | 'complete'
  | 'partial'
  | 'prepared'
  | 'absent';

export interface LocaleParityVerdict {
  readonly code: string;
  readonly direction: WritingDirection;
  readonly state: LocaleParityState;
  readonly referenceKeyCount: number;
  readonly translatedKeyCount: number;
  readonly missingKeys: readonly string[];
  readonly unknownKeys: readonly string[];
  readonly reason: string;
}

export interface LocaleParityReport {
  readonly referenceCode: string;
  readonly referenceKeyCount: number;
  readonly claimedLocaleCount: number;
  readonly preparedLocaleCount: number;
  readonly completeLocaleCount: number;
  readonly verdicts: readonly LocaleParityVerdict[];
  readonly refusals: readonly string[];
  readonly nonClaims: readonly string[];
}

// --- Constants ---

export const LOCALE_REGISTRY_SCHEMA = 'urn:anqr:locale-registry:1' as const;

export const PARITY_NON_CLAIMS: readonly string[] = Object.freeze([
  'A prepared locale carries the reference key set and no translated value. It is untranslated, not satisfied.',
  'Parity is decided by key set against the reference locale. A resource of the right size proves nothing about coverage.',
  'No value is ever generated to close a count; an untranslated key stays null so the gap stays visible.',
  'This report describes resources in this repository. It makes no claim about any legacy translation corpus.',
]);

// --- Registry ---

/** Validate a derived registry before anything is decided from it. */
export function readLocaleRegistry(value: unknown): LocaleRegistry {
  if (value === null || typeof value !== 'object') throw new Error('LOCALE_REGISTRY_INVALID');
  const registry = value as Partial<LocaleRegistry>;
  if (registry.schema !== LOCALE_REGISTRY_SCHEMA) throw new Error('LOCALE_REGISTRY_SCHEMA_UNKNOWN');
  if (!Array.isArray(registry.locales) || registry.locales.length === 0) throw new Error('LOCALE_REGISTRY_EMPTY');
  if (registry.locales.length !== registry.localeCount) throw new Error('LOCALE_REGISTRY_COUNT_MISMATCH');
  const codes = new Set<string>();
  let references = 0;
  let rightToLeft = 0;
  for (const locale of registry.locales) {
    if (typeof locale.code !== 'string' || locale.code.trim() === '') throw new Error('LOCALE_REGISTRY_CODE_INVALID');
    if (codes.has(locale.code)) throw new Error(`LOCALE_REGISTRY_CODE_DUPLICATE:${locale.code}`);
    codes.add(locale.code);
    if (locale.direction !== 'ltr' && locale.direction !== 'rtl') throw new Error(`LOCALE_REGISTRY_DIRECTION_INVALID:${locale.code}`);
    if (locale.direction === 'rtl') rightToLeft += 1;
    if (locale.reference) references += 1;
  }
  if (references !== 1) throw new Error('LOCALE_REGISTRY_REFERENCE_AMBIGUOUS');
  if (rightToLeft !== registry.rightToLeftCount) throw new Error('LOCALE_REGISTRY_DIRECTION_COUNT_MISMATCH');
  if (!codes.has(registry.referenceCode as string)) throw new Error('LOCALE_REGISTRY_REFERENCE_UNCLAIMED');
  return registry as LocaleRegistry;
}

// --- Preparation ---

/**
 * Prepare a resource for one claimed locale: the reference key set, with no
 * value against any key. Existing translations are preserved; keys the
 * reference no longer declares are dropped, because a stale key is not
 * coverage.
 */
export function prepareLocaleResource(
  locale: RegisteredLocale,
  referenceKeys: readonly string[],
  existing?: LocaleResource,
): LocaleResource {
  const translations: Record<string, string | null> = {};
  for (const key of [...referenceKeys].sort()) {
    const carried = existing?.translations[key];
    translations[key] = typeof carried === 'string' && carried !== '' ? carried : null;
  }
  return Object.freeze({ code: locale.code, direction: locale.direction, translations: Object.freeze(translations) });
}

/** Prepare every claimed locale, so the denominator is ready in full. */
export function prepareAllLocales(
  registry: LocaleRegistry,
  reference: LocaleResource,
  existing: ReadonlyMap<string, LocaleResource> = new Map(),
): readonly LocaleResource[] {
  const referenceKeys = Object.keys(reference.translations);
  return Object.freeze(registry.locales
    .filter((locale) => locale.code !== registry.referenceCode)
    .map((locale) => prepareLocaleResource(locale, referenceKeys, existing.get(locale.code))));
}

// --- Parity ---

function verdictFor(
  locale: RegisteredLocale,
  referenceKeys: readonly string[],
  resource: LocaleResource | undefined,
  isReference: boolean,
): LocaleParityVerdict {
  const base = { code: locale.code, direction: locale.direction, referenceKeyCount: referenceKeys.length };
  if (isReference) {
    return Object.freeze({
      ...base, state: 'reference' as const, translatedKeyCount: referenceKeys.length,
      missingKeys: Object.freeze([]), unknownKeys: Object.freeze([]),
      reason: 'This is the reference locale; its key set defines parity and is not compared against itself.',
    });
  }
  if (resource === undefined) {
    return Object.freeze({
      ...base, state: 'absent' as const, translatedKeyCount: 0,
      missingKeys: Object.freeze([...referenceKeys].sort()), unknownKeys: Object.freeze([]),
      reason: 'The product claims this locale and carries no resource for it. Every reference key is missing.',
    });
  }
  const present = new Set(Object.keys(resource.translations));
  const missing = referenceKeys.filter((key) => !present.has(key)).sort();
  const unknown = [...present].filter((key) => !referenceKeys.includes(key)).sort();
  const translated = referenceKeys.filter((key) => typeof resource.translations[key] === 'string' && resource.translations[key] !== '');
  const state: LocaleParityState = missing.length > 0 || unknown.length > 0
    ? 'partial'
    : translated.length === 0 ? 'prepared'
    : translated.length === referenceKeys.length ? 'complete' : 'partial';
  const reason = state === 'complete'
    ? 'Every reference key is present and carries a translated value.'
    : state === 'prepared'
      ? 'Every reference key is present and none is translated yet. Prepared, not satisfied.'
      : missing.length > 0 || unknown.length > 0
        ? 'The key set does not agree with the reference locale.'
        : 'Some reference keys are present but untranslated.';
  return Object.freeze({
    ...base, state, translatedKeyCount: translated.length,
    missingKeys: Object.freeze(missing), unknownKeys: Object.freeze(unknown), reason,
  });
}

/**
 * Assess every claimed locale against the reference by key set.
 *
 * A resource for a locale the product does not claim is a refusal, not an
 * extra: it would otherwise inflate the apparent denominator. So is a resource
 * whose direction disagrees with the registry, because direction is graph
 * authority and a resource may not restate it differently.
 */
export function assessLocaleParity(
  registry: LocaleRegistry,
  reference: LocaleResource,
  resources: readonly LocaleResource[],
): LocaleParityReport {
  const refusals: string[] = [];
  const claimed = new Map(registry.locales.map((locale) => [locale.code, locale]));
  const byCode = new Map<string, LocaleResource>();
  for (const resource of resources) {
    const locale = claimed.get(resource.code);
    if (locale === undefined) { refusals.push(`LOCALE_RESOURCE_UNCLAIMED:${resource.code}`); continue; }
    if (byCode.has(resource.code)) { refusals.push(`LOCALE_RESOURCE_DUPLICATE:${resource.code}`); continue; }
    if (resource.direction !== locale.direction) { refusals.push(`LOCALE_RESOURCE_DIRECTION_CONFLICT:${resource.code}`); continue; }
    byCode.set(resource.code, resource);
  }
  if (reference.code !== registry.referenceCode) refusals.push(`LOCALE_REFERENCE_CODE_CONFLICT:${reference.code}`);
  const referenceKeys = Object.keys(reference.translations);
  if (referenceKeys.some((key) => typeof reference.translations[key] !== 'string' || reference.translations[key] === '')) {
    refusals.push('LOCALE_REFERENCE_INCOMPLETE');
  }
  const verdicts = registry.locales
    .map((locale) => verdictFor(locale, referenceKeys, byCode.get(locale.code), locale.code === registry.referenceCode))
    .sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
  return Object.freeze({
    referenceCode: registry.referenceCode,
    referenceKeyCount: referenceKeys.length,
    claimedLocaleCount: registry.locales.length,
    preparedLocaleCount: verdicts.filter((verdict) => verdict.state === 'prepared' || verdict.state === 'complete' || verdict.state === 'partial').length,
    completeLocaleCount: verdicts.filter((verdict) => verdict.state === 'complete').length,
    verdicts: Object.freeze(verdicts),
    refusals: Object.freeze([...new Set(refusals)].sort()),
    nonClaims: PARITY_NON_CLAIMS,
  });
}
