import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/quality/performancebudget.ts";

test("performancebudgetcontracts", () => {
  const surface = capability.createSurface("search.svc", [
    capability.createBudget("trivial", 50, 1024),
    capability.createBudget("small", 250, 16 * 1024),
    capability.createBudget("medium", 1000, 256 * 1024),
    capability.createBudget("large", 4000, 4 * 1024 * 1024),
    capability.createBudget("extreme", 10_000, 16 * 1024 * 1024),
  ]);

  const declaredBudgets: ReadonlyArray<{
    readonly class: capability.ComplexityClass;
    readonly maxMillis: number;
    readonly maxOutputBytes: number;
  }> = [
    { class: "trivial", maxMillis: 50, maxOutputBytes: 1024 },
    { class: "small", maxMillis: 250, maxOutputBytes: 16 * 1024 },
    { class: "medium", maxMillis: 1000, maxOutputBytes: 256 * 1024 },
    { class: "large", maxMillis: 4000, maxOutputBytes: 4 * 1024 * 1024 },
    { class: "extreme", maxMillis: 10_000, maxOutputBytes: 16 * 1024 * 1024 },
  ] as const;

  assert.equal(surface.id, "search.svc");
  assert.equal(surface.budgets.size, declaredBudgets.length);

  for (const budget of declaredBudgets) {
    const declared = surface.budgets.get(budget.class);
    assert.ok(declared !== undefined);
    assert.equal(declared.class, budget.class);
    assert.equal(declared.maxMillis, budget.maxMillis);
    assert.equal(declared.maxOutputBytes, budget.maxOutputBytes);
  }

  const classChecks: ReadonlyArray<{
    readonly measurement: capability.RequestMeasurement;
    readonly expectedClass: capability.ComplexityClass;
  }> = [
    { measurement: { elapsedMillis: 10, outputBytes: 512 }, expectedClass: "trivial" },
    { measurement: { elapsedMillis: 100, outputBytes: 2 * 1024 }, expectedClass: "small" },
    { measurement: { elapsedMillis: 500, outputBytes: 128 * 1024 }, expectedClass: "medium" },
    { measurement: { elapsedMillis: 500, outputBytes: 2 * 1024 * 1024 }, expectedClass: "large" },
    { measurement: { elapsedMillis: 500, outputBytes: 8 * 1024 * 1024 }, expectedClass: "extreme" },
  ] as const;

  for (const check of classChecks) {
    const result = capability.classifyRequest(surface, check.measurement);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.classification, check.expectedClass);
      assert.equal(result.budget.class, check.expectedClass);
      assert.equal(
        result.budget.maxOutputBytes,
        surface.budgets.get(check.expectedClass)!.maxOutputBytes,
      );
    }
  }
});

