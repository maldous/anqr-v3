// guidedonboarding.ts
// Capability module for guided onboarding in the ANQR product.

// --- Type definitions ---

export interface OnboardingArtefact {
  readonly id: string;
  readonly type: string;
  readonly content: string;
}

export interface OnboardingState {
  readonly userId: string;
  readonly dismissed: boolean;
  readonly language: string;
  readonly artefact: OnboardingArtefact;
}

export type OnboardingErrorCode =
  | 'INVALID_USER'
  | 'INVALID_LANGUAGE'
  | 'INVALID_ARTEFACT'
  | 'DISMISSAL_FAILED'
  | 'VALIDATION_FAILED';

export interface OnboardingError {
  readonly code: OnboardingErrorCode;
  readonly message: string;
}

export type OnboardingResult =
  | { readonly success: true; readonly state: OnboardingState }
  | { readonly success: false; readonly error: OnboardingError };

export type DismissalResult =
  | { readonly success: true; readonly state: OnboardingState }
  | { readonly success: false; readonly error: OnboardingError };

export type ValidationResult =
  | { readonly success: true; readonly artefact: OnboardingArtefact }
  | { readonly success: false; readonly error: OnboardingError };

export type AuditFunction = (state: OnboardingState) => { readonly ok: boolean };

// --- Constants ---

export const DEFAULT_ARTEFACT_TYPE = 'experience';
export const DEFAULT_ARTEFACT_CONTENT = 'default-onboarding-artefact';
export const DEFAULT_LANGUAGE = 'en';
export const MINIMAL_CONTROL_SET = [
  'type-selector',
  'content-editor',
  'full-options-link',
] as const;

export type MinimalControl = (typeof MINIMAL_CONTROL_SET)[number];

export const ONBOARDING_ERROR_CODES = [
  'INVALID_USER',
  'INVALID_LANGUAGE',
  'INVALID_ARTEFACT',
  'DISMISSAL_FAILED',
  'VALIDATION_FAILED',
] as const;

// --- Factory functions ---

/**
 * Creates a default onboarding artefact with the minimal viable content.
 */
export function createDefaultArtefact(): OnboardingArtefact {
  return {
    id: `artefact-${Date.now()}`,
    type: DEFAULT_ARTEFACT_TYPE,
    content: DEFAULT_ARTEFACT_CONTENT,
  };
}

/**
 * Creates initial onboarding state for a user in a specific language.
 * The state is not dismissed and contains a valid default artefact.
 */
export function createInitialOnboardingState(
  userId: string,
  language: string = DEFAULT_LANGUAGE
): OnboardingState {
  if (!userId || userId.trim() === '') {
    throw new Error('User ID must be a non-empty string.');
  }
  if (!language || language.trim() === '') {
    throw new Error('Language must be a non-empty string.');
  }

  return {
    userId,
    dismissed: false,
    language,
    artefact: createDefaultArtefact(),
  };
}

// --- Validation functions ---

/**
 * Validates that an onboarding state is internally consistent:
 * - userId is non-empty
 * - language is non-empty
 * - artefact has non-empty id, type, and content
 */
export function validateOnboardingState(
  state: OnboardingState
): ValidationResult {
  if (!state.userId || state.userId.trim() === '') {
    return {
      success: false,
      error: {
        code: 'INVALID_USER',
        message: 'User ID must be a non-empty string.',
      },
    };
  }

  if (!state.language || state.language.trim() === '') {
    return {
      success: false,
      error: {
        code: 'INVALID_LANGUAGE',
        message: 'Language must be a non-empty string.',
      },
    };
  }

  if (
    !state.artefact ||
    !state.artefact.id ||
    state.artefact.id.trim() === '' ||
    !state.artefact.type ||
    state.artefact.type.trim() === '' ||
    !state.artefact.content ||
    state.artefact.content.trim() === ''
  ) {
    return {
      success: false,
      error: {
        code: 'INVALID_ARTEFACT',
        message: 'Onboarding artefact must have non-empty id, type, and content.',
      },
    };
  }

  return { success: true, artefact: state.artefact };
}

// --- Mutation functions ---

/**
 * Dismisses onboarding for a user. The mutation is guarded by an audit function:
 * if the audit returns false or throws, the mutation is not applied.
 * Returns a new state with dismissed=true on success.
 */
export function dismissOnboarding(
  state: OnboardingState,
  audit: AuditFunction
): DismissalResult {
  const validation = validateOnboardingState(state);
  if (!validation.success) {
    return {
      success: false,
      error: {
        code: 'DISMISSAL_FAILED',
        message: validation.error.message,
      },
    };
  }

  let auditPassed: boolean;
  try {
    auditPassed = audit(state).ok;
  } catch {
    auditPassed = false;
  }

  if (!auditPassed) {
    return {
      success: false,
      error: {
        code: 'DISMISSAL_FAILED',
        message: 'Audit check failed; dismissal was not applied.',
      },
    };
  }

  return {
    success: true,
    state: {
      ...state,
      dismissed: true,
    },
  };
}

/**
 * Asserts that a first session produces a valid artefact with no user input.
 * The artefact is the default artefact and must pass validation.
 * Returns a new state with the validated artefact.
 */
export function assertFirstSessionArtefact(
  userId: string,
  language: string = DEFAULT_LANGUAGE
): OnboardingResult {
  if (!userId || userId.trim() === '') {
    return {
      success: false,
      error: {
        code: 'INVALID_USER',
        message: 'User ID must be a non-empty string.',
      },
    };
  }

  if (!language || language.trim() === '') {
    return {
      success: false,
      error: {
        code: 'INVALID_LANGUAGE',
        message: 'Language must be a non-empty string.',
      },
    };
  }

  const initialState = createInitialOnboardingState(userId, language);
  const validation = validateOnboardingState(initialState);

  if (!validation.success) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: validation.error.message,
      },
    };
  }

  return {
    success: true,
    state: initialState,
  };
}

/**
 * Localises onboarding content for a given language.
 * Returns a new state with the requested language if supported.
 * Fail-closed: unsupported languages return an error.
 */
export function localiseOnboarding(
  state: OnboardingState,
  targetLanguage: string
): OnboardingResult {
  if (!targetLanguage || targetLanguage.trim() === '') {
    return {
      success: false,
      error: {
        code: 'INVALID_LANGUAGE',
        message: 'Target language must be a non-empty string.',
      },
    };
  }

  // Fail-closed: default branch denies unsupported languages.
  const supportedLanguages = ['en', 'es', 'fr', 'de', 'ja'] as const;
  const isSupported = supportedLanguages.some(
    (lang) => lang === targetLanguage.toLowerCase()
  );

  if (!isSupported) {
    return {
      success: false,
      error: {
        code: 'INVALID_LANGUAGE',
        message: `Language "${targetLanguage}" is not supported.`,
      },
    };
  }

  return {
    success: true,
    state: {
      ...state,
      language: targetLanguage.toLowerCase(),
    },
  };
}

// --- Query functions ---

/**
 * Returns whether onboarding is dismissed for a user.
 */
export function isOnboardingDismissed(state: OnboardingState): boolean {
  return state.dismissed;
}

/**
 * Returns the minimal set of controls for the onboarding surface.
 */
export function getMinimalControlSet(): readonly MinimalControl[] {
  return MINIMAL_CONTROL_SET;
}

/**
 * Returns the full option surface route identifier.
 */
export function getFullOptionsRoute(): string {
  return '/onboarding/full-options';
}