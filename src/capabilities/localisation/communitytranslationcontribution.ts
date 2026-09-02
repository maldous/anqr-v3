// communitytranslationcontribution.ts
// Capability module for community translation contribution in the ANQR product.

// --- Type definitions ---

export type TranslationState = 'proposal' | 'review' | 'merge' | 'publication';

export interface Translation {
  readonly id: string;
  readonly content: string;
  readonly state: TranslationState;
  readonly reviewStatus?: 'pending' | 'approved' | 'rejected';
  readonly submittedAt: string;
  readonly reviewedAt?: string;
  readonly mergedAt?: string;
  readonly publishedAt?: string;
}

export interface TranslationContract {
  readonly repository: string;
  readonly interfaceStrings: readonly string[];
  readonly staticContent: readonly string[];
  readonly placeholderTokens: readonly string[];
  readonly linkSyntaxTokens: readonly string[];
}

export interface PreservationValidation {
  readonly valid: boolean;
  readonly missingTokens: readonly string[];
  readonly alteredTokens: readonly string[];
}

export type TransitionResult =
  | { readonly success: true; readonly translation: Translation }
  | { readonly success: false; readonly error: string };

// --- Constants ---

export const TRANSLATION_REPOSITORY = 'anqr-translations' as const;
export const INTERFACE_STRINGS = [
  'app.title',
  'app.subtitle',
  'nav.home',
  'nav.about',
  'nav.contact',
  'form.submit',
  'form.cancel',
] as const;

export const STATIC_CONTENT = [
  'welcome.message',
  'footer.copyright',
  'error.404.message',
] as const;

export const PLACEHOLDER_TOKENS = ['{{username}}', '{{date}}', '{{count}}'] as const;
export const LINK_SYNTAX_TOKENS = ['[link](url)', '<a href="url">', '[[wiki.link]]'] as const;

export const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de', 'ja', 'zh'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

// --- Factory functions ---

/**
 * Creates a new translation proposal.
 * Anyone may propose a translation (permission requirement).
 */
export function proposeTranslation(
  id: string,
  content: string,
  submittedAt: string = new Date().toISOString()
): Translation {
  if (!id || id.trim() === '') {
    throw new Error('Translation id must be a non-empty string.');
  }
  if (!content || content.trim() === '') {
    throw new Error('Translation content must be a non-empty string.');
  }
  if (!submittedAt || submittedAt.trim() === '') {
    throw new Error('Submission timestamp must be a non-empty string.');
  }

  return {
    id,
    content,
    state: 'proposal',
    submittedAt,
  };
}

// --- Lifecycle functions ---

/**
 * Submits a translation for review.
 * Moves from proposal to review state.
 */
export function submitForReview(translation: Translation): TransitionResult {
  if (translation.state !== 'proposal') {
    return {
      success: false,
      error: `Translation "${translation.id}" is not in proposal state. Current state: ${translation.state}`,
    };
  }

  return {
    success: true,
    translation: {
      ...translation,
      state: 'review',
      reviewStatus: 'pending',
    },
  };
}

/**
 * Approves a translation for merge after review.
 * Moves from review to merge state.
 * Review before merge is the control (permission requirement).
 */
export function approveForMerge(translation: Translation): TransitionResult {
  if (translation.state !== 'review') {
    return {
      success: false,
      error: `Translation "${translation.id}" is not in review state. Current state: ${translation.state}`,
    };
  }

  if (translation.reviewStatus !== 'approved') {
    return {
      success: false,
      error: `Translation "${translation.id}" has not been approved for merge. Review status: ${translation.reviewStatus}`,
    };
  }

  return {
    success: true,
    translation: {
      ...translation,
      state: 'merge',
      mergedAt: new Date().toISOString(),
    },
  };
}

/**
 * Rejects a translation during review.
 */
export function rejectTranslation(translation: Translation): TransitionResult {
  if (translation.state !== 'review') {
    return {
      success: false,
      error: `Translation "${translation.id}" is not in review state. Current state: ${translation.state}`,
    };
  }

  return {
    success: true,
    translation: {
      ...translation,
      reviewStatus: 'rejected',
    },
  };
}

/**
 * Publishes a translation with the next release.
 * Moves from merge to publication state.
 * Nobody may publish one unreviewed (permission requirement).
 */
