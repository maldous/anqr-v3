// Capability module for gallery experience in the ANQR product.

// --- Type definitions ---

export interface GalleryArtefact {
  readonly payload: string;
  readonly encoding: 'utf8' | 'base64';
}

export interface GalleryConfiguration {
  readonly template: string;
  readonly parameters: readonly { readonly key: string; readonly value: string }[];
}

export interface GalleryEntry {
  readonly id: string;
  readonly artefact: GalleryArtefact;
  readonly configuration: GalleryConfiguration;
  readonly capability: string;
}

export interface GalleryValidationResult {
  readonly success: true;
  readonly entry: GalleryEntry;
}

export interface GalleryValidationError {
  readonly success: false;
  readonly error: string;
  readonly code: 'REGENERATION_MISMATCH' | 'DECODE_FAILURE' | 'PAYLOAD_MISMATCH';
}

export type GalleryCheckResult = GalleryValidationResult | GalleryValidationError;

// --- Constants ---

export const DEFAULT_ENCODING = 'utf8' as const;
export const DEFAULT_TEMPLATE = 'blank' as const;
export const CAPABILITY_GALLERY = 'gallery' as const;

// --- Factory functions ---

/**
 * Creates a gallery artefact from a payload and encoding.
 */
export function createGalleryArtefact(
  payload: string,
  encoding: string = DEFAULT_ENCODING
): GalleryArtefact {
  if (!payload || payload.trim() === '') {
    throw new Error('Artefact payload must be a non-empty string.');
  }
  if (encoding !== 'utf8' && encoding !== 'base64') {
    throw new Error('Artefact encoding must be "utf8" or "base64".');
  }
  return { payload, encoding };
}

/**
 * Creates a gallery configuration from a template and parameters.
 */
export function createGalleryConfiguration(
  template: string,
  parameters: readonly { readonly key: string; readonly value: string }[] = []
): GalleryConfiguration {
  if (!template || template.trim() === '') {
    throw new Error('Configuration template must be a non-empty string.');
  }
  return { template, parameters };
}

/**
 * Creates a gallery entry with artefact, configuration, and capability.
 */
export function createGalleryEntry(
  id: string,
  artefact: GalleryArtefact,
  configuration: GalleryConfiguration,
  capability: string = CAPABILITY_GALLERY
): GalleryEntry {
  if (!id || id.trim() === '') {
    throw new Error('Gallery entry id must be a non-empty string.');
  }
  if (!capability || capability.trim() === '') {
    throw new Error('Gallery entry capability must be a non-empty string.');
  }
  return { id, artefact, configuration, capability };
}

// --- Rendering and decoding functions ---

/**
 * Renders an artefact from a configuration (pure function).
 * This is the "current product" rendering function that must be used for validation.
 */
export function renderFromConfiguration(
  configuration: GalleryConfiguration
): GalleryArtefact {
  const params = configuration.parameters.reduce(
    (acc, param) => ({ ...acc, [param.key]: param.value }),
    {} as Record<string, string>
  );
  
  // Simulate rendering: combine template with parameters
  const renderedPayload = `${configuration.template}:${JSON.stringify(params)}`;
  
  return createGalleryArtefact(renderedPayload, DEFAULT_ENCODING);
}

/**
 * Decodes an artefact to its payload (pure function).
 * Verifies the artefact can be decoded to its stated payload.
 */
export function decodeArtefact(artefact: GalleryArtefact): string {
  if (artefact.encoding === 'utf8') {
    return artefact.payload;
  }
  if (artefact.encoding === 'base64') {
    // In a real implementation, this would use Buffer.from(artefact.payload, 'base64').toString('utf8')
    // For this module, we simulate base64 decoding
    return artefact.payload; // Simplified for this context
  }
  throw new Error(`Unsupported encoding: ${artefact.encoding}`);
}

// --- Validation functions ---

/**
 * Validates that a gallery entry is evidence of rendering.
 * Checks that the entry was produced by the current product from its recorded configuration.
 * This check must precede any mutation (fail-closed).
 */
export function validateGalleryEntry(
  entry: GalleryEntry
): GalleryCheckResult {
  // Step 1: Regenerate artefact from configuration
  const regeneratedArtefact = renderFromConfiguration(entry.configuration);
  
  // Step 2: Assert artefact matches
  if (regeneratedArtefact.payload !== entry.artefact.payload ||
      regeneratedArtefact.encoding !== entry.artefact.encoding) {
    return {
      success: false,
      error: `Artefact mismatch for entry "${entry.id}"`,
      code: 'REGENERATION_MISMATCH',
    };
  }

  // Step 3: Decode artefact to verify payload
  let decodedPayload: string;
  try {
    decodedPayload = decodeArtefact(entry.artefact);
  } catch {
    return {
      success: false,
      error: `Decoding failed for entry "${entry.id}"`,
      code: 'DECODE_FAILURE',
    };
  }

  // Step 4: Verify decoded payload matches artefact payload
  if (decodedPayload !== entry.artefact.payload) {
    return {
      success: false,
      error: `Payload mismatch for entry "${entry.id}"`,
      code: 'PAYLOAD_MISMATCH',
    };
  }

  return { success: true, entry };
}

// --- UI semantics function ---

/**
 * Loads a gallery entry's configuration into the creation surface.
 * Makes the example a starting point rather than just a picture.
 * This function is pure and returns the configuration without mutation.
 */
export function loadConfigurationFromEntry(
  entry: GalleryEntry
): GalleryConfiguration {
  // First validate the entry to ensure it's evidence of rendering
  const validation = validateGalleryEntry(entry);
  if (!validation.success) {
    throw new Error(`Cannot load invalid gallery entry: ${validation.error}`);
  }
  
  // Return the configuration as a new object to prevent mutation
  return {
    template: entry.configuration.template,
    parameters: entry.configuration.parameters.map(param => ({
      key: param.key,
      value: param.value,
    })),
  };
}

// --- Composite workflow function ---

/**
 * Exercises the full gallery workflow: creation, validation, and configuration loading.
 * Demonstrates the capability gallery behaviour end-to-end.
 */
export function exerciseGalleryWorkflow(
  entries: readonly GalleryEntry[]
): { readonly valid: readonly GalleryEntry[]; readonly invalid: readonly GalleryValidationError[] } {
  const valid: GalleryEntry[] = [];
  const invalid: GalleryValidationError[] = [];

  for (const entry of entries) {
    const result = validateGalleryEntry(entry);
    if (result.success) {
      valid.push(result.entry);
    } else {
      invalid.push(result);
    }
  }

  return { valid, invalid };
}