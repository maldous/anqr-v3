import assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/analysis/qrdecoding.ts";

const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
const ERROR_CORRECTION_LEVELS = ["L", "M", "Q", "H"] as const;

function isFailure(r: unknown): r is capability.DecodingFailure {
  if (typeof r !== "object" || r === null) return false;
  const rec = r as Record<string, unknown>;
  return rec.success === false && rec.payload === null;
}

function isSuccess(r: unknown): r is capability.DecodingSuccess {
  if (typeof r !== "object" || r === null) return false;
  const rec = r as Record<string, unknown>;
  return rec.success === true;
}

function makeArtifacts(opts: {
  id: string;
  payloadText: string;
  ecc: capability.ErrorCorrectionLevel;
  confidence: capability.ConfidenceLevel;
  structuredAppend?: capability.StructuredAppendInfo | null;
}): capability.DecodeArtifacts {
  const image = new Uint8Array([1, 2, 3]);
  const payload = capability.encodeUtf8(opts.payloadText);
  const base: {
    id: string;
    image: Uint8Array;
    errorCorrectionLevel: capability.ErrorCorrectionLevel;
    payload: Uint8Array;
    payloadText: string;
    confidence: capability.ConfidenceLevel;
    structuredAppend?: capability.StructuredAppendInfo | null;
  } = {
    id: opts.id,
    image,
    errorCorrectionLevel: opts.ecc,
    payload,
    payloadText: opts.payloadText,
    confidence: opts.confidence,
  };
  if (opts.structuredAppend !== undefined) {
    base.structuredAppend = opts.structuredAppend;
  }
  return capability.createDecodeArtifacts(base);
}

test("qrdecodingcontracts", () => {
  // Negative half of the contract: arbitrary byte input yields a
  // structured failure with payload null and fields drawn from the
  // published enums.
  const failureResult: unknown = capability.decode(new Uint8Array([1, 2, 3]));
  assert.ok(isFailure(failureResult));
  const failure = failureResult as capability.DecodingFailure;
  assert.strictEqual(failure.success, false);
  assert.strictEqual(failure.payload, null);
  assert.ok(
    (capability.DECODING_ERROR_TYPES as readonly string[]).includes(
      failure.errorType,
    ),
  );
  assert.ok(
    (capability.DECODING_STAGES as readonly string[]).includes(failure.stage),
  );

  // Success branch built through the factory exposes exactly the
  // documented fields: payload text, payload bytes, a confidence drawn
  // from the published enum, and decoder metadata.
  const metadata = capability.createDecoderMetadata("qrcodes", {
    maskPattern: 2,
  });
  const success = capability.createDecodingSuccess({
    payloadText: "hello",
    payloadBytes: capability.encodeUtf8("hello"),
    confidence: "medium",
    decoderMetadata: metadata,
  });

  assert.strictEqual(success.success, true);
  assert.strictEqual(success.payloadText, "hello");
  assert.ok(success.payloadBytes instanceof Uint8Array);
  assert.strictEqual(
    success.payloadBytes.length,
    capability.encodeUtf8("hello").length,
  );
  assert.ok(
    (CONFIDENCE_LEVELS as readonly string[]).includes(success.confidence),
  );

  assert.strictEqual(typeof success.decoderMetadata.version, "string");
  assert.strictEqual(success.decoderMetadata.algorithm, "qrcodes");
  assert.strictEqual(typeof success.decoderMetadata.customizations, "object");

  // No diagnostic-only fields are guessed onto a success result.
  const successKeys = Object.keys(success).sort();
  assert.deepStrictEqual(successKeys, [
    "confidence",
    "decoderMetadata",
    "payloadBytes",
    "payloadText",
    "success",
  ]);
});

