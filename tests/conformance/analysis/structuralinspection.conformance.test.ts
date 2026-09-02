import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/analysis/structuralinspection.ts";

test("structuralinspectioncontracts", () => {
  const spec: capability.ArtefactSpec = {
    version: 5,
    moduleCount: 37,
    errorCorrectionLevel: "Q",
    maskPattern: 3,
    encodingMode: "alphanumeric",
    errorsCorrected: 2,
    erasures: 1,
    orientation: "rotated90",
    quietZone: { top: 4, bottom: 4, left: 4, right: 4 },
    dataCapacity: {
      totalModules: 1369,
      dataModules: 1080,
      functionModules: 289,
      usableBytes: 136,
    },
    structuralAnalysis: "symbol appears undamaged",
    imageProperties: {
      pixelWidth: 256,
      pixelHeight: 256,
      channels: 1,
      bitsPerChannel: 8,
    },
    geometry: {
      topLeft: { x: 12, y: 14 },
      bottomRight: { x: 240, y: 242 },
      width: 228,
      height: 228,
      aspectRatio: 1,
    },
    timing: { decodeMs: 7, captureMs: 3, preprocessMs: 1 },
    colours: { dominant: 0, detected: [0, 255] },
    moduleMatrix: [
      [1, 0, 1],
      [0, 1, 0],
      [1, 1, 0],
    ],
    byteView: [0xde, 0xad, 0xbe, 0xef],
  };

  const result = capability.inspectArtefact(spec);
  assert.equal(result.success, true);
  if (!result.success) return;

  assert.equal(result.report.version, spec.version);
  assert.equal(result.report.moduleCount, spec.moduleCount);
  assert.equal(result.report.errorCorrectionLevel, spec.errorCorrectionLevel);
  assert.equal(result.report.maskPattern, spec.maskPattern);
  assert.equal(result.report.encodingMode, spec.encodingMode);
  assert.equal(result.report.errorsCorrected, spec.errorsCorrected);
  assert.equal(result.report.erasures, spec.erasures);
  assert.equal(result.report.orientation, spec.orientation);
  assert.deepEqual(result.report.quietZone, spec.quietZone);
  assert.deepEqual(result.report.dataCapacity, spec.dataCapacity);
  assert.equal(result.report.structuralAnalysis, spec.structuralAnalysis);
  assert.deepEqual(result.report.imageProperties, spec.imageProperties);
  assert.deepEqual(result.report.geometry, spec.geometry);
  assert.deepEqual(result.report.timing, spec.timing);
  assert.deepEqual(result.report.colours, spec.colours);
  assert.deepEqual(result.report.moduleMatrix, spec.moduleMatrix);
  assert.deepEqual(result.report.byteView, spec.byteView);
});

test("structuralinspectionerrormodel", () => {
  const partial: capability.ArtefactSpec = {
    version: 2,
    orientation: "normal",
  };

  const result = capability.inspectArtefact(partial);
  assert.equal(result.success, true);
  if (!result.success) return;

  assert.equal(result.report.version, 2);
  assert.equal(result.report.orientation, "normal");
  assert.equal(result.report.moduleCount, undefined);
  assert.equal(result.report.errorCorrectionLevel, undefined);
  assert.equal(result.report.maskPattern, undefined);
  assert.equal(result.report.encodingMode, undefined);
  assert.equal(result.report.errorsCorrected, undefined);
  assert.equal(result.report.erasures, undefined);
  assert.equal(result.report.quietZone, undefined);
  assert.equal(result.report.dataCapacity, undefined);
  assert.equal(result.report.structuralAnalysis, undefined);
  assert.equal(result.report.imageProperties, undefined);
  assert.equal(result.report.geometry, undefined);
  assert.equal(result.report.timing, undefined);
  assert.equal(result.report.colours, undefined);
  assert.equal(result.report.moduleMatrix, undefined);
  assert.equal(result.report.byteView, undefined);

  const invalid: capability.ArtefactSpec = {
    version: 99,
  };
  const rejected = capability.inspectArtefact(invalid);
  assert.equal(rejected.success, false);
  if (rejected.success) return;
  assert.equal(rejected.error.kind, "invalid-version");
  assert.match(rejected.error.message, /Version/);
});

test("structuralinspectionuisemantics", () => {
  const matrix: readonly (readonly number[])[] = [
    [1, 0, 1, 0],
    [0, 1, 0, 1],
    [1, 1, 0, 0],
    [0, 0, 1, 1],
  ];
  const bytes: readonly number[] = [10, 20, 30, 40, 50];

  const inspected = capability.inspectArtefact({
    version: 1,
    moduleCount: 21,
    errorCorrectionLevel: "M",
    maskPattern: 0,
    encodingMode: "byte",
    orientation: "normal",
    moduleMatrix: matrix,
    byteView: bytes,
  });
  assert.equal(inspected.success, true);
  if (!inspected.success) return;

  assert.deepEqual(capability.getModuleMatrix(inspected.report), matrix);
  assert.deepEqual(capability.getByteView(inspected.report), bytes);

  const sparse = capability.inspectArtefact({ version: 1 });
  assert.equal(sparse.success, true);
  if (!sparse.success) return;
  assert.equal(capability.getModuleMatrix(sparse.report), undefined);
  assert.equal(capability.getByteView(sparse.report), undefined);
});

test("structuralinspectionvalidation", () => {
  const spec: capability.ArtefactSpec = {
    version: 7,
    moduleCount: 45,
    errorCorrectionLevel: "H",
    maskPattern: 5,
    encodingMode: "kanji",
    errorsCorrected: 4,
    erasures: 2,
    orientation: "rotated270",
    moduleMatrix: [
      [0, 1],
      [1, 0],
    ],
  };

  const workflow = capability.performStructuralInspection(spec);
  assert.equal(workflow.success, true);
  if (!workflow.success) return;

  const good = capability.validateInspection(spec, workflow.report);
  assert.equal(good.success, true);

  const tampered: capability.StructuralReport = {
    ...workflow.report,
    version: 8,
    moduleCount: 50,
    errorCorrectionLevel: "L",
    maskPattern: 7,
    encodingMode: "numeric",
    errorsCorrected: 99,
    erasures: 99,
    orientation: "rotated90",
    moduleMatrix: [
      [0],
    ],
  };

  const bad = capability.validateInspection(spec, tampered);
  assert.equal(bad.success, false);
  if (bad.success) return;
  assert.equal(bad.error.kind, "validation-failed");
  assert.match(bad.error.message, /version: expected 7, got 8/);
  assert.match(bad.error.message, /moduleCount: expected 45, got 50/);
  assert.match(bad.error.message, /errorCorrectionLevel: expected H, got L/);
  assert.match(bad.error.message, /maskPattern: expected 5, got 7/);
  assert.match(bad.error.message, /encodingMode: expected kanji, got numeric/);
  assert.match(bad.error.message, /errorsCorrected: expected 4, got 99/);
  assert.match(bad.error.message, /erasures: expected 2, got 99/);
  assert.match(bad.error.message, /orientation: expected rotated270, got rotated90/);
  assert.match(bad.error.message, /moduleMatrix: row count mismatch/);
});