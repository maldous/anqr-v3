// Capability module for performance budgets in the ANQR product.
// Implements fail-closed enforcement of declared time and output-size budgets
// across complexity classes, readiness tracking, and representative-sample
// validation.

export type ComplexityClass = 'trivial' | 'small' | 'medium' | 'large' | 'extreme';

export const COMPLEXITY_CLASSES: readonly ComplexityClass[] = [
  'trivial',
  'small',
  'medium',
  'large',
  'extreme',
] as const;

export interface PerformanceBudget {
  readonly class: ComplexityClass;
  readonly maxMillis: number;
  readonly maxOutputBytes: number;
}

export interface Surface {
  readonly id: string;
  readonly budgets: ReadonlyMap<ComplexityClass, PerformanceBudget>;
}

export interface RequestMeasurement {
  readonly elapsedMillis: number;
  readonly outputBytes: number;
}

export type RequestClassResult =
  | { readonly ok: true; readonly classification: ComplexityClass; readonly budget: PerformanceBudget }
  | { readonly ok: false; readonly error: BudgetRefusalError };

export type ReadinessState = 'ready' | 'unready';

export const READINESS_READY: ReadinessState = 'ready';
export const READINESS_UNREADY: ReadinessState = 'unready';

export const READINESS_STATES: readonly ReadinessState[] = [
  READINESS_READY,
  READINESS_UNREADY,
] as const;

export type BudgetValidationOutcome = 'within' | 'over-time' | 'over-size' | 'over-both';

export const VALIDATION_OUTCOMES: readonly BudgetValidationOutcome[] = [
  'within',
  'over-time',
  'over-size',
  'over-both',
] as const;

export type BudgetValidationSummary = 'all-within' | 'some-breach' | 'all-breach';

export const VALIDATION_SUMMARIES: readonly BudgetValidationSummary[] = [
  'all-within',
  'some-breach',
  'all-breach',
] as const;

export interface BudgetValidationResult {
  readonly outcome: BudgetValidationOutcome;
  readonly budget: PerformanceBudget;
  readonly class: ComplexityClass;
  readonly measurement: RequestMeasurement;
}

export interface BudgetValidationReport {
  readonly surface: string;
  readonly summary: BudgetValidationSummary;
  readonly results: ReadonlyMap<ComplexityClass, readonly BudgetValidationResult[]>;
  readonly breachClasses: readonly ComplexityClass[];
}

export interface BudgetRefusalError {
  readonly kind: 'budget-refused';
  readonly message: string;
  readonly class: ComplexityClass;
  readonly budget: PerformanceBudget;
  readonly measurement: RequestMeasurement;
  readonly breachTime: boolean;
  readonly breachSize: boolean;
  readonly declaredTimeBudgetMillis: number;
  readonly declaredSizeBudgetBytes: number;
  readonly overTime: boolean;
  readonly overSize: boolean;
  readonly refusalReason: string;
}

export interface ReadinessReport {
  readonly surface: string;
  readonly state: ReadinessState;
  readonly breachCount: number;
  readonly sampleCount: number;
}

// --- Error constructors ---

export function budgetRefusal(
  klass: ComplexityClass,
  budget: PerformanceBudget,
  measurement: RequestMeasurement,
): BudgetRefusalError {
  const breachTime = measurement.elapsedMillis > budget.maxMillis;
  const breachSize = measurement.outputBytes > budget.maxOutputBytes;
  const overTime = breachTime;
  const overSize = breachSize;
  const reason = breachTime && breachSize
    ? `elapsed ${measurement.elapsedMillis}ms exceeds declared time budget of ${budget.maxMillis}ms and output ${measurement.outputBytes} bytes exceeds declared output size bound of ${budget.maxOutputBytes} bytes`
    : breachTime
      ? `elapsed ${measurement.elapsedMillis}ms exceeds declared time budget of ${budget.maxMillis}ms`
      : `output ${measurement.outputBytes} bytes exceeds declared output size bound of ${budget.maxOutputBytes} bytes`;
  return {
    kind: 'budget-refused',
    message:
      `Request refused for complexity class "${klass}": ${reason}. ` +
      `Declared budget is ${budget.maxMillis}ms and ${budget.maxOutputBytes} bytes; ` +
      `no partial or late response will be returned.`,
    class: klass,
    budget,
    measurement,
    breachTime,
    breachSize,
    declaredTimeBudgetMillis: budget.maxMillis,
    declaredSizeBudgetBytes: budget.maxOutputBytes,
    overTime,
    overSize,
    refusalReason: reason,
  };
}

// --- Classification ---

