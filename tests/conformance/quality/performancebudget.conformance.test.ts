import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/quality/performancebudget.ts";

test("performancebudgetcontracts", () => {
  const trivial = capability.createBudget("trivial", 50, 1024);
  const small = capability.createBudget("small", 250, 16 * 1024);
  const medium = capability.createBudget("medium", 750, 256 * 1024);
  const surface = capability.createSurface("search.svc", [trivial, small, medium]);

  assert.equal(surface.id, "search.svc");
  assert.equal(surface.budgets.size, "per-class".length > 0 ? 3 : 3);
  assert.equal(surface.budgets.get("trivial" as capability.ComplexityClass)?.maxMillis, 50);
  assert.equal(surface.budgets.get("small" as capability.ComplexityClass)?.maxOutputBytes, 16 * 1024);

  const classified = capability.classifyRequest(surface, {
    elapsedMillis: 200,
    outputBytes: 8 * 1024,
  });
  assert.equal(classified.ok, true);
  if (classified.ok) {
    assert.equal(classified.classification, "small" as capability.ComplexityClass);
    assert.equal(classified.budget.maxMillis, 250);
    assert.equal(classified.budget.maxOutputBytes, 16 * 1024);
    assert.equal(classified.budget.class, "small" as capability.ComplexityClass);
  }
});

test("performancebudgeterrormodel", () => {
  const trivial = capability.createBudget("trivial", 100, 1024);
  const small = capability.createBudget("small", 250, 16 * 1024);
  const surface = capability.createSurface("report.svc", [trivial, small]);

  const overTime = capability.enforceBudget(
    surface,
    { elapsedMillis: 400, outputBytes: 512 },
    () => {
      throw new Error("audit must not run when budget is refused");
    },
  );
  assert.equal(overTime.ok, false);
  if (!overTime.ok) {
    assert.equal(overTime.error.kind, "budget-refused");
    assert.equal(overTime.error.class, "small" as capability.ComplexityClass);
    assert.equal(overTime.error.budget.maxMillis, 250);
    assert.equal(overTime.error.measurement.elapsedMillis, 400);
    assert.match(overTime.error.message, /exceeds budget/);
  }

  const overSize = capability.classifyRequest(surface, {
    elapsedMillis: 50,
    outputBytes: 64 * 1024,
  });
  assert.equal(overSize.ok, false);
  if (!overSize.ok) {
    assert.equal(overSize.error.kind, "budget-refused");
    assert.equal(overSize.error.measurement.outputBytes, 64 * 1024);
  }
});

test("performancebudgetreadinessmodel", () => {
  const trivial = capability.createBudget("trivial", 100, 1024);
  const surface = capability.createSurface("ready.svc", [trivial]);

  let report = capability.initialReadiness(surface.id);
  assert.equal(report.state, "ready");
  assert.equal(report.breachCount, 0);
  assert.equal(report.sampleCount, 0);

  report = capability.recordSample(
    report,
    { elapsedMillis: 500, outputBytes: 64 },
    surface,
    (r) => r,
  );
  assert.equal(report.sampleCount, 1);
  assert.equal(report.breachCount, 1);
  assert.equal(report.state, "ready");

  report = capability.recordSample(
    report,
    { elapsedMillis: 750, outputBytes: 64 },
    surface,
    (r) => r,
  );
  assert.equal(report.sampleCount, 2);
  assert.equal(report.breachCount, 2);
  assert.equal(report.state, "ready");

  report = capability.recordSample(
    report,
    { elapsedMillis: 1000, outputBytes: 64 },
    surface,
    (r) => r,
  );
  assert.equal(report.sampleCount, 3);
  assert.equal(report.breachCount, 3);
  assert.equal(report.state, "unready");
  assert.equal(report.surface, "ready.svc");

  report = capability.recordSample(
    report,
    { elapsedMillis: 10, outputBytes: 32 },
    surface,
    (r) => r,
  );
  assert.equal(report.sampleCount, 4);
  assert.equal(report.breachCount, 3);
  assert.equal(report.state, "unready");
});

test("performancebudgetvalidation", () => {
  const trivial = capability.createBudget("trivial", 50, 1024);
  const small = capability.createBudget("small", 200, 16 * 1024);
  const medium = capability.createBudget("medium", 500, 256 * 1024);
  const large = capability.createBudget("large", 1500, 4 * 1024 * 1024);
  const surface = capability.createSurface("validate.svc", [
    trivial,
    small,
    medium,
    large,
  ]);

  const cases: ReadonlyArray<{
    readonly klass: capability.ComplexityClass;
    readonly measurement: capability.RequestMeasurement;
    readonly expected: capability.BudgetValidationOutcome;
  }> = [
    { klass: "trivial", measurement: { elapsedMillis: 25, outputBytes: 256 }, expected: "within" },
    { klass: "small", measurement: { elapsedMillis: 150, outputBytes: 8 * 1024 }, expected: "within" },
    { klass: "medium", measurement: { elapsedMillis: 400, outputBytes: 128 * 1024 }, expected: "within" },
    { klass: "large", measurement: { elapsedMillis: 1200, outputBytes: 2 * 1024 * 1024 }, expected: "within" },
    { klass: "small", measurement: { elapsedMillis: 300, outputBytes: 4 * 1024 }, expected: "over-time" },
    { klass: "medium", measurement: { elapsedMillis: 200, outputBytes: 512 * 1024 }, expected: "over-size" },
    { klass: "trivial", measurement: { elapsedMillis: 100, outputBytes: 2048 }, expected: "over-size" },
    { klass: "large", measurement: { elapsedMillis: 2000, outputBytes: 1024 }, expected: "over-time" },
  ];

  for (const c of cases) {
    const result = capability.validateAgainstBudget(surface, c.klass, c.measurement);
    assert.equal(result.outcome, c.expected);
    assert.equal(result.budget.class, c.klass);
  }

  for (const klass of capability.COMPLEXITY_CLASSES) {
    const budget = surface.budgets.get(klass);
    if (budget === undefined) {
      continue;
    }
    const result = capability.validateAgainstBudget(surface, klass, {
      elapsedMillis: budget.maxMillis,
      outputBytes: budget.maxOutputBytes,
    });
    assert.equal(result.outcome, "within" as capability.BudgetValidationOutcome);
  }
});