test("qrdecodingerrormodel", () => {
  // Every published stage, paired with a published error type, produces a
  // failure carrying that pair and no payload.
  const stageToError: Record<
    capability.DecodingStage,
    capability.DecodingErrorType
  > = {
    input_validation: "invalid_image_data",
    image_preprocessing: "decode_failure",
    symbol_detection: "no_qr_found",
    format_decoding: "unsupported_version",
    data_extraction: "decode_failure",
    error_correction: "ecc_failure",
    confidence_assessment: "decode_failure",
  };
  for (const stage of capability.DECODING_STAGES) {
    const failure = capability.createDecodingFailure(
      stageToError[stage],
      stage,
    );
    assert.strictEqual(failure.success, false);
    assert.strictEqual(failure.payload, null);
    assert.strictEqual(failure.stage, stage);
    assert.ok(
      (capability.DECODING_ERROR_TYPES as readonly string[]).includes(
        failure.errorType,
      ),
    );
  }

  // decode() rejects non-Uint8Array input as a stage-named failure with
  // no payload.
  const invalidType: unknown = capability.decode(
    "not a uint8 array" as unknown as Uint8Array,
  );
  assert.ok(isFailure(invalidType));
  const invalidFailure = invalidType as capability.DecodingFailure;
  assert.strictEqual(invalidFailure.errorType, "invalid_image_data");
  assert.strictEqual(invalidFailure.stage, "input_validation");
  assert.strictEqual(invalidFailure.payload, null);

  // Empty image data is also rejected at the same stage.
  const empty: unknown = capability.decode(new Uint8Array(0));
  assert.ok(isFailure(empty));
  const emptyFailure = empty as capability.DecodingFailure;
  assert.strictEqual(emptyFailure.errorType, "invalid_image_data");
  assert.strictEqual(emptyFailure.stage, "input_validation");
  assert.strictEqual(emptyFailure.payload, null);

  // A low-confidence result is reported as low confidence, not as a
  // failure. The mapping is fail-closed on out-of-range and non-finite
  // scores.
  assert.strictEqual(capability.confidenceFromScore(0.1), "low");
  assert.strictEqual(capability.confidenceFromScore(-1), "low");
  assert.strictEqual(capability.confidenceFromScore(Number.NaN), "low");
  assert.strictEqual(
    capability.confidenceFromScore(Number.POSITIVE_INFINITY),
    "low",
  );

  // Medium and high confidence are valid success-side values.
  assert.strictEqual(capability.confidenceFromScore(0.75), "medium");
  assert.strictEqual(capability.confidenceFromScore(0.95), "high");
});

test("qrdecodingstatemodel", () => {
  // decode() is stateless per image: repeated calls over the same byte
  // input produce structurally identical results.
  const img = new Uint8Array([0xff, 0xd8, 0x00, 0x01]);
  const r1: capability.DecodingResult = capability.decode(img);
  const r2: capability.DecodingResult = capability.decode(img);
  assert.deepStrictEqual(r1, r2);

  // Distinct option objects do not leak across calls.
  const optsA: capability.DecodingOptions = {
    errorCorrectionLevel: "H",
    customizations: { maskPattern: 4 },
  };
  const optsB: capability.DecodingOptions = {
    errorCorrectionLevel: "L",
    customizations: {},
  };
  const ra: capability.DecodingResult = capability.decode(img, optsA);
  const rb: capability.DecodingResult = capability.decode(img, optsB);
  assert.deepStrictEqual(ra, r2);
  assert.deepStrictEqual(rb, r2);

  // Structured-append sequence reader returns one StructuredAppendInfo
  // per artifact without accumulating state.
  const saA = capability.createStructuredAppendInfo(0, 2, 0xa3);
  const saB = capability.createStructuredAppendInfo(1, 2, 0x5c);
  const artifacts: capability.DecodeArtifacts[] = [
    makeArtifacts({
      id: "sa-A",
      payloadText: "hi",
      ecc: "M",
      confidence: "medium",
      structuredAppend: saA,
    }),
    makeArtifacts({
      id: "sa-B",
      payloadText: "bye",
      ecc: "M",
      confidence: "medium",
      structuredAppend: saB,
    }),
  ];
  const seq = capability.readStructuredAppendSequence(artifacts);
  assert.strictEqual(seq.length, 2);
  assert.strictEqual(seq[0]?.sequenceIndex, 0);
  assert.strictEqual(seq[0]?.totalCount, 2);
  assert.strictEqual(seq[0]?.parity, 0xa3);
  assert.strictEqual(seq[1]?.sequenceIndex, 1);
  assert.strictEqual(seq[1]?.totalCount, 2);
  assert.strictEqual(seq[1]?.parity, 0x5c);

  // Repeating the read yields the same sequence: no shared state.
  const seq2 = capability.readStructuredAppendSequence(artifacts);
  assert.deepStrictEqual([...seq2], [...seq]);

  // An artifact without structured-append information is an error from
  // the reader, never silently remembered from a prior call.
  const noAppend: capability.DecodeArtifacts = makeArtifacts({
    id: "sa-none",
    payloadText: "x",
    ecc: "Q",
    confidence: "high",
  });
  assert.strictEqual(noAppend.structuredAppend, null);
  assert.throws(
    () => capability.readStructuredAppendSequence([noAppend]),
    /no structured-append information/,
  );

  // decodeWithAudit's audit callback does not mutate any shared state.
  let observed: capability.DecodingResult | undefined;
  const result = capability.decodeWithAudit(img, (r) => {
    observed = r;
  });
  assert.deepStrictEqual(result, r1);
  assert.deepStrictEqual(observed, r1);

  // A throwing audit must not corrupt the returned result.
  const throwingResult = capability.decodeWithAudit(img, () => {
    throw new Error("audit boom");
  });
  assert.deepStrictEqual(throwingResult, r1);
});

