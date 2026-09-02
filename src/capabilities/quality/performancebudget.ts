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

export type BudgetValidationOutcome = 'within' | 'over-time' | 'over-size';

export const VALIDATION_OUTCOMES: readonly BudgetValidationOutcome[] = [
  'within',
  'over-time',
  'over-size',
] as const;

export interface BudgetValidationResult {
  readonly outcome: BudgetValidationOutcome;
  readonly budget: PerformanceBudget;
  readonly class: ComplexityClass;
}

export interface BudgetRefusalError {
  readonly kind: 'budget-refused';
  readonly message: string;
  readonly class: ComplexityClass;
  readonly budget: PerformanceBudget;
  readonly measurement: RequestMeasurement;
  readonly breachTime: boolean;
  readonly breachSize: boolean;
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
  const reason = breachTime && breachSize
    ? `elapsed ${measurement.elapsedMillis}ms exceeds budget of ${budget.maxMillis}ms and output ${measurement.outputBytes} bytes exceeds budget of ${budget.maxOutputBytes} bytes`
    : breachTime
      ? `elapsed ${measurement.elapsedMillis}ms exceeds budget of ${budget.maxMillis}ms`
      : `output ${measurement.outputBytes} bytes exceeds budget of ${budget.maxOutputBytes} bytes`;
  return {
    kind: 'budget-refused',
    message:
      `Request refused for class "${klass}": ${reason}. ` +
      `Declared budget is ${budget.maxMillis}ms and ${budget.maxOutputBytes} bytes; ` +
      `no partial or late response will be returned.`,
    class: klass,
    budget,
    measurement,
    breachTime,
    breachSize,
  };
}

// --- Classification ---

export function classifyRequest(
  surface: Surface,
  measurement: RequestMeasurement,
): RequestClassResult {
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

  return {
    ok: false,
    error: budgetRefusal(
      COMPLEXITY_CLASSES[COMPLEXITY_CLASSES.length - 1],
      smallestBudget(surface),
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
  const within = isMeasurementWithinBudget(surface, measurement);
  const nextBreach = within ? report.breachCount : report.breachCount + 1;
  const nextSamples = report.sampleCount + 1;
  const breachRatio = nextSamples === 0 ? 0 : nextBreach / nextSamples;
  const sustainedBreach = nextSamples >= 3 && breachRatio >= 0.5;
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
    throw new Error(`No budget declared for class "${klass}" on surface "${surface.id}".`);
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
      continue;
    }
    results.set(klass, validateMeasurement(klass, budget, sample));
  }
  return results;
}

export function validateRepresentativeSamples(
  surface: Surface,
  samples: ReadonlyMap<ComplexityClass, RequestMeasurement>,
): ReadonlyMap<ComplexityClass, BudgetValidationResult> {
  return validateMeasurementsAgainstBudgets(surface, samples);
}

function validateMeasurement(
  klass: ComplexityClass,
  budget: PerformanceBudget,
  measurement: RequestMeasurement,
): BudgetValidationResult {
  const timeOk = measurement.elapsedMillis <= budget.maxMillis;
  const sizeOk = measurement.outputBytes <= budget.maxOutputBytes;
  if (timeOk && sizeOk) {
    return { outcome: 'within', budget, class: klass };
  }
  if (!timeOk) {
    return { outcome: 'over-time', budget, class: klass };
  }
  return { outcome: 'over-size', budget, class: klass };
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