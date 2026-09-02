export const supportedLocales = ['en', 'ar', 'he', 'ur'] as const;
export type SupportedLocale = typeof supportedLocales[number];

export const localeDirection: Record<SupportedLocale, 'ltr' | 'rtl'> = {
  'en': 'ltr',
  'ar': 'rtl',
  'he': 'rtl',
  'ur': 'rtl',
};

export type Direction = 'ltr' | 'rtl';

export interface DocumentState {
  locale: SupportedLocale;
  direction: Direction;
}

export interface UIElement {
  type: 'navigation' | 'control' | 'content';
  content: string;
  direction?: Direction;
}

export interface Artifact {
  content: string;
  direction: Direction;
}

export interface ValidationSuccess {
  status: 'success';
  locale: SupportedLocale;
  direction: Direction;
  artifact: Artifact;
}

export interface ValidationFailure {
  status: 'failure';
  locale: SupportedLocale;
  reason: 'not-rtl';
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

export function resolveDirection(locale: SupportedLocale): Direction {
  return localeDirection[locale];
}

export function createDocumentState(locale: SupportedLocale): DocumentState {
  return {
    locale,
    direction: resolveDirection(locale),
  };
}

export function updateDocumentState(
  state: DocumentState,
  auditFn: (msg: string) => void,
  newLocale: SupportedLocale
): DocumentState {
  auditFn(`Direction changing from ${state.direction} to ${resolveDirection(newLocale)} due to locale change`);
  
  return {
    locale: newLocale,
    direction: resolveDirection(newLocale),
  };
}

export function applyDirectionToUI(
  elements: UIElement[],
  direction: Direction
): UIElement[] {
  return elements.map(element => ({
    ...element,
    direction,
  }));
}

export function validateRTL(locale: SupportedLocale): ValidationResult {
  const direction = resolveDirection(locale);
  
  if (direction === 'rtl') {
    return {
      status: 'success',
      locale,
      direction,
      artifact: {
        content: 'RTL content example',
        direction: 'rtl',
      },
    };
  } else {
    return {
      status: 'failure',
      locale,
      reason: 'not-rtl',
    };
  }
}

export function validateAllRTLLocales(): ValidationResult[] {
  return supportedLocales.map(locale => validateRTL(locale));
}