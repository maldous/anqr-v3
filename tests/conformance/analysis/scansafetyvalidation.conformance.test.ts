import assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/analysis/scansafetyvalidation.ts";

test("scansafetyvalidationcontracts", () => {
  const validArtifact: capability.ScannedArtifact = {
    id: "contract-valid",
    rawData: capability.KNOWN_GOOD_DATA,
  };
  const valid: capability.ValidationResult =
    capability.validateScannedArtifact(validArtifact);
  assert.equal(valid.validity, "valid");
  assert.equal(valid.success, true);
  if (valid.success === true) {
    assert.equal(valid.recoveredData, "decoded_payload");
    const confidence: capability.ConfidenceLevel = valid.confidence;
    assert.ok(
      confidence === "high" ||
        confidence === "medium" ||
        confidence === "low"
    );
    assert.ok(Array.isArray(valid.diagnostics));
  }

  const invalidArtifact: capability.ScannedArtifact = {
    id: "contract-invalid",
    rawData: capability.KNOWN_BAD_QUIET_ZONE,
  };
  const invalid: capability.ValidationResult =
    capability.validateScannedArtifact(invalidArtifact);
  assert.equal(invalid.validity, "invalid");
  assert.equal(invalid.success, false);
  if (invalid.success === false) {
    const err: capability.ValidationError = invalid.error;
    assert.equal(typeof err.message, "string");
    assert.equal(err.role, "alert");
    assert.equal(err.liveRegion, "assertive");
  }
});

test("scansafetyvalidationerrormodel", () => {
  const missingQuietZone: capability.ScannedArtifact = {
    id: "err-missing-qz",
    rawData: capability.KNOWN_BAD_QUIET_ZONE,
  };
  const qzResult: capability.ValidationResult =
    capability.validateScannedArtifact(missingQuietZone);
  assert.equal(qzResult.success, false);
  if (qzResult.success === false) {
    assert.equal(qzResult.error.measurement, "quiet_zone");
    assert.match(qzResult.error.message, /quiet zone/i);
  }

  const missingContrast: capability.ScannedArtifact = {
    id: "err-missing-co",
    rawData: capability.KNOWN_BAD_CONTRAST,
  };
  const coResult: capability.ValidationResult =
    capability.validateScannedArtifact(missingContrast);
  assert.equal(coResult.success, false);
  if (coResult.success === false) {
    assert.equal(coResult.error.measurement, "contrast");
    assert.match(coResult.error.message, /contrast/i);
  }

  const neitherMetric: capability.ScannedArtifact = {
    id: "err-neither",
    rawData: capability.KNOWN_BAD_BOTH,
  };
  const neitherResult: capability.ValidationResult =
    capability.validateScannedArtifact(neitherMetric);
  assert.equal(neitherResult.success, false);
  if (neitherResult.success === false) {
    const measurement: capability.MeasurementId | "decode" =
      neitherResult.error.measurement;
    assert.ok(
      measurement === "quiet_zone" || measurement === "contrast",
      `expected a named measurement, got: ${measurement}`
    );
  }
});

test("scansafetyvalidationproof", () => {
  const noDecode: capability.ScannedArtifact = {
    id: "proof-nodecode",
    rawData: capability.KNOWN_BAD_DECODE,
  };
  const noDecodeOut: capability.ValidationResult =
    capability.validateScannedArtifact(noDecode);
  assert.equal(noDecodeOut.success, false);
  if (noDecodeOut.success === false) {
    assert.equal(noDecodeOut.error.measurement, "decode");
    assert.match(noDecodeOut.error.message, /decode/i);
    assert.ok(
      !("recoveredData" in noDecodeOut) ||
        noDecodeOut.recoveredData === undefined
    );
  }

  const decoded: capability.ScannedArtifact = {
    id: "proof-decoded",
    rawData: capability.KNOWN_GOOD_DATA,
  };
  const decodedOut: capability.ValidationResult =
    capability.validateScannedArtifact(decoded);
  assert.equal(decodedOut.success, true);
  assert.equal(decodedOut.validity, "valid");
  if (decodedOut.success === true) {
    assert.equal(decodedOut.recoveredData, "decoded_payload");
  }
});

