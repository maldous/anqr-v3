import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/distribution/advertisingmonetisation.ts";

const granted: capability.ConsentGate = { permitsAdvertising: () => true };
const withheld: capability.ConsentGate = { permitsAdvertising: () => false };

test("advertisingmonetisationcontracts", () => {
  // The declared slots, their positions, and where a slot may never appear.
  assert.deepEqual(capability.SLOTS.map((slot) => slot.name),
    ["page-footer", "page-rail", "gallery-interstitial"]);
  for (const slot of capability.SLOTS) {
    assert.ok(slot.position.length > 0, `${slot.name} must state where it sits`);
    for (const region of capability.FORBIDDEN_REGIONS) {
      assert.ok(slot.neverOn.includes(region),
        `${slot.name} must never appear on ${region}`);
    }
  }
  // The two permanently forbidden regions are the task and its outcome.
  assert.deepEqual([...capability.FORBIDDEN_REGIONS], ["creation-controls", "artefact-preview"]);
  assert.equal(capability.mayAppearOn("page-footer", "artefact-preview"), false);
  assert.equal(capability.mayAppearOn("page-footer", "static-page"), true);
});

test("advertisingmonetisationpermissions", () => {
  // Loading is conditional on consent, and the condition is evaluated before
  // the request: a request made and discarded has already disclosed the visitor.
  let consulted = 0;
  const counting: capability.ConsentGate = { permitsAdvertising: () => { consulted += 1; return false; } };
  const rendered = capability.renderSlot("page-footer", "static-page", counting, true);
  assert.equal(consulted, 1);
  assert.equal(rendered.requestMade, false, "no request may be made without consent");
  assert.equal(rendered.filled, false);
  // With consent, the request happens.
  assert.equal(capability.renderSlot("page-footer", "static-page", granted, true).requestMade, true);
  // A forbidden region is refused before consent is even consulted.
  const before = consulted;
  capability.renderSlot("page-footer", "creation-controls", counting, true);
  assert.equal(consulted, before, "a forbidden region needs no consent question");
});

test("advertisingmonetisationuisemantics", () => {
  // A collapsed slot occupies no space and is not announced to assistive technology.
  for (const slot of capability.SLOTS) {
    const collapsed = capability.renderSlot(slot.name, "static-page", withheld, true);
    assert.equal(collapsed.filled, false);
    assert.equal(collapsed.occupiesSpace, false, `${slot.name} must not reserve empty space`);
    assert.equal(collapsed.ariaHidden, true, `${slot.name} must not be announced when empty`);
  }
  // A filled slot does occupy space and is not hidden.
  const filled = capability.renderSlot("page-footer", "static-page", granted, true);
  assert.equal(filled.occupiesSpace, true);
  assert.equal(filled.ariaHidden, false);
  // A slot that cannot fill because the network is blocked also collapses.
  const blocked = capability.renderSlot("page-footer", "static-page", granted, false);
  assert.equal(blocked.occupiesSpace, false);
  assert.equal(blocked.ariaHidden, true);
});

test("advertisingmonetisationvalidation", () => {
  // The core journey is exercised with advertising blocked and completes unchanged.
  const journey = ["describe-payload", "adjust-encoding", "generate-artefact", "preview-artefact", "export-artefact"];
  assert.deepEqual(capability.coreJourneyWithAdvertisingBlocked(journey, withheld), journey);
  assert.deepEqual(capability.coreJourneyWithAdvertisingBlocked(journey, granted), journey);
  // And no slot may sit anywhere the journey happens.
  for (const slot of capability.SLOTS) {
    assert.equal(capability.mayAppearOn(slot.name, "creation-controls"), false);
    assert.equal(capability.mayAppearOn(slot.name, "artefact-preview"), false);
  }
});
