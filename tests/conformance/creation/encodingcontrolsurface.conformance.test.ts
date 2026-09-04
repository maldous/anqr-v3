import assert from "node:assert/strict";
import { test } from "node:test";
import * as capability from "../../../src/capabilities/creation/encodingcontrolsurface.ts";

const noAudit = (_opts: capability.EncodingOptions): capability.EncodingError | null => null;

function isError(value: capability.EncodingOptions | capability.EncodingError): value is capability.EncodingError {
  return (value as capability.EncodingError).success === false;
}

function unwrapOptions(value: capability.EncodingOptions | capability.EncodingError): capability.EncodingOptions {
  if (isError(value)) assert.fail(`expected updated options, got refusal: ${value.message}`);
  return value;
}

function unwrapError(value: capability.EncodingOptions | capability.EncodingError): capability.EncodingError {
  if (!isError(value)) assert.fail("expected a refusal, got updated options");
  return value;
}

function unwrapSuccess(outcome: capability.EncodingOutcome): capability.EncodingResult {
  if (!outcome.success) assert.fail(`expected an artefact, got refusal: ${outcome.message}`);
  return outcome;
}

function unwrapRefusal(outcome: capability.EncodingOutcome): capability.EncodingError {
  if (outcome.success) assert.fail("expected a refusal, got an artefact");
  return outcome;
}

test("architectureparameterjoinadmissibility", () => {
  const defaults = capability.createDefaultOptions();

  // The conditional-joining rules this module declares are mode/payload
  // compatibility: the join is validated in generateArtefact and in
  // setEncodingMode, and an inadmissible combination must be refused with a
  // stable reason rather than silently corrected.
  const joinRules: ReadonlyArray<{
    mode: capability.ResolvedMode;
    conformingPayload: string;
    inadmissiblePayload: string;
  }> = [
    { mode: "numeric", conformingPayload: "0123456789", inadmissiblePayload: "ABC" },
    { mode: "alphanumeric", conformingPayload: "HELLO 123", inadmissiblePayload: "hello" },
    { mode: "byte", conformingPayload: "any bytes!", inadmissiblePayload: "" },
    { mode: "kanji", conformingPayload: "kanji payload", inadmissiblePayload: "" },
  ];

  for (const rule of joinRules) {
    const admissible = unwrapSuccess(
      capability.generateArtefact({ ...defaults, encodingMode: rule.mode }, rule.conformingPayload, noAudit),
    );
    assert.equal(admissible.resolvedMode, rule.mode);

    const refusedOnce = unwrapRefusal(
      capability.generateArtefact({ ...defaults, encodingMode: rule.mode }, rule.inadmissiblePayload, noAudit),
    );
    assert.equal(refusedOnce.incompatibleMode, rule.mode);
    assert.ok(refusedOnce.message.length > 0, "the refusal states a reason");

    const refusedAgain = unwrapRefusal(
      capability.generateArtefact({ ...defaults, encodingMode: rule.mode }, rule.inadmissiblePayload, noAudit),
    );
    assert.equal(refusedAgain.message, refusedOnce.message, "the reason is stable across repeated validation");

    const refusedAtSet = unwrapError(capability.setEncodingMode(defaults, rule.mode, rule.inadmissiblePayload, noAudit));
    assert.equal(refusedAtSet.incompatibleMode, rule.mode);
    assert.equal(refusedAtSet.message, refusedOnce.message, "the reason is stable across both validation entry points");
  }

  // Each side of the numeric/"ABC" join is admissible alone: the payload
  // validates under auto (resolving alphanumeric), so a silent correction was
  // available — yet the explicit join must still be refused, not re-resolved.
  const payloadAlone = unwrapSuccess(capability.generateArtefact(defaults, "ABC", noAudit));
  assert.equal(payloadAlone.resolvedMode, "alphanumeric");
  const join = capability.generateArtefact({ ...defaults, encodingMode: "numeric" }, "ABC", noAudit);
  assert.equal(join.success, false, "only the combination is inadmissible and it must be refused, not corrected");
});

