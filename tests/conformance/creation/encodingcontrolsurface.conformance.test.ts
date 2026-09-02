import assert from "node:assert/strict";
import { test } from "node:test";
import * as capability from "../../../src/capabilities/creation/encodingcontrolsurface.ts";

const noAudit = (_opts: capability.EncodingOptions): null => null;

function isError(value: capability.EncodingOptions | capability.EncodingError): value is capability.EncodingError {
  return (value as capability.EncodingError).success === false;
}

function isOptions(value: capability.EncodingOptions | capability.EncodingError): value is capability.EncodingOptions {
  return !isError(value);
}

test("encodingcontrolsurfacecontracts", () => {
  const defaults = capability.createDefaultOptions();

  assert.ok(capability.ERROR_CORRECTION_LEVELS.includes(defaults.errorCorrection));
  assert.ok(capability.ENCODING_MODES.includes(defaults.encodingMode));
  assert.ok(Number.isInteger(defaults.size));
  assert.ok(defaults.size >= capability.SIZE_BOUNDS.min && defaults.size <= capability.SIZE_BOUNDS.max);
  assert.ok(Number.isInteger(defaults.margin));
  assert.ok(defaults.margin >= capability.MARGIN_BOUNDS.min && defaults.margin <= capability.MARGIN_BOUNDS.max);
  assert.ok(Number.isInteger(defaults.mask));
  assert.ok(defaults.mask >= capability.MASK_BOUNDS.min && defaults.mask <= capability.MASK_BOUNDS.max);

  for (const level of capability.ERROR_CORRECTION_LEVELS) {
    assert.ok(["L", "M", "Q", "H"].includes(level));
  }
  for (const mode of capability.ENCODING_MODES) {
    assert.ok(["auto", "numeric", "alphanumeric", "byte", "kanji"].includes(mode));
  }

  const numeric = capability.generateArtefact(defaults, "12345", noAudit);
  assert.equal(numeric.success, true);
  assert.equal(numeric.resolvedMode, "numeric");

  const alnum = capability.generateArtefact(defaults, "HELLO", noAudit);
  assert.equal(alnum.success, true);
  assert.equal(alnum.resolvedMode, "alphanumeric");

  const byte = capability.generateArtefact(defaults, "abc!", noAudit);
  assert.equal(byte.success, true);
  assert.equal(byte.resolvedMode, "byte");
});

test("encodingcontrolsurfaceerrormodel", () => {
  const defaults = capability.createDefaultOptions();

  const tooSmall = capability.setSize(defaults, 50, noAudit);
  assert.equal(isError(tooSmall), true);
  if (isError(tooSmall)) {
    assert.deepEqual(tooSmall.bound, capability.SIZE_BOUNDS);
    assert.match(tooSmall.message, /Size/);
  }

  const tooLarge = capability.setMargin(defaults, 999, noAudit);
  assert.equal(isError(tooLarge), true);
  if (isError(tooLarge)) {
    assert.deepEqual(tooLarge.bound, capability.MARGIN_BOUNDS);
    assert.match(tooLarge.message, /Margin/);
  }

  const badMask = capability.setMask(defaults, 8, noAudit);
  assert.equal(isError(badMask), true);
  if (isError(badMask)) {
    assert.deepEqual(badMask.bound, capability.MASK_BOUNDS);
    assert.match(badMask.message, /Mask/);
  }

  const incompatible = capability.setEncodingMode(defaults, "numeric", "ABC", noAudit);
  assert.equal(isError(incompatible), true);
  if (isError(incompatible)) {
    assert.equal(incompatible.incompatibleMode, "numeric");
    assert.match(incompatible.message, /incompatible/);
  }

  const incompatibleInArtefact = capability.generateArtefact(
    { ...defaults, encodingMode: "alphanumeric" },
    "abc",
    noAudit
  );
  assert.equal(incompatibleInArtefact.success, false);
  if (!incompatibleInArtefact.success) {
    assert.equal(incompatibleInArtefact.incompatibleMode, "alphanumeric");
  }
});

