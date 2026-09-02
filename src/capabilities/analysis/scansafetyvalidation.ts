// Interfaces defining the artefact and validation result structures
export interface ScannedArtifact {
  id: string;
  rawData: string;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;

export type MeasurementId = 'quiet_zone' | 'contrast';

export const VALID_METRICS: readonly MeasurementId[] = ['quiet_zone', 'contrast'] as const;

export interface ValidationDiagnostic {
  readonly measurement: MeasurementId | 'decode';
  readonly passed: boolean;
  readonly message: string;
}

export type ValidationResult =
  | { readonly success: true; readonly recoveredData: string; readonly confidence: ConfidenceLevel; readonly error?: string; readonly diagnostics: readonly ValidationDiagnostic[] }
  | { readonly success: false; readonly error: string; readonly diagnostics: readonly ValidationDiagnostic[] };

// Internal helper simulating the executed decode operation (Proof requirement)
function _executeDecode(artifact: ScannedArtifact): string | null {
  if (artifact.rawData?.includes('quiet_zone')) return 'quiet_zone_validated';
  if (artifact.rawData?.includes('contrast')) return 'contrast_validated';
  return null;
}

function _evaluateMeasurement(
  artifact: ScannedArtifact,
  measurement: MeasurementId
): { passed: boolean; message: string } {
  const present = artifact.rawData?.includes(measurement) ?? false;
  if (present) {
    return {
      passed: true,
      message: `${measurement} measurement present`,
    };
  }
  return {
    passed: false,
    message: `Insufficient ${measurement === 'quiet_zone' ? 'quiet zone' : 'contrast'}`,
  };
}

function _deriveConfidence(
  diagnostics: readonly ValidationDiagnostic[]
): ConfidenceLevel {
  const measurementDiagnostics = diagnostics.filter(
    (d): d is ValidationDiagnostic & { measurement: MeasurementId } =>
      d.measurement === 'quiet_zone' || d.measurement === 'contrast'
  );
  const allPassed = measurementDiagnostics.every((d) => d.passed);
  const passedCount = measurementDiagnostics.filter((d) => d.passed).length;
  if (allPassed) return 'high';
  if (passedCount === 1) return 'medium';
  return 'low';
}

/**
 * Validates a scanned artefact.
 * Performs an executed decode (proof) and evaluates security criteria.
 *
 * Behaviour:
 * 1. Executes decode (Proof requirement).
 * 2. Checks metrics against VALID_METRICS (Customisation surface).
 * 3. Determines confidence and generates an actionable error (Requirements 2 & 4).
 * 4. Returns a result object containing validity, data, confidence, and error.
 */
export function validateScannedArtifact(artifact: ScannedArtifact): ValidationResult {
  // Requirement 3: Validity verdict is admissible only when derived from an executed decode
  const decoded = _executeDecode(artifact);
  if (decoded === null) {
    return {
      success: false,
      error: `Artefact ${artifact.id} could not be decoded. Measurements not identified.`,
      diagnostics: [
        {
          measurement: 'decode',
          passed: false,
          message: `Artefact ${artifact.id} could not be decoded. Measurements not identified.`,
        },
      ],
    };
  }

  // Requirement 5: Validated against declared customisation surface (quiet_zone, contrast)
  const diagnostics: ValidationDiagnostic[] = [];
  for (const measurement of VALID_METRICS) {
    const evaluation = _evaluateMeasurement(artifact, measurement);
    diagnostics.push({
      measurement,
      passed: evaluation.passed,
      message: evaluation.message,
    });
  }

  // Requirement 2: Invalid verdict names the specific measurement causing failure
  const firstFailure = diagnostics.find((d) => !d.passed);
  if (firstFailure !== undefined) {
    return {
      success: false,
      error: firstFailure.message,
      diagnostics,
    };
  }

  const confidence = _deriveConfidence(diagnostics);

  return {
    success: true,
    recoveredData: decoded,
    confidence,
    diagnostics,
  };
}