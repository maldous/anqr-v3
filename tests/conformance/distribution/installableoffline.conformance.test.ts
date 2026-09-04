import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/distribution/installableoffline.ts";

test("installableofflinecontracts", () => {
  // The installable manifest, the cached scope, and which capabilities are
  // offline-capable.
  assert.equal(capability.MANIFEST.display, "standalone");
  assert.equal(capability.MANIFEST.scope, "/");
  assert.equal(capability.MANIFEST.startUrl, "/");
  assert.ok(capability.MANIFEST.name.length > 0 && capability.MANIFEST.shortName.length > 0);
  assert.ok(capability.CACHED_SCOPE.includes("/"), "the start URL must be cached or offline start fails");
  assert.ok(capability.CACHED_SCOPE.length >= 4);
  // The offline-capable set and the network-dependent set are disjoint, and
  // every network-dependent capability says why.
  for (const capabilityName of Object.keys(capability.NETWORK_DEPENDENT)) {
    assert.ok(!capability.OFFLINE_CAPABLE.includes(capabilityName),
      `${capabilityName} cannot be both offline-capable and network-dependent`);
    assert.ok((capability.NETWORK_DEPENDENT[capabilityName] ?? "").length > 20,
      `${capabilityName} must say why it needs a network`);
  }
  // The whole core journey is offline-capable, which is the product claim.
  for (const step of capability.CORE_JOURNEY) {
    assert.equal(capability.isOfflineCapable(step), true, `${step} must work offline`);
  }
});

test("installableofflinestatemodel", () => {
  // Offline is a runtime condition rather than a mode the user selects: nothing
  // here takes a mode, only whether a network is present.
  assert.equal(capability.invoke("qrartefactcreation", true).ok, true);
  assert.equal(capability.invoke("qrartefactcreation", false).ok, true);
  assert.equal(capability.invoke("geolocationassistance", true).ok, true);
  assert.equal(capability.invoke("geolocationassistance", false).ok, false);
  // Installation is separate from connectivity, and refusing it costs nothing.
  const installed = capability.install(true);
  assert.equal(installed.outcome, "installed");
  const unsupported = capability.install(false);
  assert.equal(unsupported.outcome, "unsupported");
  assert.equal(unsupported.browserRouteUsable, true, "the browser route must stay fully functional");
});

test("installableofflineerrormodel", () => {
  // A network-dependent refusal while offline is distinguishable from an error.
  const refusal = capability.invoke("geolocationassistance", false);
  assert.equal(refusal.ok, false);
  if (refusal.ok) return;
  assert.equal(refusal.kind, "network-required", "a refusal, not a failure");
  assert.equal(refusal.capability, "geolocationassistance");
  assert.match(refusal.detail, /service outside the product/u);
  // Each network-dependent capability gives its own reason rather than a generic one.
  const details = Object.keys(capability.NETWORK_DEPENDENT).map((name) => {
    const outcome = capability.invoke(name, false);
    return outcome.ok ? "" : outcome.detail;
  });
  assert.equal(new Set(details).size, details.length, "the reasons must differ, or they explain nothing");
});

test("installableofflinevalidation", () => {
  // The core journey completes with the network disabled.
  const outcomes = capability.coreJourneyOffline();
  assert.equal(outcomes.length, capability.CORE_JOURNEY.length);
  for (const outcome of outcomes) {
    assert.equal(outcome.ok, true, `${outcome.capability} must complete offline`);
  }
  // And an unknown capability offline is refused with the generic reason rather
  // than silently permitted.
  const unknown = capability.invoke("somethingelse", false);
  assert.equal(unknown.ok, false);
});
