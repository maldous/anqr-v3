// shareablerepresentation.ts
// Capability module for shareable representation in the ANQR product.

// --- Type definitions ---

export interface OptionGroup {
  readonly name: string;
  readonly parameters: Record<string, unknown>;
}

export interface EmbedOptions {
  readonly [key: string]: unknown;
}

export interface Identity {
  readonly userId: string;
}

export interface Session {
  readonly sessionId: string;
}

export interface Account {
  readonly accountId: string;
}

export interface Artefact {
  readonly payload: string;
  readonly options: readonly OptionGroup[];
  readonly embedOptions: EmbedOptions;
  readonly identity?: Identity;
  readonly session?: Session;
  readonly account?: Account;
}

export interface ShareableArtefact {
  readonly payload: string;
  readonly options: readonly OptionGroup[];
  readonly embedOptions: EmbedOptions;
}

export type ShareRepresentation = string;

export interface ShareError {
  readonly message: string;
  readonly code: ShareErrorCode;
}

export type ParseResult =
  | { readonly success: true; readonly artefact: ShareableArtefact }
  | { readonly success: false; readonly error: ShareError; readonly defaultArtefact: ShareableArtefact };

// --- Constants ---

export const DEFAULT_PAYLOAD = 'default-share-payload';
export const DEFAULT_OPTIONS: readonly OptionGroup[] = [];
export const DEFAULT_EMBED_OPTIONS: EmbedOptions = {};
export const DEFAULT_SHAREABLE_ARTEFACT: ShareableArtefact = {
  payload: DEFAULT_PAYLOAD,
  options: DEFAULT_OPTIONS,
  embedOptions: DEFAULT_EMBED_OPTIONS,
};

export const SHARE_ERROR_CODES = [
  'PARSE_FAILED',
  'INVALID_STRUCTURE',
] as const;

export type ShareErrorCode = typeof SHARE_ERROR_CODES[number];

// --- Factory functions ---

/**
 * Creates an Artefact with optional identity, session, and account references.
 * The artefact carries the payload, option groups, and embed options needed for reconstruction.
 */
export function createArtefact(
  payload: string,
  options: readonly OptionGroup[] = DEFAULT_OPTIONS,
  embedOptions: EmbedOptions = DEFAULT_EMBED_OPTIONS,
  identity?: Identity,
  session?: Session,
  account?: Account
): Artefact {
  if (!payload || payload.trim() === '') {
    throw new Error('Artefact payload must be a non-empty string.');
  }
  if (!Array.isArray(options) || !options.every(isOptionGroup)) {
    throw new Error('Artefact options must be an array of OptionGroup.');
  }
  if (!isRecord(embedOptions)) {
    throw new Error('Artefact embedOptions must be an object.');
  }

  const base: ShareableArtefact = {
    payload,
    options,
    embedOptions,
  };

  return {
    ...base,
    ...(identity ? { identity } : {}),
    ...(session ? { session } : {}),
    ...(account ? { account } : {}),
  };
}

/**
 * Creates an OptionGroup with a name and parameters.
 */
export function createOptionGroup(
  name: string,
  parameters: Record<string, unknown> = {}
): OptionGroup {
  if (!name || name.trim() === '') {
    throw new Error('OptionGroup name must be a non-empty string.');
  }
  if (!isRecord(parameters)) {
    throw new Error('OptionGroup parameters must be an object.');
  }
  return { name, parameters };
}

/**
 * Creates EmbedOptions from a parameters object.
 */
export function createEmbedOptions(parameters: Record<string, unknown> = {}): EmbedOptions {
  if (!isRecord(parameters)) {
    throw new Error('EmbedOptions must be an object.');
  }
  return { ...parameters };
}

// --- Permission and sanitisation ---

/**
 * Strips identity, session, and account references from an Artefact,
 * producing a ShareableArtefact that discloses no producer information.
 */
export function toShareableArtefact(artefact: Artefact): ShareableArtefact {
  return {
    payload: artefact.payload,
    options: artefact.options,
    embedOptions: artefact.embedOptions,
  };
}

// --- Serialisation and parsing ---

/**
 * Serialises a ShareableArtefact into a ShareRepresentation (JSON string).
 * The representation is self-contained and requires no server state.
 */
export function serializeShareRepresentation(artefact: ShareableArtefact): ShareRepresentation {
  return JSON.stringify(toShareableArtefact(artefact));
}

/**
 * Type guard to validate ShareableArtefact structure from unknown input.
 */
function isShareableArtefact(value: unknown): value is ShareableArtefact {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as { [key: string]: unknown };
  if (typeof obj.payload !== 'string' || obj.payload.trim() === '') {
    return false;
  }
  if (!Array.isArray(obj.options) || !obj.options.every(isOptionGroup)) {
    return false;
  }
  if (!isRecord(obj.embedOptions)) {
    return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionGroup(value: unknown): value is OptionGroup {
  return isRecord(value)
    && typeof value.name === 'string'
    && value.name.trim() !== ''
    && isRecord(value.parameters);
}

/**
 * Parses a ShareRepresentation into a ShareableArtefact.
 * On failure, returns the default configuration and an error, rather than throwing.
 */
export function parseShareRepresentation(representation: ShareRepresentation): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(representation);
  } catch {
    return {
      success: false,
      error: { message: 'Share representation is not valid JSON.', code: 'PARSE_FAILED' },
      defaultArtefact: DEFAULT_SHAREABLE_ARTEFACT,
    };
  }

  if (!isShareableArtefact(parsed)) {
    return {
      success: false,
      error: {
        message: 'Parsed representation does not conform to ShareableArtefact schema.',
        code: 'INVALID_STRUCTURE',
      },
      defaultArtefact: DEFAULT_SHAREABLE_ARTEFACT,
    };
  }

  return { success: true, artefact: toShareableArtefact(parsed) };
}

// --- Round-trip validation ---

/**
 * Round-trips a ShareableArtefact through its share representation,
 * returning an identical artefact. Throws if the round-trip fails.
 */
export function roundTripShareRepresentation(artefact: ShareableArtefact): ShareableArtefact {
  const representation = serializeShareRepresentation(artefact);
  const result = parseShareRepresentation(representation);
  if (!result.success) {
    throw new Error(`Round-trip failed: ${result.error.message}`);
  }
  return result.artefact;
}
