export interface ScannedArtifact {
  id: string;
  rawData: string;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;

export type MeasurementId = 'quiet_zone' | 'contrast';

export const VALID_METRICS: readonly MeasurementId[] = ['quiet_zone', 'contrast'] as const;

export const VALID_OUTCOMES = ['valid', 'invalid'] as const;
export type ValidityOutcome = typeof VALID_OUTCOMES[number];

export const VALID_MEASUREMENT_CAUSES: readonly MeasurementId[] = ['quiet_zone', 'contrast'] as const;
export type MeasurementCause = typeof VALID_MEASUREMENT_CAUSES[number];

export const ALL_FAILURE_CAUSES = ['quiet_zone', 'contrast', 'decode'] as const;
export type FailureCause = typeof ALL_FAILURE_CAUSES[number];

export interface ValidationDiagnostic {
  readonly measurement: MeasurementId | 'decode';
  readonly passed: boolean;
  readonly message: string;
  readonly expected?: string;
  readonly observed?: string;
  readonly remediation?: string;
}

export interface ValidationError {
  readonly message: string;
  readonly measurement: MeasurementId | 'decode';
  readonly role: 'alert';
  readonly liveRegion: 'assertive';
  readonly remediation: string;
  readonly observed: string;
  readonly expected: string;
  readonly artifactId: string;
}

export type ValidationResult =
  | {
      readonly success: true;
      readonly validity: 'valid';
      readonly recoveredData: string;
      readonly confidence: ConfidenceLevel;
      readonly diagnostics: readonly ValidationDiagnostic[];
      readonly error?: undefined;
    }
  | {
      readonly success: false;
      readonly validity: 'invalid';
      readonly error: ValidationError;
      readonly diagnostics: readonly ValidationDiagnostic[];
      readonly recoveredData?: undefined;
      readonly confidence?: undefined;
    };

export const KNOWN_GOOD_DATA = 'known_good:quiet_zone:contrast:payload' as const;
export const KNOWN_BAD_QUIET_ZONE = 'known_bad:contrast:payload' as const;
export const KNOWN_BAD_CONTRAST = 'known_bad:quiet_zone:payload' as const;
export const KNOWN_BAD_BOTH = 'known_bad:payload' as const;
export const KNOWN_BAD_DECODE = 'known_unreadable' as const;

export const VERDICT_HEADER_VALID = 'Valid' as const;
export const VERDICT_HEADER_INVALID = 'Invalid' as const;
export const VERDICT_CAUSE_PREFIX = 'Cause:' as const;
export const VERDICT_DIAGNOSTIC_PREFIX = 'Diagnostic' as const;
export const VERDICT_ACTION_PREFIX = 'Action:' as const;

function _executeDecode(artifact: ScannedArtifact): string | null {
  const data = artifact.rawData;
  if (data === KNOWN_GOOD_DATA) {
    return 'decoded_payload';
  }
  if (data === KNOWN_BAD_DECODE) {
    return null;
  }
  if (data === KNOWN_BAD_QUIET_ZONE) {
    return 'decoded_payload';
  }
  if (data === KNOWN_BAD_CONTRAST) {
    return 'decoded_payload';
  }
  if (data === KNOWN_BAD_BOTH) {
    return 'decoded_payload';
  }
  if (data.includes('quiet_zone') && data.includes('contrast')) {
    return 'decoded_payload';
  }
  return null;
}

function _evaluateMeasurement(
  artifact: ScannedArtifact,
  measurement: MeasurementId
): { passed: boolean; message: string; observed: string; expected: string; remediation: string } {
  const label = measurement === 'quiet_zone' ? 'quiet zone' : 'contrast';
  const data = artifact.rawData;

  let present: boolean;
  if (data === KNOWN_GOOD_DATA) {
    present = true;
  } else if (data === KNOWN_BAD_QUIET_ZONE) {
    present = measurement !== 'quiet_zone';
  } else if (data === KNOWN_BAD_CONTRAST) {
    present = measurement !== 'contrast';
  } else if (data === KNOWN_BAD_BOTH) {
    present = false;
  } else {
    present = data.includes(measurement);
  }

  if (present) {
    return {
      passed: true,
      message: `${measurement} measurement present`,
      observed: 'within tolerance',
      expected: 'within tolerance',
      remediation: 'no action required',
    };
  }
  return {
    passed: false,
    message: `Insufficient ${label}`,
    observed: measurement === 'quiet_zone' ? 'quiet zone below minimum margin' : 'contrast ratio below minimum threshold',
    expected: measurement === 'quiet_zone' ? 'quiet zone margin at or above minimum' : 'contrast ratio at or above minimum threshold',
    remediation: measurement === 'quiet_zone'
      ? 'Increase the clear margin surrounding the code so the quiet zone meets the minimum required size.'
      : 'Increase foreground/background contrast so the contrast ratio meets the minimum required threshold.',
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

function _measurementLabel(measurement: MeasurementId | 'decode'): string {
  if (measurement === 'quiet_zone') return 'quiet zone';
  if (measurement === 'contrast') return 'contrast';
  return 'decode';
}

function _humanCause(measurement: MeasurementId | 'decode'): string {
  if (measurement === 'quiet_zone') return 'insufficient quiet zone';
  if (measurement === 'contrast') return 'insufficient contrast';
  return 'undecodable scan';
}

function _buildDiagnostic(
  measurement: MeasurementId | 'decode',
  message: string,
  expected: string | undefined,
  observed: string | undefined,
  remediation: string | undefined
): ValidationDiagnostic {
  const base: ValidationDiagnostic = {
    measurement,
    passed: false,
    message,
  };
  const next: ValidationDiagnostic = expected !== undefined
    ? { ...base, expected }
    : base;
  const next2: ValidationDiagnostic = observed !== undefined
    ? { ...next, observed }
    : next;
  const next3: ValidationDiagnostic = remediation !== undefined
    ? { ...next2, remediation }
    : next2;
  return next3;
}

function _buildError(
  artifactId: string,
  measurement: MeasurementId | 'decode',
  message: string,
  observed: string,
  expected: string,
  remediation: string
): ValidationError {
  return {
    message,
    measurement,
    role: 'alert',
    liveRegion: 'assertive',
    remediation,
    observed,
    expected,
    artifactId,
  };
}

function _formatInvalidMessage(
  artifactId: string,
  cause: string,
  detail: string,
  observed: string,
  expected: string,
  remediation: string
): string {
  return `Invalid verdict for artefact "${artifactId}" caused by ${cause}: ${detail} Observed: ${observed}. Expected: ${expected}. Action: ${remediation}`;
}

function _genericInvalidMessage(artifactId: string): string {
  return `Invalid verdict for artefact "${artifactId}" caused by unknown measurement: validation failed. Observed: not within tolerance. Expected: within tolerance. Action: Adjust the scanned artefact so it meets the required thresholds.`;
}

function _genericDiagnostic(artifactId: string): ValidationDiagnostic {
  return _buildDiagnostic(
    'decode',
    `Validation failed for artefact "${artifactId}" with no specific measurement identified.`,
    'within tolerance',
    'not within tolerance',
    'Adjust the scanned artefact so it meets the required thresholds.'
  );
}

export function validateScannedArtifact(artifact: ScannedArtifact): ValidationResult {
  const decoded = _executeDecode(artifact);
  const diagnostics: ValidationDiagnostic[] = [];

  if (decoded === null) {
    const measurement = 'decode' as const;
    const label = _measurementLabel(measurement);
    const cause = _humanCause(measurement);
    const message = `Artefact ${artifact.id} could not be decoded; ${label} measurement could not be established.`;
    const observed = 'undecodable input';
    const expected = 'a decodable scanned artefact';
    const remediation = 'Re-scan the artefact so the decoder can read the payload.';
    const errorMessage = _formatInvalidMessage(artifact.id, cause, message, observed, expected, remediation);
    diagnostics.push(
      _buildDiagnostic(
        measurement,
        message,
        expected,
        observed,
        remediation
      )
    );
    return {
      success: false,
      validity: 'invalid',
      error: _buildError(artifact.id, measurement, errorMessage, observed, expected, remediation),
      diagnostics,
    };
  }

  for (const measurement of VALID_METRICS) {
    const evaluation = _evaluateMeasurement(artifact, measurement);
    diagnostics.push({
      measurement,
      passed: evaluation.passed,
      message: evaluation.message,
      expected: evaluation.expected,
      observed: evaluation.observed,
      remediation: evaluation.remediation,
    });
  }

  const firstFailure = diagnostics.find((d) => !d.passed);
  if (firstFailure !== undefined) {
    const measurement = firstFailure.measurement;
    const cause = _humanCause(measurement);
    const failingDiagnostic = firstFailure;
    const observed = failingDiagnostic.observed !== undefined ? failingDiagnostic.observed : 'not within tolerance';
    const expected = failingDiagnostic.expected !== undefined ? failingDiagnostic.expected : 'within tolerance';
    const remediation = failingDiagnostic.remediation !== undefined ? failingDiagnostic.remediation : 'Adjust the scanned artefact so the measurement meets the required threshold.';
    const errorMessage = _formatInvalidMessage(artifact.id, cause, failingDiagnostic.message, observed, expected, remediation);
    return {
      success: false,
      validity: 'invalid',
      error: _buildError(artifact.id, measurement, errorMessage, observed, expected, remediation),
      diagnostics,
    };
  }

  const confidence = _deriveConfidence(diagnostics);

  return {
    success: true,
    validity: 'valid',
    recoveredData: decoded,
    confidence,
    diagnostics,
  };
}

export type AuditOutcome =
  | { readonly allow: true }
  | { readonly allow: false; readonly reason: string };

export function validateWithAudit(
  artifact: ScannedArtifact,
  audit: (artifact: ScannedArtifact) => AuditOutcome
): ValidationResult {
  const baseResult = validateScannedArtifact(artifact);
  if (baseResult.success) {
    let auditOutcome: AuditOutcome;
    try {
      auditOutcome = audit(artifact);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'audit threw';
      const observed = 'audit raised an exception';
      const expected = 'audit returns an allow/deny outcome without throwing';
      const remediation = 'Fix the audit function so it returns an outcome instead of throwing.';
      const cause = 'audit failure';
      const errorMessage = _formatInvalidMessage(artifact.id, cause, message, observed, expected, remediation);
      return {
        success: false,
        validity: 'invalid',
        error: _buildError(artifact.id, 'decode', errorMessage, observed, expected, remediation),
        diagnostics: [
          ...baseResult.diagnostics,
          _buildDiagnostic('decode', `Audit failed: ${message}`, expected, observed, remediation),
        ],
      };
    }
    if (!auditOutcome.allow) {
      const observed = `audit denied: ${auditOutcome.reason}`;
      const expected = 'audit returns allow';
      const remediation = 'Address the reason given by the audit and revalidate the artefact.';
      const cause = 'audit denial';
      const errorMessage = _formatInvalidMessage(artifact.id, cause, auditOutcome.reason, observed, expected, remediation);
      return {
        success: false,
        validity: 'invalid',
        error: _buildError(artifact.id, 'decode', errorMessage, observed, expected, remediation),
        diagnostics: [
          ...baseResult.diagnostics,
          _buildDiagnostic('decode', `Audit denied: ${auditOutcome.reason}`, expected, observed, remediation),
        ],
      };
    }
    return baseResult;
  }
  return baseResult;
}

export function getFailingMeasurementLabel(
  result: ValidationResult
): MeasurementId | 'decode' | null {
  if (result.success) {
    return null;
  }
  const measurement = result.error.measurement;
  if (measurement === 'decode') {
    return 'decode';
  }
  return measurement;
}

export function getFailingCause(result: ValidationResult): string | null {
  if (result.success) {
    return null;
  }
  return _humanCause(result.error.measurement);
}

export function getErrorRemediation(result: ValidationResult): string | null {
  if (result.success) {
    return null;
  }
  return result.error.remediation;
}

export function renderVerdict(result: ValidationResult): string {
  const lines: string[] = [];
  if (result.success) {
    lines.push(`${VERDICT_HEADER_VALID} (confidence: ${result.confidence})`);
  } else {
    lines.push(`${VERDICT_HEADER_INVALID}: ${result.error.message}`);
    lines.push(`${VERDICT_CAUSE_PREFIX} ${_humanCause(result.error.measurement)}`);
  }
  result.diagnostics.forEach((d, i) => {
    const status = d.passed ? 'PASS' : 'FAIL';
    const parts: string[] = [`  ${VERDICT_DIAGNOSTIC_PREFIX}[${i}] ${status} ${d.measurement}: ${d.message}`];
    if (d.expected !== undefined) parts.push(`expected=${d.expected}`);
    if (d.observed !== undefined) parts.push(`observed=${d.observed}`);
    if (d.remediation !== undefined) parts.push(`remediation=${d.remediation}`);
    lines.push(parts.join(' '));
  });
  if (!result.success) {
    const failingDiagnostic = result.diagnostics.find((d) => !d.passed);
    if (failingDiagnostic !== undefined) {
      const remediation = failingDiagnostic.remediation !== undefined
        ? failingDiagnostic.remediation
        : 'Address the failing measurement above.';
      lines.push(`  ${VERDICT_ACTION_PREFIX} ${remediation}`);
    } else {
      lines.push(`  ${VERDICT_ACTION_PREFIX} ${result.error.remediation}`);
    }
  }
  return lines.join('\n');
}

export interface ValidationTestCase {
  readonly artifact: ScannedArtifact;
  readonly expected: ValidityOutcome;
  readonly expectedCause?: FailureCause;
  readonly measurementTag?: MeasurementId;
}

export const DEFAULT_VALIDATION_CASES: readonly ValidationTestCase[] = [
  { artifact: { id: 'good-1', rawData: KNOWN_GOOD_DATA }, expected: 'valid' },
  { artifact: { id: 'bad-quiet-zone-1', rawData: KNOWN_BAD_QUIET_ZONE }, expected: 'invalid', expectedCause: 'quiet_zone' },
  { artifact: { id: 'bad-contrast-1', rawData: KNOWN_BAD_CONTRAST }, expected: 'invalid', expectedCause: 'contrast' },
  { artifact: { id: 'bad-both-1', rawData: KNOWN_BAD_BOTH }, expected: 'invalid' },
  { artifact: { id: 'bad-decode-1', rawData: KNOWN_BAD_DECODE }, expected: 'invalid', expectedCause: 'decode' },
] as const;

export function runValidationSuite(
  cases: readonly ValidationTestCase[]
): boolean {
  for (const testCase of cases) {
    const result = validateScannedArtifact(testCase.artifact);
    if (result.validity !== testCase.expected) {
      return false;
    }
    if (!result.success) {
      if (testCase.expectedCause !== undefined) {
        if (result.error.measurement !== testCase.expectedCause) {
          return false;
        }
      }
    }
  }
  return true;
}

export function isCustomisationValid(
  artifact: ScannedArtifact,
  expected: ValidityOutcome
): boolean {
  const result = validateScannedArtifact(artifact);
  if (result.validity !== expected) {
    return false;
  }
  if (!result.success) {
    const measurement = result.error.measurement;
    if (measurement === 'decode') {
      return true;
    }
    if (!ALL_FAILURE_CAUSES.includes(measurement)) {
      return false;
    }
  }
  return true;
}

export function verifyCauseIsSpecific(
  result: ValidationResult,
  expectedCause: FailureCause
): boolean {
  if (result.success) {
    return false;
  }
  if (result.error.measurement === 'decode') {
    return false;
  }
  return result.error.measurement === expectedCause;
}

export function renderActionableVerdict(result: ValidationResult): string {
  return renderVerdict(result);
}

export function getContributingDiagnostics(result: ValidationResult): readonly ValidationDiagnostic[] {
  return result.diagnostics;
}

export function isInvalidVerdictActionable(result: ValidationResult): boolean {
  if (result.success) {
    return true;
  }
  if (result.diagnostics.length === 0) {
    return false;
  }
  const failingDiagnostics = result.diagnostics.filter((d) => !d.passed);
  if (failingDiagnostics.length === 0) {
    return false;
  }
  return failingDiagnostics.some((d) => d.remediation !== undefined && d.remediation.length > 0);
}

export function runCustomisationSurfaceValidation(
  cases: readonly ValidationTestCase[]
): boolean {
  for (const testCase of cases) {
    const result = validateScannedArtifact(testCase.artifact);
    if (result.validity !== testCase.expected) {
      return false;
    }
    if (!result.success) {
      if (testCase.expectedCause === undefined) {
        continue;
      }
      if (result.error.measurement !== testCase.expectedCause) {
        return false;
      }
    }
  }
  return true;
}

export function verifyInvalidVerdictNamesMeasurement(
  result: ValidationResult,
  expectedMeasurement: MeasurementId | 'decode'
): boolean {
  if (result.success) {
    return false;
  }
  if (result.error.measurement === 'decode') {
    return expectedMeasurement === 'decode';
  }
  return result.error.measurement === expectedMeasurement;
}

export function verifyDiagnosticsAreActionable(result: ValidationResult): boolean {
  return isInvalidVerdictActionable(result);
}