test("performancebudgeterrormodel", () => {
  const surface = capability.createSurface("report.svc", [
    capability.createBudget("trivial", 100, 1024),
    capability.createBudget("small", 250, 9000),
  ]);

  let auditCalls = 0;
  const overTime = capability.enforceBudget(
    surface,
    { elapsedMillis: 200, outputBytes: 500 },
    () => {
      auditCalls += 1;
    },
  );
  assert.equal(auditCalls, 0);
  assert.equal(overTime.ok, false);
  if (!overTime.ok) {
    assert.equal(overTime.error.kind, "budget-refused");
    assert.equal(overTime.error.class, "trivial");
    assert.equal(overTime.error.budget.maxMillis, 100);
    assert.equal(overTime.error.budget.maxOutputBytes, 1024);
    assert.equal(overTime.error.breachTime, true);
    assert.equal(overTime.error.breachSize, false);
    assert.equal(overTime.error.overTime, true);
    assert.equal(overTime.error.overSize, false);
    assert.match(overTime.error.message, /Request refused for complexity class "trivial"/);
    assert.match(overTime.error.message, /exceeds declared time budget of 100ms/);
    assert.match(overTime.error.message, /no partial or late response will be returned/);
  }

  auditCalls = 0;
  const overSize = capability.enforceBudget(
    surface,
    { elapsedMillis: 150, outputBytes: 13_000 },
    () => {
      auditCalls += 1;
    },
  );
  assert.equal(auditCalls, 0);
  assert.equal(overSize.ok, false);
  if (!overSize.ok) {
    assert.equal(overSize.error.kind, "budget-refused");
    assert.equal(overSize.error.class, "small");
    assert.equal(overSize.error.budget.maxMillis, 250);
    assert.equal(overSize.error.budget.maxOutputBytes, 9000);
    assert.equal(overSize.error.breachTime, false);
    assert.equal(overSize.error.breachSize, true);
    assert.equal(overSize.error.overTime, false);
    assert.equal(overSize.error.overSize, true);
    assert.match(overSize.error.message, /Request refused for complexity class "small"/);
    assert.match(
      overSize.error.message,
      /exceeds declared output size bound of 9000 bytes/,
    );
    assert.match(overSize.error.message, /no partial or late response will be returned/);
  }

  const overBoth = capability.enforceBudget(
    surface,
    { elapsedMillis: 300, outputBytes: 13_000 },
    () => {
      auditCalls += 1;
    },
  );
  assert.equal(auditCalls, 0);
  assert.equal(overBoth.ok, false);
  if (!overBoth.ok) {
    assert.equal(overBoth.error.kind, "budget-refused");
    assert.equal(overBoth.error.class, "small");
    assert.equal(overBoth.error.budget.maxMillis, 250);
    assert.equal(overBoth.error.budget.maxOutputBytes, 9000);
    assert.equal(overBoth.error.breachTime, true);
    assert.equal(overBoth.error.breachSize, true);
    assert.equal(overBoth.error.overTime, true);
    assert.equal(overBoth.error.overSize, true);
    assert.match(overBoth.error.message, /exceeds declared time budget of 250ms and output 13000 bytes exceeds declared output size bound of 9000 bytes/);
  }
});

test("performancebudgetreadinessmodel", () => {
  const surface = capability.createSurface("ready.svc", [
    capability.createBudget("trivial", 100, 1024),
  ]);

  let report = capability.initialReadiness(surface.id);
  assert.equal(report.state, capability.READINESS_READY);
  assert.equal(report.breachCount, 0);
  assert.equal(report.sampleCount, 0);
  assert.equal(report.surface, "ready.svc");

  report = capability.recordSample(report, { elapsedMillis: 200, outputBytes: 512 }, surface, (r) => r);
  assert.equal(report.state, capability.READINESS_UNREADY);
  assert.equal(report.sampleCount, 1);
  assert.equal(report.breachCount, 1);

  report = capability.recordSample(report, { elapsedMillis: 200, outputBytes: 512 }, surface, (r) => r);
  assert.equal(report.state, capability.READINESS_UNREADY);
  assert.equal(report.sampleCount, 2);
  assert.equal(report.breachCount, 2);

  report = capability.recordSample(report, { elapsedMillis: 50, outputBytes: 64 }, surface, (r) => r);
  assert.equal(report.state, capability.READINESS_READY);
  assert.equal(report.sampleCount, 3);
  assert.equal(report.breachCount, 2);

  assert.throws(
    () =>
      capability.recordSample(
        report,
        { elapsedMillis: 50, outputBytes: 64 },
        surface,
        (r) => ({ ...r, sampleCount: r.sampleCount + 1 }),
      ),
    /Audit must return the unchanged readiness report\./,
  );

  assert.throws(
    () =>
      capability.recordSample(
        report,
        { elapsedMillis: 50, outputBytes: 64 },
        surface,
        () => {
          throw new Error("audit failed");
        },
      ),
    /audit failed/,
  );
});