export function classifyRequest(
  surface: Surface,
  measurement: RequestMeasurement,
): RequestClassResult {
  if (surface.budgets.size === 0) {
    throw new Error(`Surface "${surface.id}" declares no budgets and cannot classify requests.`);
  }

  const requiredClass = measurementOutputClass(measurement);
  const requiredBudget = surface.budgets.get(requiredClass);

  if (requiredBudget !== undefined) {
    if (measurement.elapsedMillis <= requiredBudget.maxMillis &&
        measurement.outputBytes <= requiredBudget.maxOutputBytes) {
      return { ok: true, classification: requiredClass, budget: requiredBudget };
    }
    return {
      ok: false,
      error: budgetRefusal(requiredClass, requiredBudget, measurement),
    };
  }

  for (const klass of COMPLEXITY_CLASSES) {
    const budget = surface.budgets.get(klass);
    if (budget === undefined) {
      continue;
    }
    if (measurement.elapsedMillis <= budget.maxMillis &&
        measurement.outputBytes <= budget.maxOutputBytes) {
      return { ok: true, classification: klass, budget };
    }
  }

  const fallbackBudget = smallestBudget(surface);
  return {
    ok: false,
    error: budgetRefusal(
      fallbackBudget.class,
      fallbackBudget,
      measurement,
    ),
  };
}

function measurementOutputClass(measurement: RequestMeasurement): ComplexityClass {
  const bytes = measurement.outputBytes;
  if (bytes <= 1024) {
    return 'trivial';
  }
  if (bytes <= 16 * 1024) {
    return 'small';
  }
  if (bytes <= 256 * 1024) {
    return 'medium';
  }
  if (bytes <= 4 * 1024 * 1024) {
    return 'large';
  }
  return 'extreme';
}

function smallestBudget(surface: Surface): PerformanceBudget {
  let best: PerformanceBudget | undefined;
  for (const klass of COMPLEXITY_CLASSES) {
    const candidate = surface.budgets.get(klass);
    if (candidate === undefined) {
      continue;
    }
    if (best === undefined || candidate.maxMillis < best.maxMillis) {
      best = candidate;
    }
  }
  if (best === undefined) {
    throw new Error(`Surface "${surface.id}" has no declared budgets.`);
  }
  return best;
}

// --- Budget enforcement (fail-closed) ---

export function enforceBudget(
  surface: Surface,
  measurement: RequestMeasurement,
  onAudit: (classification: ComplexityClass, budget: PerformanceBudget) => void,
): RequestClassResult {
  const result = classifyRequest(surface, measurement);
  if (!result.ok) {
    return result;
  }
  onAudit(result.classification, result.budget);
  return result;
}

// --- Readiness tracking ---

export function initialReadiness(surfaceId: string): ReadinessReport {
  return {
    surface: surfaceId,
    state: READINESS_READY,
    breachCount: 0,
    sampleCount: 0,
  };
}

export function recordSample(
  report: ReadinessReport,
  measurement: RequestMeasurement,
  surface: Surface,
  audit: (report: ReadinessReport) => ReadinessReport,
): ReadinessReport {
  const updated = updateReadiness(report, measurement, surface);
  const audited = audit(updated);
  if (audited !== updated) {
    throw new Error('Audit must return the unchanged readiness report.');
  }
  return audited;
}

function updateReadiness(
  report: ReadinessReport,
  measurement: RequestMeasurement,
  surface: Surface,
): ReadinessReport {
  if (surface.budgets.size === 0) {
    throw new Error(`Surface "${surface.id}" declares no budgets; readiness cannot be evaluated.`);
  }
  const within = isMeasurementWithinBudget(surface, measurement);
  const nextBreach = within ? report.breachCount : report.breachCount + 1;
  const nextSamples = report.sampleCount + 1;
  const breachRatio = nextSamples === 0 ? 0 : nextBreach / nextSamples;
  const sustainedBreach = nextSamples >= 1 && breachRatio >= 1;
  return {
    surface: report.surface,
    state: sustainedBreach ? READINESS_UNREADY : READINESS_READY,
    breachCount: nextBreach,
    sampleCount: nextSamples,
  };
}

function isMeasurementWithinBudget(
  surface: Surface,
  measurement: RequestMeasurement,
): boolean {
  for (const klass of COMPLEXITY_CLASSES) {
    const budget = surface.budgets.get(klass);
    if (budget === undefined) {
      continue;
    }
    if (measurement.elapsedMillis <= budget.maxMillis &&
        measurement.outputBytes <= budget.maxOutputBytes) {
      return true;
    }
  }
  return false;
}

// --- Validation ---

export function validateAgainstBudget(
  surface: Surface,
  klass: ComplexityClass,
  measurement: RequestMeasurement,
): BudgetValidationResult {
  const budget = surface.budgets.get(klass);
  if (budget === undefined) {
    throw new Error(
      `Surface "${surface.id}" declares no budget for complexity class "${klass}".`,
    );
  }
  return validateMeasurement(klass, budget, measurement);
}

