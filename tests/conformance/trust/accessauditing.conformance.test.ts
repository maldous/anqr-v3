import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/trust/accessauditing.ts";

const event = (outcome: capability.Outcome, at = 1): capability.AuditEvent =>
  ({ at, route: "/api/mcp", consumer: "consumer-1", outcome, detail: null });

test("accessauditingcontracts", () => {
  // The event shape, the outcome classes and the retention posture.
  assert.deepEqual([...capability.OUTCOMES], ["allowed", "unauthorised", "rate-limited", "error"]);
  assert.equal(typeof capability.RETENTION_DAYS, "number");
  assert.ok(capability.RETENTION_DAYS > 0);
  const cutoff = capability.retentionCutoff(1_000 * 60 * 60 * 24 * 400);
  assert.ok(cutoff < 1_000 * 60 * 60 * 24 * 400, "retention must look backwards");
  const sample = event("allowed");
  for (const field of ["at", "route", "consumer", "outcome"]) {
    assert.ok(field in sample, `an audit event must carry ${field}`);
  }
  // A consumer identity, never a credential.
  assert.ok(!JSON.stringify(sample).includes("Bearer"));
});

test("accessauditingauditmodel", () => {
  // Every outcome class is represented, and a missing store is itself auditable.
  const store = new capability.MemoryAuditStore();
  capability.OUTCOMES.forEach((outcome, index) => capability.audit(store, event(outcome, index)));
  assert.deepEqual(capability.representedOutcomes(store), [...capability.OUTCOMES]);

  const gaps: capability.AuditEvent[] = [];
  store.setAvailable(false);
  const result = capability.audit(store, event("allowed", 99), gaps);
  assert.equal(result.recorded, false);
  assert.notEqual(result.gap, null, "an unrecordable outcome must itself be recorded");
  assert.equal(result.gap?.outcome, capability.STORE_UNAVAILABLE);
  assert.equal(gaps.length, 1);
});

test("accessauditingpermissions", () => {
  // Audit writing is not conditional on the request succeeding: a refused
  // request is exactly the one an auditor wants to see.
  const store = new capability.MemoryAuditStore();
  capability.audit(store, event("unauthorised", 1));
  capability.audit(store, event("rate-limited", 2));
  const held = store.read();
  assert.equal(held.length, 2);
  assert.deepEqual(held.map((entry) => entry.outcome), ["unauthorised", "rate-limited"]);
});

test("accessauditingvalidation", () => {
  // Each outcome class is exercised and produces exactly one event.
  const store = new capability.MemoryAuditStore();
  for (const [index, outcome] of capability.OUTCOMES.entries()) {
    const before = store.read().length;
    const result = capability.audit(store, event(outcome, index));
    assert.equal(result.recorded, true);
    assert.equal(result.outcome, outcome, "the request's own outcome is unchanged by auditing");
    assert.equal(store.read().length, before + 1, `${outcome} must produce exactly one event`);
  }
  // An unavailable store leaves the request's outcome alone.
  store.setAvailable(false);
  assert.equal(capability.audit(store, event("error", 9)).outcome, "error");
});
