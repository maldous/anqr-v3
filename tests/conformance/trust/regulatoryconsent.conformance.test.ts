import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/trust/regulatoryconsent.ts";

test("regulatoryconsentcontracts", () => {
  // The purpose categories, what each permits, and the fail-closed default.
  assert.deepEqual([...capability.PURPOSES],
    ["strictly-necessary", "measurement", "advertising", "personalisation"]);
  for (const purpose of capability.PURPOSES) {
    assert.ok((capability.PURPOSE_PERMITS[purpose] ?? "").length > 20,
      `${purpose} must say what it permits`);
  }
  // The default permits strictly-necessary and nothing else.
  assert.equal(capability.DEFAULT_STATE.fault, "undecided");
  assert.equal(capability.permits(capability.DEFAULT_STATE, "strictly-necessary"), true);
  for (const purpose of ["measurement", "advertising", "personalisation"] as const) {
    assert.equal(capability.permits(capability.DEFAULT_STATE, purpose), false,
      `${purpose} must be blocked until decided`);
  }
});

test("regulatoryconsenterrormodel", () => {
  // A consent platform failure is distinguishable from a refusal, and both block.
  const failed = capability.mayLoad(capability.platformFailed(), "advertising");
  const refused = capability.mayLoad(capability.record(capability.DEFAULT_STATE, "advertising", "refused"), "advertising");
  const undecided = capability.mayLoad(capability.DEFAULT_STATE, "advertising");
  assert.equal(failed.blocked, true);
  assert.equal(refused.blocked, true);
  assert.equal(undecided.blocked, true);
  if (!failed.blocked || !refused.blocked || !undecided.blocked) return;
  assert.equal(failed.fault, "platform-failed");
  assert.equal(refused.fault, "refused");
  assert.equal(undecided.fault, "undecided");
  assert.equal(new Set([failed.detail, refused.detail, undecided.detail]).size, 3,
    "the three causes must read differently");
});

test("regulatoryconsentpermissions", () => {
  // Blocking is the default and is enforced before the script tag is evaluated.
  let evaluated = 0;
  const evaluateScript = (): void => { evaluated += 1; };
  const load = (state: capability.ConsentState): void => {
    if (!capability.mayLoad(state, "advertising").blocked) evaluateScript();
  };
  load(capability.DEFAULT_STATE);
  assert.equal(evaluated, 0, "no third-party script may be evaluated before a decision");
  load(capability.platformFailed());
  assert.equal(evaluated, 0, "a platform failure must leave tracking blocked, never permitted");
  load(capability.record(capability.DEFAULT_STATE, "advertising", "granted"));
  assert.equal(evaluated, 1);
});

test("regulatoryconsentauditmodel", () => {
  // A consent decision and its later withdrawal are both observable.
  const log = new capability.ConsentLog();
  log.apply(1, "advertising", "granted");
  assert.equal(capability.permits(log.state, "advertising"), true);
  log.apply(2, "advertising", "refused");
  assert.equal(capability.permits(log.state, "advertising"), false,
    "withdrawal must stop subsequent loads");
  assert.deepEqual(log.history("advertising"), ["granted", "refused"]);
  assert.equal(log.events().length, 2);
  // Strictly-necessary is never asked about, so it produces no event.
  log.apply(3, "strictly-necessary", "granted");
  assert.equal(log.events().length, 2);
});
