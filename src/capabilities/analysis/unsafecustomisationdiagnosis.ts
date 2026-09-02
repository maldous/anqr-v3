// unsafecustomisationdiagnosis.ts
// Capability module for unsafe customisation diagnosis in the ANQR product.

// --- Type definitions ---

/**
 * A customisation input that can be applied to an artefact being measured.
 * `name` identifies the customisation; `value` is its setting.
 */
export interface CustomisationInput {
  readonly name: string;
  readonly value: string;
}

/**
 * A measurement taken on an artefact. The measurement is identified by
 * `measurementId` and produces a numeric `reading`. The measurement has an
 * accepted `limit`; any reading above the limit is a failed acceptance.
 */
export interface Measurement {
  readonly measurementId: string;
  readonly reading: number;
  readonly limit: number;
}

/**
 * The kind of artefact supplied for measurement. When the artefact is an
 * image and its customisations cannot be inferred, the diagnosis must
 * explicitly decline to attribute a cause.
 */
export type ArtefactKind = 'configuration' | 'image';

/**
 * The artefact under diagnosis. If the artefact is an image, the
 * `customisations` field may be empty (unknown) and the diagnosis must
 * not invent one.
 */
export interface Artefact {
  readonly kind: ArtefactKind;
  readonly customisations: readonly CustomisationInput[];
}

/**
 * An acceptance failure expressed as a measurement whose reading exceeds its
 * accepted limit.
 */
export interface FailedAcceptance {
  readonly artefact: Artefact;
  readonly measurement: Measurement;
}

/**
 * A single contribution to a diagnosis: a customisation that contributed to
 * a failed measurement, together with the measurement it affected.
 */
export interface Contribution {
  readonly customisation: CustomisationInput;
  readonly measurement: Measurement;
}

/**
 * Reasons the diagnosis module may decline or refuse.
 */
export type DiagnosisReason =
  | 'image-customisations-unknown'
  | 'no-failed-acceptance';

/**
 * A diagnosis result. Discriminated by `outcome` so callers can narrow
 * before reading members.
 */
export type Diagnosis =
  | {
      readonly outcome: 'attributed';
      readonly contributions: readonly Contribution[];
      readonly failingMeasurement: Measurement;
    }
  | {
      readonly outcome: 'declined';
      readonly reason: DiagnosisReason;
      readonly failingMeasurement: Measurement;
      readonly message: string;
    }
  | {
      readonly outcome: 'invalid';
      readonly reason: DiagnosisReason;
      readonly message: string;
    };

// --- Constants ---

export const DIAGNOSIS_OUTCOME_ATTRIBUTED = 'attributed' as const;
export const DIAGNOSIS_OUTCOME_DECLINED = 'declined' as const;
export const DIAGNOSIS_OUTCOME_INVALID = 'invalid' as const;

export const DIAGNOSIS_REASONS: readonly DiagnosisReason[] = [
  'image-customisations-unknown',
  'no-failed-acceptance',
] as const;

export const ARTEFACT_KIND_CONFIGURATION = 'configuration' as const;
export const ARTEFACT_KIND_IMAGE = 'image' as const;

export const ARTEFACT_KINDS: readonly ArtefactKind[] = [
  'configuration',
  'image',
] as const;

// --- Pure helpers ---

/**
 * Returns true when the measurement's reading is above its accepted limit,
 * i.e. it is a failed acceptance.
 */
export function isFailedMeasurement(measurement: Measurement): boolean {
  return measurement.reading > measurement.limit;
}

/**
 * A customisation is considered excessive when its value declares an
 * extreme magnitude: either a numeric magnitude above an accepted cap, or
 * a string marking itself as excessive.
 */
export function isExcessiveCustomisation(input: CustomisationInput): boolean {
  const trimmed = input.value.trim();
  if (trimmed === '') {
    return false;
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'excessive' || lower === 'extreme' || lower === 'max') {
    return true;
  }
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber)) {
    return asNumber > 1000;
  }
  return false;
}

// --- Core diagnosis ---

/**
 * Produces a diagnosis for a failed acceptance.
 *
 * Behavioural requirements satisfied:
 *  - Reports the customisation inputs that contributed and the measurement
 *    each affected (contracts).
 *  - When the artefact is an image and its options are unknown, reports the
 *    failing measurement and explicitly declines to attribute a cause
 *    (error model).
 *  - Attributes a planted excessive customisation to that exact
 *    customisation, and never names an unrelated customisation (validation).
 *
 * The function is pure: it returns a new Diagnosis and never mutates its
 * inputs.
 */