export function publishTranslation(translation: Translation): TransitionResult {
  if (translation.state !== 'merge') {
    return {
      success: false,
      error: `Translation "${translation.id}" is not in merge state. Current state: ${translation.state}`,
    };
  }

  // Validate preservation rules before publication
  const preservation = validatePreservation(translation);
  if (!preservation.valid) {
    return {
      success: false,
      error: `Translation "${translation.id}" failed preservation validation. Missing: ${preservation.missingTokens.join(', ')}, Altered: ${preservation.alteredTokens.join(', ')}`,
    };
  }

  return {
    success: true,
    translation: {
      ...translation,
      state: 'publication',
      publishedAt: new Date().toISOString(),
    },
  };
}

/**
 * Gets the current lifecycle step visible to the contributor.
 */
export function getLifecycleStep(translation: Translation): string {
  const steps: Record<TranslationState, string> = {
    proposal: 'Translation proposed - awaiting review',
    review: `Under review${translation.reviewStatus ? ` (${translation.reviewStatus})` : ''}`,
    merge: 'Approved and merged - ready for publication',
    publication: 'Published with next release',
  };
  return steps[translation.state];
}

// --- Contract functions ---

/**
 * Returns the translation contract naming the repository,
 * distinguishing interface strings from static content,
 * and stating placeholder and link-syntax tokens.
 */
export function getTranslationContract(): TranslationContract {
  return {
    repository: TRANSLATION_REPOSITORY,
    interfaceStrings: INTERFACE_STRINGS,
    staticContent: STATIC_CONTENT,
    placeholderTokens: PLACEHOLDER_TOKENS,
    linkSyntaxTokens: LINK_SYNTAX_TOKENS,
  };
}

// --- UI semantics functions ---

/**
 * Returns a localised invitation message for translation contribution.
 * The contribution page is itself localised (UI semantics requirement).
 */
export function getInvitationMessage(language: SupportedLanguage): string {
  const messages: Record<SupportedLanguage, string> = {
    en: 'Help translate ANQR to your language. Your contributions make the product accessible to more people.',
    es: 'Ayuda a traducir ANQR a tu idioma. Tus contribuciones hacen que el producto sea accesible para más personas.',
    fr: 'Aidez à traduire ANQR dans votre langue. Vos contributions rendent le produit accessible à plus de personnes.',
    de: 'Helfen Sie, ANQR in Ihre Sprache zu übersetzen. Ihre Beiträge machen das Produkt für mehr Menschen zugänglich.',
    ja: 'ANQRをあなたの言語に翻訳するお手伝いをしてください。あなたの貢献により、より多くの people が-product を利用できるようになります。',
    zh: '帮助将 ANQR 翻译成您的语言。您的贡献使产品能够为更多人所访问。',
  };
  return messages[language];
}

// --- Validation functions ---

/**
 * Validates that published translation preserves placeholder and link-syntax tokens.
 * The published contribution route resolves, and the stated preservation rules
 * match the tokens the runtime actually substitutes.
 */
export function validatePreservation(translation: Translation): PreservationValidation {
  const missingTokens: string[] = [];
  const alteredTokens: string[] = [];
  const allTokens = [...PLACEHOLDER_TOKENS, ...LINK_SYNTAX_TOKENS];

  for (const token of allTokens) {
    if (!translation.content.includes(token)) {
      missingTokens.push(token);
    } else {
      // Check if token is altered (contains extra characters around it)
      const tokenIndex = translation.content.indexOf(token);
      const beforeChar = tokenIndex > 0 ? translation.content[tokenIndex - 1] : '';
      const afterChar =
        tokenIndex + token.length < translation.content.length
          ? translation.content[tokenIndex + token.length]
          : '';

      // Token should be surrounded by non-alphanumeric boundaries or string boundaries
      const hasValidBoundary =
        (beforeChar === '' || !/[a-zA-Z0-9]/.test(beforeChar)) &&
        (afterChar === '' || !/[a-zA-Z0-9]/.test(afterChar));

      if (!hasValidBoundary) {
        alteredTokens.push(token);
      }
    }
  }

  return {
    valid: missingTokens.length === 0 && alteredTokens.length === 0,
    missingTokens,
    alteredTokens,
  };
}

/**
 * Validates that a translation can be proposed (anyone may propose).
 */
export function validateProposal(translation: Translation): boolean {
  return translation.state === 'proposal';
}

/**
 * Validates that a translation can be published (must be reviewed and merged).
 */
export function validatePublication(translation: Translation): boolean {
  return translation.state === 'merge';
}