test("performancebudgetvalidation", () => {
  const surface = capability.createSurface("validate.svc", [
    capability.createBudget("trivial", 50, 1024),
    capability.createBudget("small", 200, 16 * 1024),
    capability.createBudget("medium", 500, 256 * 1024),
    capability.createBudget("large", 1500, 4 * 1024 * 1024),
    capability.createBudget("extreme", 10_000, 16 * 1024 * 1024),
  ]);

  const directCases: ReadonlyArray<{
    readonly klass: capability.ComplexityClass;
    readonly measurement: capability.RequestMeasurement;
    readonly expected: capability.BudgetValidationOutcome;
  }> = [
    { klass: "trivial", measurement: { elapsedMillis: 25, outputBytes: 128 }, expected: "within" },
    { klass: "small", measurement: { elapsedMillis: 300, outputBytes: 512 }, expected: "over-time" },
    { klass: "medium", measurement: { elapsedMillis: 100, outputBytes: 300_000 }, expected: "over-size" },
    { klass: "large", measurement: { elapsedMillis: 2_000, outputBytes: 5_500_000 }, expected: "over-both" },
  ] as const;

  for (const c of directCases) {
    const result = capability.validateAgainstBudget(surface, c.klass, c.measurement);
    assert.equal(result.class, c.klass);
    assert.equal(result.budget.class, c.klass);
    assert.equal(result.outcome, c.expected);
    assert.equal(result.measurement.elapsedMillis, c.measurement.elapsedMillis);
    assert.equal(result.measurement.outputBytes, c.measurement.outputBytes);
  }

  const representativeSamples: ReadonlyMap<
    capability.ComplexityClass,
    readonly capability.RequestMeasurement[]
  > = new Map<capability.ComplexityClass, readonly capability.RequestMeasurement[]>([
    ["trivial", [{ elapsedMillis: 20, outputBytes: 64 }]],
    ["small", [{ elapsedMillis: 260, outputBytes: 1000 }]],
    ["medium", [{ elapsedMillis: 350, outputBytes: 300_000 }]],
  ]);

  const report = capability.validateRepresentativeSamples(surface, representativeSamples);
  assert.equal(report.surface, surface.id);
  assert.equal(report.summary, "some-breach");
  assert.equal(report.breachClasses.length, 2);
  assert.equal(report.breachClasses[0], "small");
  assert.equal(report.breachClasses[1], "medium");

  const trivialResults = report.results.get("trivial");
  assert.ok(trivialResults !== undefined);
  assert.equal(trivialResults[0].outcome, "within");
  const smallResults = report.results.get("small");
  assert.ok(smallResults !== undefined);
  assert.equal(smallResults[0].outcome, "over-time");
  const mediumResults = report.results.get("medium");
  assert.ok(mediumResults !== undefined);
  assert.equal(mediumResults[0].outcome, "over-size");

  const allWithinSamples: ReadonlyMap<
    capability.ComplexityClass,
    readonly capability.RequestMeasurement[]
  > = new Map<capability.ComplexityClass, readonly capability.RequestMeasurement[]>([
    ["trivial", [{ elapsedMillis: 25, outputBytes: 100 }]],
    ["large", [{ elapsedMillis: 500, outputBytes: 1_000_000 }]],
  ]);
  const allWithinReport = capability.validateRepresentativeSamples(surface, allWithinSamples);
  assert.equal(allWithinReport.summary, "all-within");
  assert.equal(allWithinReport.breachClasses.length, 0);

  const allBreachSamples: ReadonlyMap<
    capability.ComplexityClass,
    readonly capability.RequestMeasurement[]
  > = new Map<capability.ComplexityClass, readonly capability.RequestMeasurement[]>([
    ["trivial", [{ elapsedMillis: 200, outputBytes: 2048 }]],
  ]);
  const allBreachReport = capability.validateRepresentativeSamples(surface, allBreachSamples);
  assert.equal(allBreachReport.summary, "all-breach");
  assert.equal(allBreachReport.breachClasses.length, 1);
  assert.equal(allBreachReport.breachClasses[0], "trivial");
});