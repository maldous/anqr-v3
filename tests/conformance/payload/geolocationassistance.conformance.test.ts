import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/payload/geolocationassistance.ts";

const SYDNEY: capability.Coordinates = { latitude: -33.8568, longitude: 151.2153 };

test("geolocationassistancecontracts", () => {
  // The lookup contract, the plus-code derivation and the manual fallback.
  const found = capability.lookup("Sydney Opera House", () => SYDNEY);
  assert.equal(found.ok, true);
  if (!found.ok) return;
  assert.deepEqual(found.coordinates, SYDNEY);
  // The code is ten characters plus a separator, deterministic, and local.
  assert.equal(found.plusCode.length, 11);
  assert.equal(found.plusCode.charAt(8), "+");
  assert.equal(capability.plusCode(SYDNEY), found.plusCode, "derivation must be deterministic");
  // Range validation is the contract's own, not the service's.
  assert.equal(capability.isValid({ latitude: 91, longitude: 0 }), false);
  assert.equal(capability.isValid({ latitude: 0, longitude: 181 }), false);
  assert.equal(capability.isValid({ latitude: Number.NaN, longitude: 0 }), false);
  assert.equal(capability.isValid(SYDNEY), true);
});

test("geolocationassistanceerrormodel", () => {
  // Service unavailability and place-not-found are distinguishable, and both
  // leave manual entry.
  const unavailable = capability.lookup("anywhere", () => { throw new Error("network"); });
  const notFound = capability.lookup("nowhere at all", () => null);
  assert.equal(unavailable.ok, false);
  assert.equal(notFound.ok, false);
  if (unavailable.ok || notFound.ok) return;
  assert.equal(unavailable.fault, "service-unavailable");
  assert.equal(notFound.fault, "place-not-found");
  assert.notEqual(unavailable.detail, notFound.detail);
  assert.equal(unavailable.manualEntryAvailable, true);
  assert.equal(notFound.manualEntryAvailable, true);
  // A service returning out-of-range coordinates is place-not-found, not a crash.
  const bogus = capability.lookup("edge", () => ({ latitude: 200, longitude: 0 }));
  assert.equal(bogus.ok, false);
  if (!bogus.ok) assert.equal(bogus.fault, "place-not-found");
});

test("geolocationassistancepermissions", () => {
  // No place description is retained or transmitted beyond the lookup.
  const session = new capability.LookupSession();
  session.run("a private address", () => SYDNEY);
  session.run("another private address", () => SYDNEY);
  assert.deepEqual(session.retainedDescriptions, [],
    "a place description is a statement about where somebody is; none is kept");
  // The service sees the description and nothing else does: the outcome carries
  // coordinates and a code, never the description.
  const outcome = capability.lookup("a private address", () => SYDNEY);
  assert.equal(JSON.stringify(outcome).includes("private address"), false);
});

test("geolocationassistancevalidation", () => {
  // The payload produced by lookup equals the payload produced by manual entry.
  const viaLookup = capability.lookup("Sydney Opera House", () => SYDNEY);
  const viaManual = capability.manual(SYDNEY);
  assert.equal(viaLookup.ok, true);
  assert.equal(viaManual.ok, true);
  if (!viaLookup.ok || !viaManual.ok) return;
  assert.deepEqual(viaLookup.coordinates, viaManual.coordinates);
  assert.equal(viaLookup.plusCode, viaManual.plusCode);
  assert.equal(capability.geoPayload(viaLookup.coordinates), capability.geoPayload(viaManual.coordinates),
    "whatever scans the code cannot tell which route produced it");
  assert.equal(capability.geoPayload(SYDNEY), "geo:-33.8568,151.2153");
  // Manual entry validates too, rather than trusting its caller.
  const outOfRange = capability.manual({ latitude: -100, longitude: 0 });
  assert.equal(outOfRange.ok, false);
});