test("qrdecodinguisemantics", () => {
  // The decode surface shows the recovered payload alongside the
  // confidence. A low-confidence read is presented with confidence "low"
  // and the payload is still available.
  const low: capability.DecodingSuccess = {
    success: true,
    payloadText: "https://example.test/qr",
    payloadBytes: capability.encodeUtf8("https://example.test/qr"),
    confidence: "low",
    decoderMetadata: capability.createDecoderMetadata("qrcodes", {}),
  };
  const presented: unknown = capability.presentDecodingResult(low);
  assert.ok(
    typeof presented === "object" &&
      presented !== null &&
      "payloadText" in presented,
  );
  const view = presented as capability.DecodingPresentation;
  assert.strictEqual(view.payloadText, "https://example.test/qr");
  assert.ok(view.payloadBytes instanceof Uint8Array);
  assert.strictEqual(view.confidence, "low");
  assert.strictEqual(view.isLowConfidence, true);
  assert.strictEqual(typeof view.decoderMetadata.version, "string");
  assert.strictEqual(view.decoderMetadata.algorithm, "qrcodes");

  // A high-confidence read exposes the payload too -- confidence does
  // not gate whether the payload is shown.
  const high: capability.DecodingSuccess = {
    success: true,
    payloadText: "https://example.test/qr",
    payloadBytes: capability.encodeUtf8("https://example.test/qr"),
    confidence: "high",
    decoderMetadata: capability.createDecoderMetadata("qrcodes", {}),
  };
  const highView: unknown = capability.presentDecodingResult(high);
  assert.ok(
    typeof highView === "object" &&
      highView !== null &&
      "payloadText" in highView,
  );
  const highRec = highView as capability.DecodingPresentation;
  assert.strictEqual(highRec.isLowConfidence, false);
  assert.strictEqual(highRec.confidence, "high");
  assert.strictEqual(highRec.payloadText, "https://example.test/qr");

  // A failure is presented as an error type + stage pair, with no
  // payload field exposed as if it were recovered data.
  const failure: capability.DecodingFailure =
    capability.createDecodingFailure("ecc_failure", "error_correction");
  const errorView: unknown = capability.presentDecodingResult(failure);
  assert.ok(
    typeof errorView === "object" &&
      errorView !== null &&
      "errorType" in errorView &&
      "stage" in errorView &&
      !("payloadText" in (errorView as object)),
  );
  const err = errorView as {
    errorType: capability.DecodingErrorType;
    stage: capability.DecodingStage;
  };
  assert.strictEqual(err.errorType, "ecc_failure");
  assert.strictEqual(err.stage, "error_correction");

  // Presenting twice yields the same surface.
  const again = capability.presentDecodingResult(low);
  assert.deepStrictEqual(again, view);
});