test("encodingcontrolsurfaceuisemantics", () => {
  const defaults = capability.createDefaultOptions();

  const visible = capability.getVisibleOptions(defaults);
  assert.equal(visible.length, 5);
  assert.ok(visible.includes("errorCorrection"));
  assert.ok(visible.includes("encodingMode"));
  assert.ok(visible.includes("size"));
  assert.ok(visible.includes("margin"));
  assert.ok(visible.includes("mask"));

  const outcome = capability.generateArtefact(defaults, "HELLO", noAudit);
  assert.equal(outcome.success, true);
  if (outcome.success) {
    assert.match(outcome.artefact.preview, /ec=M/);
    assert.match(outcome.artefact.preview, /mode=alphanumeric/);
    assert.match(outcome.artefact.preview, /size=200/);
    assert.match(outcome.artefact.preview, /margin=4/);
    assert.match(outcome.artefact.preview, /mask=0/);
  }
});

test("encodingcontrolsurfacevalidation", () => {
  const defaults = capability.createDefaultOptions();

  const newEc = capability.setErrorCorrection(defaults, "H", noAudit);
  assert.equal(isOptions(newEc), true);
  if (isOptions(newEc)) {
    assert.equal(newEc.errorCorrection, "H");
    const artefact = capability.generateArtefact(newEc, "123", noAudit);
    assert.equal(artefact.success, true);
    if (artefact.success) {
      assert.match(artefact.artefact.preview, /ec=H/);
    }
  }
  const badEc = capability.setErrorCorrection(defaults, "X" as capability.ErrorCorrectionLevel, noAudit);
  assert.equal(isError(badEc), true);
  if (isError(badEc)) {
    assert.match(badEc.message, /Error correction must be one of/);
  }

  const newMode = capability.setEncodingMode(defaults, "numeric", "123", noAudit);
  assert.equal(isOptions(newMode), true);
  if (isOptions(newMode)) {
    assert.equal(newMode.encodingMode, "numeric");
    const artefact = capability.generateArtefact(newMode, "123", noAudit);
    assert.equal(artefact.success, true);
    if (artefact.success) {
      assert.match(artefact.artefact.preview, /mode=numeric/);
    }
  }
  const badMode = capability.setEncodingMode(defaults, "numeric", "ABC", noAudit);
  assert.equal(isError(badMode), true);
  if (isError(badMode)) {
    assert.equal(badMode.incompatibleMode, "numeric");
  }

  const newSize = capability.setSize(defaults, 300, noAudit);
  assert.equal(isOptions(newSize), true);
  if (isOptions(newSize)) {
    assert.equal(newSize.size, 300);
    const artefact = capability.generateArtefact(newSize, "123", noAudit);
    assert.equal(artefact.success, true);
    if (artefact.success) {
      assert.match(artefact.artefact.preview, /size=300/);
    }
  }
  const badSize = capability.setSize(defaults, 99, noAudit);
  assert.equal(isError(badSize), true);
  if (isError(badSize)) {
    assert.deepEqual(badSize.bound, capability.SIZE_BOUNDS);
  }

  const newMargin = capability.setMargin(defaults, 10, noAudit);
  assert.equal(isOptions(newMargin), true);
  if (isOptions(newMargin)) {
    assert.equal(newMargin.margin, 10);
    const artefact = capability.generateArtefact(newMargin, "123", noAudit);
    assert.equal(artefact.success, true);
    if (artefact.success) {
      assert.match(artefact.artefact.preview, /margin=10/);
    }
  }
  const badMargin = capability.setMargin(defaults, -5, noAudit);
  assert.equal(isError(badMargin), true);
  if (isError(badMargin)) {
    assert.deepEqual(badMargin.bound, capability.MARGIN_BOUNDS);
  }

  const newMask = capability.setMask(defaults, 3, noAudit);
  assert.equal(isOptions(newMask), true);
  if (isOptions(newMask)) {
    assert.equal(newMask.mask, 3);
    const artefact = capability.generateArtefact(newMask, "123", noAudit);
    assert.equal(artefact.success, true);
    if (artefact.success) {
      assert.match(artefact.artefact.preview, /mask=3/);
    }
  }
  const badMask = capability.setMask(defaults, 8, noAudit);
  assert.equal(isError(badMask), true);
  if (isError(badMask)) {
    assert.deepEqual(badMask.bound, capability.MASK_BOUNDS);
  }
});