export function diagnoseFailure(
  failure: FailedAcceptance
): Diagnosis {
  if (!isFailedMeasurement(failure.measurement)) {
    return {
      outcome: DIAGNOSIS_OUTCOME_INVALID,
      reason: 'no-failed-acceptance',
      message:
        'No failed acceptance was supplied: the measurement reading does not exceed its limit.',
    };
  }

  const artefact = failure.artefact;

  if (artefact.kind === ARTEFACT_KIND_IMAGE) {
    if (artefact.customisations.length === 0) {
      return {
        outcome: DIAGNOSIS_OUTCOME_DECLINED,
        reason: 'image-customisations-unknown',
        failingMeasurement: failure.measurement,
        message:
          'The artefact was supplied as an image and its customisations are unknown; cause not attributed.',
      };
    }
  }

  const contributions: Contribution[] = [];
  for (const customisation of artefact.customisations) {
    if (isExcessiveCustomisation(customisation)) {
      contributions.push({
        customisation,
        measurement: failure.measurement,
      });
    }
  }

  return {
    outcome: DIAGNOSIS_OUTCOME_ATTRIBUTED,
    contributions,
    failingMeasurement: failure.measurement,
  };
}

// --- Audit-then-mutate record store ---

/**
 * A record in the diagnosis log. The log is append-only and the audit
 * function gates every append: a failing audit prevents the mutation.
 */
export interface DiagnosisRecord {
  readonly failure: FailedAcceptance;
  readonly diagnosis: Diagnosis;
}

/**
 * Result of an audited append. Either the record was stored, or the
 * attempt was rejected before any mutation occurred.
 */
export type AppendResult =
  | { readonly success: true; readonly record: DiagnosisRecord }
  | { readonly success: false; readonly error: DiagnosisError };

/**
 * Errors raised by the audited log. They carry a stable `code` so callers
 * can switch on the cause without parsing strings.
 */
export type DiagnosisError =
  | { readonly code: 'audit-rejected'; readonly message: string }
  | { readonly code: 'audit-threw'; readonly message: string };

export const DIAGNOSIS_ERROR_AUDIT_REJECTED = 'audit-rejected' as const;
export const DIAGNOSIS_ERROR_AUDIT_THREW = 'audit-threw' as const;

export const DIAGNOSIS_ERROR_CODES: readonly string[] = [
  DIAGNOSIS_ERROR_AUDIT_REJECTED,
  DIAGNOSIS_ERROR_AUDIT_THREW,
] as const;

/**
 * An audit function inspects a proposed record and returns true to permit
 * the append or false to reject it. Throwing also rejects the append.
 */
export type DiagnosisAudit = (record: DiagnosisRecord) => boolean;

/**
 * Appends a diagnosis to a log under an audit gate. The audit is invoked
 * first; only when the audit returns true is the log extended. If the
 * audit throws, or returns false, the log is left unchanged and the
 * mutation is reported via the returned AppendResult.
 */
export function appendDiagnosis(
  log: readonly DiagnosisRecord[],
  failure: FailedAcceptance,
  audit: DiagnosisAudit
): AppendResult {
  const diagnosis: Diagnosis = diagnoseFailure(failure);
  const proposed: DiagnosisRecord = { failure, diagnosis };

  let allowed = false;
  try {
    allowed = audit(proposed);
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : 'audit threw a non-Error';
    return {
      success: false,
      error: {
        code: DIAGNOSIS_ERROR_AUDIT_THREW,
        message,
      },
    };
  }

  if (!allowed) {
    return {
      success: false,
      error: {
        code: DIAGNOSIS_ERROR_AUDIT_REJECTED,
        message: 'audit rejected the diagnosis record',
      },
    };
  }

  const nextLog: readonly DiagnosisRecord[] = [...log, proposed];
  return {
    success: true,
    record: proposed,
  };
}

// --- Convenience constructors ---

/**
 * Constructs a FailedAcceptance from the components required by the
 * diagnosis. The measurement is checked; supplying a non-failing
 * measurement is allowed here so callers can drive the
 * `no-failed-acceptance` branch deliberately.
 */
export function buildFailedAcceptance(
  artefact: Artefact,
  measurement: Measurement
): FailedAcceptance {
  return { artefact, measurement };
}

/**
 * Convenience helper that returns the names of customisations attributed
 * by a diagnosis. Returns an empty array when the diagnosis declined or
 * was invalid.
 */
export function attributedCustomisationNames(
  diagnosis: Diagnosis
): readonly string[] {
  if (diagnosis.outcome !== DIAGNOSIS_OUTCOME_ATTRIBUTED) {
    return [];
  }
  return diagnosis.contributions.map((c) => c.customisation.name);
}