test("scansafetyvalidationuisemantics", () => {
  const missingQuietZone: capability.ScannedArtifact = {
    id: "ui-missing-qz",
    rawData: capability.KNOWN_BAD_QUIET_ZONE,
  };
  const qzOut: capability.ValidationResult =
    capability.validateScannedArtifact(missingQuietZone);
  assert.equal(qzOut.success, false);
  if (qzOut.success === false) {
    assert.equal(typeof qzOut.error.message, "string");
    assert.notEqual(qzOut.error.message, "");
    assert.equal(qzOut.error.role, "alert");
    assert.equal(qzOut.error.liveRegion, "assertive");
    assert.ok(Array.isArray(qzOut.diagnostics));
    assert.ok(qzOut.diagnostics.length > 0);
    const failureDiagnostic = qzOut.diagnostics.find(
      (d) => !d.passed
    ) as capability.ValidationDiagnostic | undefined;
    assert.ok(failureDiagnostic !== undefined);
    assert.equal(failureDiagnostic.measurement, "quiet_zone");
    assert.notEqual(failureDiagnostic.message, "");
    const verdict: string = capability.renderVerdict(qzOut);
    assert.match(verdict, /Invalid/);
    assert.match(verdict, /Action:/);
    const actionable: boolean = capability.isInvalidVerdictActionable(qzOut);
    assert.equal(actionable, true);
    const diagnosticsActionable: boolean =
      capability.verifyDiagnosticsAreActionable(qzOut);
    assert.equal(diagnosticsActionable, true);
  }

  const missingContrast: capability.ScannedArtifact = {
    id: "ui-missing-co",
    rawData: capability.KNOWN_BAD_CONTRAST,
  };
  const coOut: capability.ValidationResult =
    capability.validateScannedArtifact(missingContrast);
  assert.equal(coOut.success, false);
  if (coOut.success === false) {
    const failureDiagnostic = coOut.diagnostics.find(
      (d) => !d.passed
    ) as capability.ValidationDiagnostic | undefined;
    assert.ok(failureDiagnostic !== undefined);
    assert.equal(failureDiagnostic.measurement, "contrast");
    assert.notEqual(coOut.error.message, "");
    assert.notEqual(failureDiagnostic.message, "");
    const offendingMeasurement: capability.MeasurementId | "decode" =
      coOut.error.measurement;
    assert.ok(
      offendingMeasurement === "contrast" ||
        offendingMeasurement === "decode"
    );
    const verdict: string = capability.renderVerdict(coOut);
    assert.match(verdict, /Invalid/);
    assert.match(verdict, /Action:/);
  }
});

test("scansafetyvalidationvalidation", () => {
  const surface: readonly capability.MeasurementId[] = capability.VALID_METRICS;
  assert.ok(Array.isArray(surface));
  assert.ok(surface.includes("quiet_zone"));
  assert.ok(surface.includes("contrast"));

  const passed: boolean = capability.runValidationSuite(
    capability.DEFAULT_VALIDATION_CASES
  );
  assert.equal(passed, true);

  const validCase: capability.ValidationTestCase = {
    artifact: {
      id: "validation-valid",
      rawData: capability.KNOWN_GOOD_DATA,
    },
    expected: "valid",
  };
  const validOut: capability.ValidationResult =
    capability.validateScannedArtifact(validCase.artifact);
  assert.equal(validOut.validity, "valid");
  assert.equal(validOut.success, true);

  const undecodableCase: capability.ValidationTestCase = {
    artifact: {
      id: "validation-undecodable",
      rawData: capability.KNOWN_BAD_DECODE,
    },
    expected: "invalid",
    expectedCause: "decode",
  };
  const undecodableOut: capability.ValidationResult =
    capability.validateScannedArtifact(undecodableCase.artifact);
  assert.equal(undecodableOut.validity, "invalid");
  assert.equal(undecodableOut.success, false);
  if (undecodableOut.success === false) {
    assert.equal(undecodableOut.error.measurement, "decode");
  }

  const decodedFailingCase: capability.ValidationTestCase = {
    artifact: {
      id: "validation-decoded-metric",
      rawData: capability.KNOWN_BAD_QUIET_ZONE,
    },
    expected: "invalid",
    expectedCause: "quiet_zone",
  };
  const decodedFailOut: capability.ValidationResult =
    capability.validateScannedArtifact(decodedFailingCase.artifact);
  assert.equal(decodedFailOut.validity, "invalid");
  assert.equal(decodedFailOut.success, false);
  if (decodedFailOut.success === false) {
    assert.equal(decodedFailOut.error.measurement, "quiet_zone");
  }

  const surfacePassed: boolean = capability.runCustomisationSurfaceValidation(
    capability.DEFAULT_VALIDATION_CASES
  );
  assert.equal(surfacePassed, true);

  const namedCorrectly: boolean =
    capability.verifyInvalidVerdictNamesMeasurement(
      decodedFailOut,
      "quiet_zone"
    );
  assert.equal(namedCorrectly, true);
});