test("qrdecodingvalidation", () => {
  // Build round-trip vectors across every published ECC level and across
  // the customisation shapes that buildRoundTripVectors emits, then
  // verify the canonical round-trip holds for every vector.
  const payloads = ["hi", "round-trip ✓", "0123456789"] as const;
  const vectors = capability.buildRoundTripVectors(payloads);

  const expectedCount =
    payloads.length * ERROR_CORRECTION_LEVELS.length * 3;
  assert.strictEqual(vectors.length, expectedCount);

  for (const v of vectors) {
    assert.ok(
      (ERROR_CORRECTION_LEVELS as readonly string[]).includes(
        v.errorCorrectionLevel,
      ),
    );
    assert.ok(
      v.payload instanceof Uint8Array &&
        v.payload.length === capability.encodeUtf8(v.payloadText).length,
    );

    const result = capability.verifyRoundTripVector(v, v.payload);
    assert.strictEqual(
      result.passed,
      true,
      `Round-trip must hold for ${v.id}: ${result.mismatches.join(", ")}`,
    );
    assert.deepStrictEqual(result.mismatches, []);
  }

  // End-to-end: a faithful decoder must report every vector as passed.
  const report = capability.runRoundTripValidation(vectors, (v) => v.payload);
  assert.strictEqual(report.total, vectors.length);
  assert.strictEqual(report.passed, vectors.length);
  assert.strictEqual(report.failed, 0);

  // Negative round-trip: tampering with a single byte fails the vector.
  const original = vectors[0];
  assert.ok(original);
  const tampered = new Uint8Array(original.payload);
  tampered[0] = (tampered[0] ?? 0) ^ 0xff;
  const bad = capability.verifyRoundTripVector(original, tampered);
  assert.strictEqual(bad.passed, false);
  assert.ok(bad.mismatches.length > 0);

  // Negative round-trip: a truncated payload fails with a length
  // mismatch.
  const truncated = original.payload.subarray(
    0,
    original.payload.length - 1,
  );
  const bad2 = capability.verifyRoundTripVector(original, truncated);
  assert.strictEqual(bad2.passed, false);
  assert.ok(bad2.mismatches.includes("length mismatch"));

  // The round-trip surface is fail-closed on empty ids and payloads.
  assert.throws(
    () =>
      capability.createRoundTripVector({
        id: "",
        errorCorrectionLevel: "M",
        payloadText: "x",
      }),
    /non-empty string/,
  );
  assert.throws(
    () =>
      capability.createRoundTripVector({
        id: "ok",
        errorCorrectionLevel: "M",
        payloadText: "",
      }),
    /non-empty string/,
  );

  // Utf-8 codec preserves arbitrary multi-byte characters.
  const tricky = "π✓𐀀";
  const enc = capability.encodeUtf8(tricky);
  assert.ok(enc instanceof Uint8Array);
  assert.strictEqual(capability.decodeUtf8(enc), tricky);

  // Full pipeline through validateRoundTripVectors using a faithful
  // decoder must pass every vector.
  const faithfulDecoder = (
    v: capability.RoundTripVector,
  ): capability.DecodingResult =>
    capability.createDecodingSuccess({
      payloadText: v.payloadText,
      payloadBytes: v.payload,
      confidence: "high",
      decoderMetadata: capability.createDecoderMetadata(
        "qrcodes",
        v.customizations,
      ),
    });
  const fullReport = capability.validateRoundTripVectors(
    vectors,
    faithfulDecoder,
    capability.DEFAULT_ROUND_TRIP_OPTIONS,
  );
  assert.strictEqual(fullReport.total, vectors.length);
  assert.strictEqual(fullReport.passed, vectors.length);
  assert.strictEqual(fullReport.failed, 0);
});