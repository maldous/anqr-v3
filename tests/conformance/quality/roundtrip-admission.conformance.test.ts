import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createArtefact, defaultAudit, proveRoundTrip, validateOverlay,
  type CreationErrorCode, type CreationOptions, type OverlayCustomisation,
} from "../../../src/capabilities/quality/roundtripcorrectness.ts";

function request(size: unknown): CreationOptions {
  return {
    payload: { kind: "text", content: "finite overlay admission" },
    errorCorrection: "M",
    overlay: { logo: { data: "LOGO", size: size as number } },
  };
}

function assertRefusal(options: CreationOptions, expected: CreationErrorCode): void {
  let audits = 0;
  const result = createArtefact(options, () => { audits++; return { success: true }; });
  assert.equal(result.success, false);
  assert.equal(audits, 0, "Validation refusal must precede the supplied audit");
  if (result.success) throw new Error("Expected validation refusal");
  assert.equal(result.error.code, expected);
  assert.equal(result.error.role, "alert");
  assert.ok(result.error.message.length > 0);
}

test("roundtrip_admission_rejects_nonfinite_logo_sizes", () => {
  for (const size of [NaN, Infinity, -Infinity]) {
    const result = validateOverlay(request(size).overlay);
    assert.equal(result.success, false);
    if (result.success) throw new Error("Nonfinite size admitted");
    assert.equal(result.error.code, "INVALID_OVERLAY");
    assert.equal(result.error.role, "alert");
  }
});

test("roundtrip_admission_refuses_nonfinite_before_audit", () => {
  for (const size of [NaN, Infinity, -Infinity]) {
    assertRefusal(request(size), "INVALID_OVERLAY");
  }
});

test("roundtrip_admission_keeps_positive_finite_fractional_range", () => {
  for (const size of [Number.MIN_VALUE, 0.5, 1, 64, Number.MAX_VALUE]) {
    const options = request(size);
    assert.deepEqual(validateOverlay(options.overlay), { success: true });
    for (const audit of [defaultAudit, proveRoundTrip]) {
      assert.equal(createArtefact(options, audit).success, true, String(size));
    }
  }
});

test("roundtrip_admission_preserves_nonpositive_and_type_refusals", () => {
  for (const size of [0, -0, -0.25, -1, "1", undefined, null]) {
    const options = request(size);
    const result = validateOverlay(options.overlay);
    assert.equal(result.success, false);
    if (result.success) throw new Error("Invalid size admitted");
    assert.equal(result.error.code, "INVALID_OVERLAY");
    assert.equal(result.error.message, "Overlay logo size must be a positive number.");
    assertRefusal(options, "INVALID_OVERLAY");
  }
});

test("roundtrip_admission_does_not_require_a_logo_for_other_overlays", () => {
  const overlays: (OverlayCustomisation | undefined)[] = [
    undefined, {}, { frame: { label: "SCAN", color: "#000000" } },
  ];
  for (const overlay of overlays) {
    const options = { ...request(1), overlay };
    assert.deepEqual(validateOverlay(overlay), { success: true });
    assert.equal(createArtefact(options, defaultAudit).success, true);
  }
});

test("roundtrip_admission_preserves_validation_order_and_logo_data_priority", () => {
  const options = request(NaN);
  assertRefusal({ ...options, payload: { kind: "text", content: "" } }, "INVALID_PAYLOAD_CONTENT");
  assertRefusal({ ...options, errorCorrection: "INVALID" } as unknown as CreationOptions, "INVALID_ERROR_CORRECTION");
  assertRefusal({
    ...options,
    style: { foreground: "", background: "#FFFFFF", eyeShape: "square", moduleShape: "square" },
  }, "INVALID_STYLE");
  const invalidData = { ...options, overlay: { logo: { data: "", size: NaN } } };
  const result = validateOverlay(invalidData.overlay);
  assert.equal(result.success, false);
  if (result.success) throw new Error("Invalid logo data admitted");
  assert.equal(result.error.message, "Overlay logo data must be a non-empty string.");
  assertRefusal(invalidData, "INVALID_OVERLAY");
});
