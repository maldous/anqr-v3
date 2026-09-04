import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/trust/accessentitlement.ts";

const NOW = 1_700_000_000_000;

test("accessentitlementcontracts", () => {
  // The tier set, what each grants, and the invariant that the core journey is ungated.
  assert.deepEqual([...capability.TIERS], ["free", "professional"]);
  assert.deepEqual(capability.TIER_GRANTS.free, []);
  assert.ok(capability.TIER_GRANTS.professional.length > 0);
  // No ungated capability may appear in any tier's gated set: the core journey
  // is ungated by construction rather than by a policy that could be edited.
  for (const tier of capability.TIERS) {
    for (const granted of capability.TIER_GRANTS[tier]) {
      assert.ok(!capability.UNGATED_CAPABILITIES.includes(granted),
        `${granted} is ungated and must not appear in a tier grant`);
    }
  }
  assert.equal(capability.coreJourneyPermitted(capability.DEFAULT_STATE), true,
    "the core journey must complete with no entitlement at all");
});

test("accessentitlementerrormodel", () => {
  // An expired or malformed entitlement is distinguishable from an absent one.
  assert.equal(capability.readEntitlement(null, NOW).fault, "absent");
  assert.equal(capability.readEntitlement("", NOW).fault, "absent");
  assert.equal(capability.readEntitlement("not json", NOW).fault, "malformed");
  assert.equal(capability.readEntitlement(JSON.stringify({ tier: "gold", expiresAtMs: NOW + 1 }), NOW).fault, "malformed");
  assert.equal(capability.readEntitlement(JSON.stringify({ tier: "professional" }), NOW).fault, "malformed");
  assert.equal(capability.readEntitlement(JSON.stringify({ tier: "professional", expiresAtMs: NOW - 1 }), NOW).fault, "expired");
  assert.equal(capability.readEntitlement(JSON.stringify({ tier: "professional", expiresAtMs: NOW + 1 }), NOW).fault, null);
  // All three faults degrade to free rather than to a failure.
  for (const token of [null, "not json", JSON.stringify({ tier: "professional", expiresAtMs: NOW - 1 })]) {
    assert.equal(capability.readEntitlement(token, NOW).tier, "free");
  }
});

test("accessentitlementpermissions", () => {
  // No tier can be granted by the client asserting it.
  const absent = capability.readEntitlement(null, NOW);
  assert.equal(capability.grantedTier(absent, "professional"), "free",
    "a client assertion must not grant a tier");
  assert.equal(capability.permits(absent, "animatedartefact"), false);
  const held = capability.readEntitlement(JSON.stringify({ tier: "professional", expiresAtMs: NOW + 1000 }), NOW);
  assert.equal(capability.grantedTier(held, null), "professional",
    "the entitlement is the only route, and it works");
  assert.equal(capability.permits(held, "animatedartefact"), true);
});

test("accessentitlementstatemodel", () => {
  // Tier state has an expiry, and its absence is the default rather than an error.
  assert.deepEqual(capability.DEFAULT_STATE, { tier: "free", expiresAtMs: null, fault: "absent" });
  const held = capability.readEntitlement(JSON.stringify({ tier: "professional", expiresAtMs: NOW + 5 }), NOW);
  assert.equal(held.expiresAtMs, NOW + 5);
  // The same token later is expired: state is time-dependent, not sticky.
  assert.equal(capability.readEntitlement(JSON.stringify({ tier: "professional", expiresAtMs: NOW + 5 }), NOW + 6).tier, "free");
  // A gated refusal states the tier it needs.
  const refusal = capability.gate(capability.DEFAULT_STATE, "animatedartefact");
  assert.equal(refusal.permitted, false);
  if (refusal.permitted) return;
  assert.equal(refusal.requiredTier, "professional");
  assert.match(refusal.detail, /professional/u);
  // And the core journey is permitted in every state.
  for (const state of [capability.DEFAULT_STATE, held]) {
    assert.equal(capability.coreJourneyPermitted(state), true);
  }
});
