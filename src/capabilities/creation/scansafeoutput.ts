// Capability module for scan safe output in the ANQR product.

// --- Type definitions ---

export type SafetyMode = 'off' | 'balanced' | 'strict';

export interface DecodedArtefact {
  readonly decodable: boolean;
  readonly margin: number;
  readonly threshold: number;
}

export interface SafetyState {
  readonly decoder: ((artefact: unknown) => DecodedArtefact) | null;
  readonly safetyMode: SafetyMode;
}

export interface SafetyCheckSuccess {
  readonly success: true;
  readonly artefact: unknown;
  readonly mode: SafetyMode;
  readonly decoderUsed: boolean;
}

export interface SafetyCheckFailure {
  readonly success: false;
  readonly error: {
    readonly message: string;
    readonly mode: SafetyMode;
    readonly contributingControl: string;
  };
}

export type SafetyCheckResult = SafetyCheckSuccess | SafetyCheckFailure;

// --- Constants ---

export const SAFETY_MODES: readonly SafetyMode[] = ['off', 'balanced', 'strict'] as const;
export const DEFAULT_SAFETY_MODE: SafetyMode = 'balanced';
export const DECODE_THRESHOLD = 0.8;

// --- Factory functions ---

/**
 * Creates initial safety state with no decoder and balanced mode.
 * Safety mode off is never the default.
 */
export function createInitialSafetyState(): SafetyState {
  return {
    decoder: null,
    safetyMode: DEFAULT_SAFETY_MODE,
  };
}

/**
 * Sets the decoder function for artefact validation.
 * Returns new state; does not mutate input.
 */
export function setDecoder(
  state: SafetyState,
  decoder: ((artefact: unknown) => DecodedArtefact) | null
): SafetyState {
  return {
    ...state,
    decoder,
  };
}

/**
 * Sets the safety mode explicitly.
 * Choosing 'off' is an explicit user decision.
 * Returns new state; does not mutate input.
 */
export function setSafetyMode(
  state: SafetyState,
  mode: SafetyMode
): SafetyState {
  return {
    ...state,
    safetyMode: mode,
  };
}

// --- Readiness check ---

/**
 * Checks if the capability is ready (decoder is available).
 * The capability never assumes an artefact is safe without a check.
 */
export function isReady(state: SafetyState): boolean {
  return state.decoder !== null;
}

// --- Safety validation ---

/**
 * Validates an artefact by decoding it, not by inspecting options.
 * The acceptance check must precede any mutation.
 * 
 * @param state Current safety state
 * @param artefact The artefact to validate
 * @param mutateFn Function to mutate the artefact if validation passes
 * @returns SafetyCheckResult indicating success or failure
 */
export function validateAndMutate(
  state: SafetyState,
  artefact: unknown,
  mutateFn: (validatedArtefact: unknown) => unknown
): SafetyCheckResult {
  // Fail-closed: if not ready, deny
  if (!isReady(state)) {
    return {
      success: false,
      error: {
        message: 'Safety check cannot proceed: decoder not available',
        mode: state.safetyMode,
        contributingControl: 'decoder',
      },
    };
  }

  // Decode the artefact to check acceptance
  let decoded: DecodedArtefact;
  try {
    decoded = state.decoder!(artefact);
  } catch (e) {
    return {
      success: false,
      error: {
        message: 'Decoder failed to process artefact',
        mode: state.safetyMode,
        contributingControl: 'decoder',
      },
    };
  }

  // Apply safety mode acceptance criteria
  switch (state.safetyMode) {
    case 'off': {
      // No safety adjustment - explicit user decision reported
      const mutated = mutateFn(artefact);
      return {
        success: true,
        artefact: mutated,
        mode: state.safetyMode,
        decoderUsed: true,
      };
    }
    case 'balanced': {
      // Must be decodable
      if (!decoded.decodable) {
        return {
          success: false,
          error: {
            message: 'Artefact is not decodable in balanced mode',
            mode: state.safetyMode,
            contributingControl: 'decoder',
          },
        };
      }
      const mutated = mutateFn(artefact);
      return {
        success: true,
        artefact: mutated,
        mode: state.safetyMode,
        decoderUsed: true,
      };
    }
    case 'strict': {
      // Must be decodable and have margin above threshold
      if (!decoded.decodable) {
        return {
          success: false,
          error: {
            message: 'Artefact is not decodable in strict mode',
            mode: state.safetyMode,
            contributingControl: 'decoder',
          },
        };
      }
      if (decoded.margin <= decoded.threshold) {
        return {
          success: false,
          error: {
            message: `Margin (${decoded.margin}) does not exceed threshold (${decoded.threshold}) in strict mode`,
            mode: state.safetyMode,
            contributingControl: 'decoder',
          },
        };
      }
      const mutated = mutateFn(artefact);
      return {
        success: true,
        artefact: mutated,
        mode: state.safetyMode,
        decoderUsed: true,
      };
    }
    default: {
      // Fail-closed for unknown modes
      return {
        success: false,
        error: {
          message: 'Unknown safety mode',
          mode: state.safetyMode,
          contributingControl: 'safetyMode',
        },
      };
    }
  }
}

/**
 * Validates an artefact without mutation (audit function).
 * Used to check acceptance before mutation.
 * 
 * @param state Current safety state
 * @param artefact The artefact to validate
 * @returns SafetyCheckResult indicating if acceptance is met
 */
export function validateOnly(
  state: SafetyState,
  artefact: unknown
): SafetyCheckResult {
  // Fail-closed: if not ready, deny
  if (!isReady(state)) {
    return {
      success: false,
      error: {
        message: 'Safety check cannot proceed: decoder not available',
        mode: state.safetyMode,
        contributingControl: 'decoder',
      },
    };
  }

  // Decode the artefact to check acceptance
  let decoded: DecodedArtefact;
  try {
    decoded = state.decoder!(artefact);
  } catch (e) {
    return {
      success: false,
      error: {
        message: 'Decoder failed to process artefact',
        mode: state.safetyMode,
        contributingControl: 'decoder',
      },
    };
  }

  // Apply safety mode acceptance criteria
  switch (state.safetyMode) {
    case 'off':
      return {
        success: true,
        artefact,
        mode: state.safetyMode,
        decoderUsed: true,
      };
    case 'balanced':
      if (!decoded.decodable) {
        return {
          success: false,
          error: {
            message: 'Artefact is not decodable in balanced mode',
            mode: state.safetyMode,
            contributingControl: 'decoder',
          },
        };
      }
      return {
        success: true,
        artefact,
        mode: state.safetyMode,
        decoderUsed: true,
      };
    case 'strict':
      if (!decoded.decodable) {
        return {
          success: false,
          error: {
            message: 'Artefact is not decodable in strict mode',
            mode: state.safetyMode,
            contributingControl: 'decoder',
          },
        };
      }
      if (decoded.margin <= decoded.threshold) {
        return {
          success: false,
          error: {
            message: `Margin (${decoded.margin}) does not exceed threshold (${decoded.threshold}) in strict mode`,
            mode: state.safetyMode,
            contributingControl: 'decoder',
          },
        };
      }
      return {
        success: true,
        artefact,
        mode: state.safetyMode,
        decoderUsed: true,
      };
    default:
      return {
        success: false,
        error: {
          message: 'Unknown safety mode',
          mode: state.safetyMode,
          contributingControl: 'safetyMode',
        },
      };
  }
}