test("encodingcontrolsurfacecontracts", () => {
  const defaults = capability.createDefaultOptions();

  for (const level of capability.ERROR_CORRECTION_LEVELS) {
    const updated = unwrapOptions(capability.setErrorCorrection(defaults, level, noAudit));
    assert.equal(updated.errorCorrection, level);
  }
  const badLevel = unwrapError(capability.setErrorCorrection(defaults, "X" as capability.ErrorCorrectionLevel, noAudit));
  assert.match(badLevel.message, /one of: L, M, Q, H/);

  // "1" is valid in every mode, so each declared mode must be accepted.
  for (const mode of capability.ENCODING_MODES) {
    const updated = unwrapOptions(capability.setEncodingMode(defaults, mode, "1", noAudit));
    assert.equal(updated.encodingMode, mode);
  }
  const badMode = unwrapError(capability.setEncodingMode(defaults, "base64" as capability.EncodingMode, "1", noAudit));
  assert.match(badMode.message, /one of: auto, numeric, alphanumeric, byte, kanji/);

  const sizeMin = unwrapOptions(capability.setSize(defaults, capability.SIZE_BOUNDS.min, noAudit));
  assert.equal(sizeMin.size, capability.SIZE_BOUNDS.min);
  const sizeMax = unwrapOptions(capability.setSize(defaults, capability.SIZE_BOUNDS.max, noAudit));
  assert.equal(sizeMax.size, capability.SIZE_BOUNDS.max);
  unwrapError(capability.setSize(defaults, capability.SIZE_BOUNDS.max + 1, noAudit));
  unwrapError(capability.setSize(defaults, 250.5, noAudit));

  const marginMin = unwrapOptions(capability.setMargin(defaults, capability.MARGIN_BOUNDS.min, noAudit));
  assert.equal(marginMin.margin, capability.MARGIN_BOUNDS.min);
  unwrapError(capability.setMargin(defaults, capability.MARGIN_BOUNDS.min - 1, noAudit));
  unwrapError(capability.setMargin(defaults, 4.5, noAudit));

  const maskMax = unwrapOptions(capability.setMask(defaults, capability.MASK_BOUNDS.max, noAudit));
  assert.equal(maskMax.mask, capability.MASK_BOUNDS.max);
  unwrapError(capability.setMask(defaults, capability.MASK_BOUNDS.max + 1, noAudit));
  unwrapError(capability.setMask(defaults, 0.5, noAudit));

  const numeric = unwrapSuccess(capability.generateArtefact(defaults, "12345", noAudit));
  assert.equal(numeric.resolvedMode, "numeric");
  assert.equal(numeric.artefact.resolvedMode, "numeric");
  const alphanumeric = unwrapSuccess(capability.generateArtefact(defaults, "HELLO", noAudit));
  assert.equal(alphanumeric.resolvedMode, "alphanumeric");
  const byte = unwrapSuccess(capability.generateArtefact(defaults, "abc!", noAudit));
  assert.equal(byte.resolvedMode, "byte");
});

test("encodingcontrolsurfaceerrormodel", () => {
  const defaults = capability.createDefaultOptions();

  const tooSmall = unwrapError(capability.setSize(defaults, capability.SIZE_BOUNDS.min - 1, noAudit));
  assert.deepEqual(tooSmall.bound, capability.SIZE_BOUNDS);
  assert.match(tooSmall.message, /between 100 and 1000/);

  const tooLarge = unwrapError(capability.setMargin(defaults, capability.MARGIN_BOUNDS.max + 1, noAudit));
  assert.deepEqual(tooLarge.bound, capability.MARGIN_BOUNDS);
  assert.match(tooLarge.message, /between 0 and 100/);

  const badMask = unwrapError(capability.setMask(defaults, capability.MASK_BOUNDS.max + 1, noAudit));
  assert.deepEqual(badMask.bound, capability.MASK_BOUNDS);
  assert.match(badMask.message, /between 0 and 7/);

  const incompatibleSet = unwrapError(capability.setEncodingMode(defaults, "numeric", "ABC", noAudit));
  assert.equal(incompatibleSet.incompatibleMode, "numeric");
  assert.match(incompatibleSet.message, /incompatible/);

  const incompatibleGenerate = unwrapRefusal(
    capability.generateArtefact({ ...defaults, encodingMode: "alphanumeric" }, "abc", noAudit),
  );
  assert.equal(incompatibleGenerate.incompatibleMode, "alphanumeric");
  assert.match(incompatibleGenerate.message, /incompatible/);
  // A compatible mode existed for "abc" (auto resolves it), so the refusal
  // above proves the incompatible mode was not re-selected silently.
  const reSelectable = unwrapSuccess(capability.generateArtefact(defaults, "abc", noAudit));
  assert.equal(reSelectable.resolvedMode, "byte");
});

