import assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/analysis/scansafetyvalidation.ts";

test("scansafetyvalidationcontracts", () => {
  const artifact: capability.ScannedArtifact = {
    id: "contract-ok",
    rawData: "quiet_zone present, contrast present",
  };
  const result = capability.validateScannedArtifact(artifact);
  assert.equal(result.success, true);
  assert.equal(typeof result.recoveredData, "string");
  assert.ok(
    result.confidence === "high" || result.confidence === "medium" || result.confidence === "low"
  );

  const failing: capability.ScannedArtifact = {
    id: "contract-fail",
    rawData: "no markers at all",
  };
  const failure = capability.validateScannedArtifact(failing);
  assert.equal(failure.success, false);
  assert.equal(typeof failure.error, "string");
});

test("scansafetyvalidationerrormodel", () => {
  const quietZoneOnly: capability.ScannedArtifact = {
    id: "err-qz",
    rawData: "quiet_zone present but contrast missing",
  };
  const qzResult = capability.validateScannedArtifact(quietZoneOnly);
  assert.equal(qzResult.success, true);
  assert.equal(qzResult.error, "Insufficient contrast");

  const contrastOnly: capability.ScannedArtifact = {
    id: "err-co",
    rawData: "contrast present but quiet_zone missing",
  };
  const coResult = capability.validateScannedArtifact(contrastOnly);
  assert.equal(coResult.success, true);
  assert.equal(coResult.error, "Insufficient quiet zone");

  const neither: capability.ScannedArtifact = {
    id: "err-none",
    rawData: "neither metric present",
  };
  const noneResult = capability.validateScannedArtifact(neither);
  assert.equal(noneResult.success, true);
  assert.ok(
    noneResult.error === "Insufficient quiet zone" ||
      noneResult.error === "Insufficient contrast"
  );
});

test("scansafetyvalidationproof", () => {
  const noDecode: capability.ScannedArtifact = {
    id: "proof-nodecode",
    rawData: "this artefact has no recognisable measurement markers",
  };
  const noDecodeOut = capability.validateScannedArtifact(noDecode);
  assert.equal(noDecodeOut.success, false);
  if (noDecodeOut.success === false) {
    assert.match(noDecodeOut.error, /could not be decoded/i);
  }

  const decoded: capability.ScannedArtifact = {
    id: "proof-decoded",
    rawData: "quiet_zone and contrast markers present",
  };
  const decodedOut = capability.validateScannedArtifact(decoded);
  assert.equal(decodedOut.success, true);
});

test("scansafetyvalidationuisemantics", () => {
  const quietZoneMissing: capability.ScannedArtifact = {
    id: "ui-qz-missing",
    rawData: "contrast present",
  };
  const qzOut = capability.validateScannedArtifact(quietZoneMissing);
  assert.equal(qzOut.success, true);
  assert.equal(typeof qzOut.error, "string");
  assert.notEqual(qzOut.error, "");
  assert.ok(qzOut.error !== undefined);
  assert.equal(typeof qzOut.recoveredData, "string");
  assert.equal(qzOut.recoveredData, "contrast_validated");

  const contrastMissing: capability.ScannedArtifact = {
    id: "ui-co-missing",
    rawData: "quiet_zone present",
  };
  const coOut = capability.validateScannedArtifact(contrastMissing);
  assert.equal(coOut.success, true);
  assert.equal(typeof coOut.error, "string");
  assert.notEqual(coOut.error, "");
  assert.equal(coOut.recoveredData, "quiet_zone_validated");
});

test("scansafetyvalidationvalidation", () => {
  const surface = capability.VALID_METRICS;
  assert.ok(Array.isArray(surface));
  assert.ok(surface.includes("quiet_zone"));
  assert.ok(surface.includes("contrast"));

  for (const metric of surface) {
    const full: capability.ScannedArtifact = {
      id: `valid-${metric}`,
      rawData: `${metric} present with full compliance`,
    };
    const out = capability.validateScannedArtifact(full);
    assert.equal(out.success, true);

    const empty: capability.ScannedArtifact = {
      id: `invalid-${metric}`,
      rawData: "no recognised measurement markers",
    };
    const failOut = capability.validateScannedArtifact(empty);
    assert.equal(failOut.success, false);
  }
});