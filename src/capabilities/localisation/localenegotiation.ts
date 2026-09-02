export const supportedLocales = ['en', 'fr', 'es'] as const;
export type SupportedLocale = typeof supportedLocales[number];

export const sourceLocale: SupportedLocale = 'en';

export const aliasMap: Record<string, SupportedLocale> = {
  'en-US': 'en',
  'fr-CA': 'fr',
};

export interface NegotiationSuccess {
  status: 'success';
  locale: SupportedLocale;
  resolvedBy: 'explicit' | 'stored' | 'alias' | 'source';
}
export interface NegotiationFailure {
  status: 'failure';
  locale: SupportedLocale; // always the sourceLocale
  reason: 'unsupported' | 'malformed';
  original?: string;
}
export type NegotiationOutcome = NegotiationSuccess | NegotiationFailure;

/**
 * Resolve a locale according to the precedence:
 * 1. explicit request
 * 2. stored preference
 * 3. browser language list via aliasMap
 * 4. source language
 *
 * If an explicit or stored request is present but not a supported locale,
 * the function resolves to the sourceLocale and returns a failure outcome
 * reporting the problem.
 */
export function negotiateLocale(
  explicitRequest?: string,
  storedPreference?: string,
  browserLanguages?: readonly string[],
): NegotiationOutcome {
  // Helper to test support
  const isSupported = (loc: string): loc is SupportedLocale =>
    supportedLocales.includes(loc as SupportedLocale);

  // 1. explicit request
  if (explicitRequest !== undefined) {
    if (isSupported(explicitRequest)) {
      return { status: 'success', locale: explicitRequest, resolvedBy: 'explicit' };
    }
    // unsupported or malformed explicit request
    return {
      status: 'failure',
      locale: sourceLocale,
      reason: explicitRequest.trim() === '' ? 'malformed' : 'unsupported',
      original: explicitRequest,
    };
  }

  // 2. stored preference
  if (storedPreference !== undefined) {
    if (isSupported(storedPreference)) {
      return { status: 'success', locale: storedPreference, resolvedBy: 'stored' };
    }
    return {
      status: 'failure',
      locale: sourceLocale,
      reason: storedPreference.trim() === '' ? 'malformed' : 'unsupported',
      original: storedPreference,
    };
  }

  // 3. browser language list via alias map
  if (browserLanguages && browserLanguages.length > 0) {
    for (const lang of browserLanguages) {
      const aliased = aliasMap[lang];
      if (aliased !== undefined) {
        return { status: 'success', locale: aliased, resolvedBy: 'alias' };
      }
    }
  }

  // 4. source language (default)
  return { status: 'success', locale: sourceLocale, resolvedBy: 'source' };
}

/**
 * Validation helper that simply forwards to `negotiateLocale`.
 * Tests can invoke this to ensure each precedence rule is exercised.
 */
export function validateNegotiation(
  explicitRequest?: string,
  storedPreference?: string,
  browserLanguages?: readonly string[],
): NegotiationOutcome {
  return negotiateLocale(explicitRequest, storedPreference, browserLanguages);
}