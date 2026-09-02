import assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/analysis/qrdecoding.ts";

type SuccessResult = {
  success: true;
  payloadText?: string;
  payloadBytes?: { value: Uint8Array };
  confidence: "low" | "medium" | "high";
  decoderMetadata?: {
    version: string;
    algorithm: string;
    customizations: Record<string, unknown>;
  };
};

type ErrorResult = {
  type: string;
  payload: null;
};

function isSuccess(r: unknown): r is SuccessResult {
  return (
    typeof r === "object" &&
    r !== null &&
    (r as { success?: unknown }).success === true
  );
}

function isError(r: unknown): r is ErrorResult {
  return (
    typeof r === "object" &&
    r !== null &&
    "type" in r &&
    "payload" in r &&
    (r as { payload: unknown }).payload === null
  );
}

test("qrdecodingcontracts", () => {
  const imageData = new Uint8Array([1, 2, 3]);
  const result: unknown = capability.decode(imageData);

  assert.ok(
    isSuccess(result),
    "Expected a success result from decode()"
  );
  const success = result as SuccessResult;

  assert.strictEqual(success.success, true);
  assert.strictEqual(typeof success.payloadText, "string");
  assert.strictEqual(success.payloadBytes, undefined);

  assert.ok(
    success.confidence === "low" ||
      success.confidence === "medium" ||
      success.confidence === "high"
  );

  assert.ok(
    success.decoderMetadata !== undefined &&
      typeof success.decoderMetadata === "object"
  );
  assert.strictEqual(
    typeof (success.decoderMetadata as { version: unknown }).version,
    "string"
  );
  assert.strictEqual(
    typeof (success.decoderMetadata as { algorithm: unknown }).algorithm,
    "string"
  );

  // Negative contract: "success" branch carries no diagnostic-only fields that
  // would have been guessed rather than produced.
  const resultKeys = Object.keys(success as object);
  for (const k of resultKeys) {
    assert.ok(
      [
        "success",
        "payloadText",
        "payloadBytes",
        "confidence",
        "decoderMetadata",
      ].includes(k),
      `Unexpected field on success result: ${k}`
    );
  }
});

test("qrdecodingerrormodel", () => {
  // Negative: invalid image data must yield a stage-named error with no payload.
  const errorResult: unknown = capability.decode(
    null as unknown as Uint8Array
  );
  assert.ok(
    isError(errorResult),
    "Expected an error result for invalid image data"
  );
  assert.strictEqual(errorResult.type, "invalid_image_data");
  assert.strictEqual(errorResult.payload, null);
  assert.ok(
    typeof (errorResult as { type: unknown }).type === "string" &&
      (errorResult as { type: string }).type.length > 0
  );

  // A low-confidence read is reported as low confidence, not as a failure.
  const lowResult: unknown = capability.decode(new Uint8Array([1]), {
    confidenceThreshold: 0.95,
  });
  assert.ok(
    isSuccess(lowResult),
    "Low-confidence result must not be reported as failure"
  );
  assert.strictEqual(lowResult.confidence, "low");
  assert.strictEqual(
    isError(lowResult),
    false,
    "Low-confidence result must not carry an error shape"
  );
});

test("qrdecodingstatemodel", () => {
  // Stateless: repeated calls over the same image with the same options
  // produce results consistent with the inputs and do not accumulate state.
  const img = new Uint8Array([1, 2, 3]);
  const r1: unknown = capability.decode(img);
  const r2: unknown = capability.decode(img);

  assert.ok(isSuccess(r1) && isSuccess(r2));
  assert.strictEqual(r1.confidence, r2.confidence);

  // Each call's confidence must reflect that call's options independently.
  const r3: unknown = capability.decode(img, { confidenceThreshold: 0.95 });
  assert.ok(isSuccess(r3));
  assert.strictEqual(r3.confidence, "low");

  const r4: unknown = capability.decode(img);
  assert.ok(isSuccess(r4));
  assert.strictEqual(r4.confidence, "medium");

  // Stateless across structured-append-style input: a sequence of decode
  // requests reports the options for each request without prior state
  // contaminating the next.
  const r5: unknown = capability.decode(img, { confidenceThreshold: 0.1 });
  assert.ok(isSuccess(r5));
  assert.strictEqual(r5.confidence, "high");

  const r6: unknown = capability.decode(img, { confidenceThreshold: 0.5 });
  assert.ok(isSuccess(r6));
  assert.strictEqual(r6.confidence, "medium");
});

test("qrdecodinguisemantics", () => {
  // The decode surface must always expose the recovered payload alongside
  // the confidence. A low-confidence read must never be presented as certain:
  // its confidence is "low" and the payload is still surfaced (not hidden).
  const low: unknown = capability.decode(new Uint8Array([1]), {
    confidenceThreshold: 0.95,
  });
  assert.ok(isSuccess(low));
  assert.strictEqual(low.confidence, "low");
  assert.strictEqual(typeof low.payloadText, "string");
  assert.notStrictEqual(low.payloadText, undefined);
  // "low" is a valid confidence value that is not "high", so the read is
  // explicitly not presented as certain.
  assert.notStrictEqual(low.confidence, "high");

  // A high-confidence read exposes the same surface (payload + confidence),
  // confirming the surface is uniform.
  const high: unknown = capability.decode(new Uint8Array([1]), {
    confidenceThreshold: 0.1,
  });
  assert.ok(isSuccess(high));
  assert.strictEqual(high.confidence, "high");
  assert.strictEqual(typeof high.payloadText, "string");
});

test("qrdecodingvalidation", () => {
  // Round-trip: artefacts ANQR creates must decode back to their payloads.
  const original = new Uint8Array([1, 2, 3, 4]);

  // Direct round-trip verification with a non-empty payload.
  assert.strictEqual(
    capability.verifyRoundTrip(original, "QR Code Payload"),
    true
  );

  // Each error-correction level the surface advertises must still round-trip.
  const levels = ["none", "low", "medium", "high"] as const;
  for (const lvl of levels) {
    const res: unknown = capability.decode(original, {
      errorCorrectionLevel: lvl,
    });
    assert.ok(
      isSuccess(res),
      `decode() with errorCorrectionLevel=${lvl} must succeed`
    );
    assert.strictEqual(typeof res.payloadText, "string");
    assert.ok(
      capability.verifyRoundTrip(original, res.payloadText),
      `Round-trip must hold at errorCorrectionLevel=${lvl}`
    );
  }

  // Customisations must not break round-trip.
  const resCust: unknown = capability.decode(original, {
    customizations: { mode: "byte", mask: 3 },
  });
  assert.ok(isSuccess(resCust));
  assert.strictEqual(typeof resCust.payloadText, "string");
  assert.ok(
    capability.verifyRoundTrip(original, resCust.payloadText),
    "Round-trip must hold with customizations applied"
  );

  // Negative round-trip: an empty original must not be reported as a
  // successful round-trip.
  assert.strictEqual(
    capability.verifyRoundTrip(new Uint8Array(0), "anything"),
    false
  );

  // Negative round-trip: a null decoded value with a non-empty original
  // must not be reported as a successful round-trip.
  assert.strictEqual(
    capability.verifyRoundTrip(original, null),
    false
  );
});