export function validateMeasurementsAgainstBudgets(
  surface: Surface,
  samples: ReadonlyMap<ComplexityClass, RequestMeasurement>,
): ReadonlyMap<ComplexityClass, BudgetValidationResult> {
  const results = new Map<ComplexityClass, BudgetValidationResult>();
  for (const klass of COMPLEXITY_CLASSES) {
    const sample = samples.get(klass);
    if (sample === undefined) {
      continue;
    }
    const budget = surface.budgets.get(klass);
    if (budget === undefined) {
      throw new Error(
        `Surface "${surface.id}" declares no budget for complexity class "${klass}".`,
      );
    }
    results.set(klass, validateMeasurement(klass, budget, sample));
  }
  return results;
}

export function validateRepresentativeSamples(
  surface: Surface,
  samples: ReadonlyMap<ComplexityClass, readonly RequestMeasurement[]>,
): BudgetValidationReport {
  if (surface.budgets.size === 0) {
    throw new Error(`Surface "${surface.id}" declares no budgets; representative samples cannot be validated.`);
  }

  const perClass = new Map<ComplexityClass, readonly BudgetValidationResult[]>();
  const breachClasses: ComplexityClass[] = [];
  let totalSamples = 0;
  let totalBreaches = 0;

  for (const klass of COMPLEXITY_CLASSES) {
    const sampleList = samples.get(klass);
    if (sampleList === undefined) {
      continue;
    }
    const budget = surface.budgets.get(klass);
    if (budget === undefined) {
      throw new Error(
        `Surface "${surface.id}" declares no budget for complexity class "${klass}".`,
      );
    }
    const validated: BudgetValidationResult[] = [];
    for (const measurement of sampleList) {
      const result = validateMeasurement(klass, budget, measurement);
      validated.push(result);
      totalSamples += 1;
      if (result.outcome !== 'within') {
        totalBreaches += 1;
      }
    }
    perClass.set(klass, validated);
    if (validated.length > 0 && validated.some((r) => r.outcome !== 'within')) {
      breachClasses.push(klass);
    }
  }

  let summary: BudgetValidationSummary;
  if (totalSamples === 0) {
    summary = 'all-within';
  } else if (totalBreaches === 0) {
    summary = 'all-within';
  } else if (totalBreaches === totalSamples) {
    summary = 'all-breach';
  } else {
    summary = 'some-breach';
  }

  return {
    surface: surface.id,
    summary,
    results: perClass,
    breachClasses,
  };
}

export function runRepresentativeBudgetValidation(
  surface: Surface,
  samples: ReadonlyMap<ComplexityClass, readonly RequestMeasurement[]>,
  audit: (report: BudgetValidationReport) => BudgetValidationReport,
): BudgetValidationReport {
  const report = validateRepresentativeSamples(surface, samples);
  const audited = audit(report);
  if (audited !== report) {
    throw new Error('Audit must return the unchanged validation report.');
  }
  return audited;
}

function validateMeasurement(
  klass: ComplexityClass,
  budget: PerformanceBudget,
  measurement: RequestMeasurement,
): BudgetValidationResult {
  const overTime = measurement.elapsedMillis > budget.maxMillis;
  const overSize = measurement.outputBytes > budget.maxOutputBytes;
  let outcome: BudgetValidationOutcome;
  if (overTime && overSize) {
    outcome = 'over-both';
  } else if (overTime) {
    outcome = 'over-time';
  } else if (overSize) {
    outcome = 'over-size';
  } else {
    outcome = 'within';
  }
  return { outcome, budget, class: klass, measurement };
}

// --- Factory ---

export function createSurface(
  id: string,
  budgets: readonly PerformanceBudget[],
): Surface {
  if (!id || id.trim() === '') {
    throw new Error('Surface id must be a non-empty string.');
  }
  if (budgets.length === 0) {
    throw new Error(`Surface "${id}" must declare at least one budget.`);
  }
  const seen = new Set<ComplexityClass>();
  const map = new Map<ComplexityClass, PerformanceBudget>();
  for (const budget of budgets) {
    if (budget.maxMillis < 0) {
      throw new Error(
        `Budget for class "${budget.class}" on surface "${id}" must have a non-negative maxMillis.`,
      );
    }
    if (budget.maxOutputBytes < 0) {
      throw new Error(
        `Budget for class "${budget.class}" on surface "${id}" must have a non-negative maxOutputBytes.`,
      );
    }
    if (seen.has(budget.class)) {
      throw new Error(
        `Duplicate budget for class "${budget.class}" on surface "${id}".`,
      );
    }
    seen.add(budget.class);
    map.set(budget.class, budget);
  }
  return { id, budgets: map };
}

export function createBudget(
  klass: ComplexityClass,
  maxMillis: number,
  maxOutputBytes: number,
): PerformanceBudget {
  return { class: klass, maxMillis, maxOutputBytes };
}