test("encodingcontrolsurfaceuisemantics", () => {
  const defaults = capability.createDefaultOptions();

  // The visible group is exactly the supplied options — nothing extra shown.
  const visible = capability.getVisibleOptions(defaults);
  assert.deepEqual(
    [...visible].sort(),
    ["encodingMode", "errorCorrection", "margin", "mask", "size"],
  );

  // The effect of every visible option is legible in the preview before export.
  const outcome = unwrapSuccess(capability.generateArtefact(defaults, "HELLO", noAudit));
  assert.match(outcome.artefact.preview, /ec=M/);
  assert.match(outcome.artefact.preview, /mode=alphanumeric/);
  assert.match(outcome.artefact.preview, /size=200/);
  assert.match(outcome.artefact.preview, /margin=4/);
  assert.match(outcome.artefact.preview, /mask=0/);
});

test("encodingcontrolsurfacevalidation", () => {
  const defaults = capability.createDefaultOptions();
  const baseline = unwrapSuccess(capability.generateArtefact(defaults, "HELLO", noAudit));

  const withEc = unwrapOptions(capability.setErrorCorrection(defaults, "H", noAudit));
  assert.equal(withEc.errorCorrection, "H");
  const ecArtefact = unwrapSuccess(capability.generateArtefact(withEc, "HELLO", noAudit));
  assert.match(ecArtefact.artefact.preview, /ec=H/);
  assert.notEqual(ecArtefact.artefact.preview, baseline.artefact.preview);
  const badEc = unwrapError(capability.setErrorCorrection(defaults, "X" as capability.ErrorCorrectionLevel, noAudit));
  assert.match(badEc.message, /Error correction must be one of/);

  const withMode = unwrapOptions(capability.setEncodingMode(defaults, "byte", "HELLO", noAudit));
  assert.equal(withMode.encodingMode, "byte");
  const modeArtefact = unwrapSuccess(capability.generateArtefact(withMode, "HELLO", noAudit));
  assert.match(modeArtefact.artefact.preview, /mode=byte/);
  assert.notEqual(modeArtefact.artefact.preview, baseline.artefact.preview);
  const badMode = unwrapError(capability.setEncodingMode(defaults, "numeric", "HELLO", noAudit));
  assert.equal(badMode.incompatibleMode, "numeric");
  assert.match(badMode.message, /incompatible/);

  const withSize = unwrapOptions(capability.setSize(defaults, 300, noAudit));
  assert.equal(withSize.size, 300);
  const sizeArtefact = unwrapSuccess(capability.generateArtefact(withSize, "HELLO", noAudit));
  assert.match(sizeArtefact.artefact.preview, /size=300/);
  assert.notEqual(sizeArtefact.artefact.preview, baseline.artefact.preview);
  const badSize = unwrapError(capability.setSize(defaults, 99, noAudit));
  assert.deepEqual(badSize.bound, capability.SIZE_BOUNDS);
  assert.match(badSize.message, /Size must be an integer between 100 and 1000/);

  const withMargin = unwrapOptions(capability.setMargin(defaults, 10, noAudit));
  assert.equal(withMargin.margin, 10);
  const marginArtefact = unwrapSuccess(capability.generateArtefact(withMargin, "HELLO", noAudit));
  assert.match(marginArtefact.artefact.preview, /margin=10/);
  assert.notEqual(marginArtefact.artefact.preview, baseline.artefact.preview);
  const badMargin = unwrapError(capability.setMargin(defaults, -5, noAudit));
  assert.deepEqual(badMargin.bound, capability.MARGIN_BOUNDS);
  assert.match(badMargin.message, /Margin must be an integer between 0 and 100/);

  const withMask = unwrapOptions(capability.setMask(defaults, 3, noAudit));
  assert.equal(withMask.mask, 3);
  const maskArtefact = unwrapSuccess(capability.generateArtefact(withMask, "HELLO", noAudit));
  assert.match(maskArtefact.artefact.preview, /mask=3/);
  assert.notEqual(maskArtefact.artefact.preview, baseline.artefact.preview);
  const badMask = unwrapError(capability.setMask(defaults, 8, noAudit));
  assert.deepEqual(badMask.bound, capability.MASK_BOUNDS);
  assert.match(badMask.message, /Mask must be an integer between 0 and 7/);
});