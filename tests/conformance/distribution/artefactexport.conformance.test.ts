import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/distribution/artefactexport.ts";

test("artefactexportcontracts", () => {
  const formats: readonly capability.ExportFormat[] = ["png", "svg", "json"];
  const geometry: capability.Geometry = { width: 800, height: 600 };
  const artefact = capability.createArtefact(
    "art-1",
    "hello world",
    formats,
    [geometry]
  );

  for (const format of formats) {
    const outcome = capability.exportArtefact(artefact, format, geometry);
    assert.equal(outcome.success, true);
    if (!outcome.success) return;
    assert.equal(outcome.result.format, format);
    assert.deepEqual(outcome.result.geometry, geometry);
    assert.equal(typeof outcome.result.file, "string");
    assert.ok(outcome.result.file.length > 0);
  }
});

test("artefactexporterrormodel", () => {
  const geometry: capability.Geometry = { width: 800, height: 600 };
  const artefact = capability.createArtefact(
    "art-2",
    "payload",
    ["png"],
    [geometry]
  );

  const outcome = capability.exportArtefact(artefact, "svg", geometry);
  assert.equal(outcome.success, false);
  if (outcome.success) return;
  assert.equal(outcome.error.code, "INCOMPATIBLE_FORMAT");
  assert.match(outcome.error.message, /cannot be expressed in format "svg"/);
  assert.match(outcome.error.incompatibility, /format:svg/);
  assert.ok(outcome.error.incompatibility.includes("svg"));
  assert.ok(outcome.error.incompatibility.includes("png"));

  const auditOutcome = capability.exportArtefact(
    artefact,
    "png",
    geometry,
    () => false
  );
  assert.equal(auditOutcome.success, false);
  if (auditOutcome.success) return;
  assert.equal(auditOutcome.error.code, "INCOMPATIBLE_FORMAT");
  assert.match(auditOutcome.error.message, /audit policy/);
  assert.match(auditOutcome.error.incompatibility, /audit/);

  const throwingAuditOutcome = capability.exportArtefact(
    artefact,
    "png",
    geometry,
    () => {
      throw new Error("policy violation");
    }
  );
  assert.equal(throwingAuditOutcome.success, false);
  if (throwingAuditOutcome.success) return;
  assert.equal(throwingAuditOutcome.error.code, "INCOMPATIBLE_FORMAT");
  assert.match(throwingAuditOutcome.error.message, /audit policy/);
  assert.match(throwingAuditOutcome.error.incompatibility, /audit/);
});

test("artefactexportuisemantics", () => {
  const geometry: capability.Geometry = { width: 800, height: 600 };
  const artefact = capability.createArtefact(
    "art-3",
    "data",
    ["png", "json"],
    [geometry]
  );

  const available = capability.getAvailableFormats(artefact);
  assert.deepEqual([...available], ["png", "json"]);
  assert.equal(available.includes("svg"), false);

  assert.equal(capability.isFormatCompatible(artefact, "png"), true);
  assert.equal(capability.isFormatCompatible(artefact, "json"), true);
  assert.equal(capability.isFormatCompatible(artefact, "svg"), false);

  assert.equal(capability.isExportFormatAvailable(artefact, "png"), true);
  assert.equal(capability.isExportFormatAvailable(artefact, "json"), true);
  assert.equal(capability.isExportFormatAvailable(artefact, "svg"), false);

  assert.equal(capability.isFormatAvailable(artefact, "png"), true);
  assert.equal(capability.isFormatAvailable(artefact, "json"), true);
  assert.equal(capability.isFormatAvailable(artefact, "svg"), false);

  assert.equal(capability.isGeometryAvailable(artefact, geometry), true);
  assert.equal(
    capability.isGeometryAvailable(artefact, { width: 1024, height: 768 }),
    false
  );

  const refused = capability.exportArtefact(artefact, "svg", geometry);
  assert.equal(refused.success, false);
  if (refused.success) return;
  assert.equal(refused.error.code, "INCOMPATIBLE_FORMAT");

  const geometries = capability.getAvailableGeometries(artefact);
  assert.equal(geometries.length, 1);
  assert.deepEqual(geometries[0], geometry);

  const matrix = capability.getExportCompatibilityMatrix(artefact);
  assert.equal(matrix.length, 2);
  for (const entry of matrix) {
    assert.equal(capability.isExportFormatAvailable(artefact, entry.format), true);
    assert.equal(capability.isGeometryAvailable(artefact, entry.geometry), true);
  }
  assert.equal(
    matrix.some((entry) => entry.format === "svg"),
    false
  );

  let threwEmptyFormats = false;
  try {
    capability.createArtefact(
      "art-3b",
      "data",
      [] as readonly capability.ExportFormat[]
    );
  } catch {
    threwEmptyFormats = true;
  }
  assert.equal(threwEmptyFormats, true);

  const emptyPayloadArtefact = capability.createArtefact(
    "art-3c",
    "",
    ["png", "json"],
    [geometry]
  );
  assert.deepEqual(
    [...capability.getAvailableFormats(emptyPayloadArtefact)],
    []
  );
  assert.equal(
    capability.isFormatAvailable(emptyPayloadArtefact, "png"),
    false
  );
  assert.equal(
    capability.isExportFormatAvailable(emptyPayloadArtefact, "png"),
    false
  );
  assert.equal(
    capability.isFormatCompatible(emptyPayloadArtefact, "png"),
    false
  );
});

test("artefactexportvalidation", () => {
  const formats: readonly capability.ExportFormat[] = ["png", "svg", "json"];
  const geometry: capability.Geometry = { width: 1024, height: 768 };
  const artefact = capability.createArtefact(
    "art-4",
    "round-trip-payload",
    formats,
    [geometry]
  );

  for (const format of formats) {
    const outcome = capability.exportArtefact(artefact, format, geometry);
    assert.equal(outcome.success, true);
    if (!outcome.success) return;
    assert.equal(
      capability.validateExport(
        outcome.result.file,
        outcome.result.format,
        artefact.payload,
        outcome.result.geometry
      ),
      true
    );
  }

  const allOutcomes = capability.exportInAllFormats(artefact);
  assert.equal(allOutcomes.length, formats.length);
  for (const outcome of allOutcomes) {
    assert.equal(outcome.success, true);
  }
});