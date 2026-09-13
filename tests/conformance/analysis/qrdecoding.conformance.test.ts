import assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/analysis/qrdecoding.ts";

test("qrdecodingcontracts", () => {
  const payloadBytes = capability.encodeUtf8("contract payload");
  const result = capability.createDecodingSuccess({
    payloadText: "contract payload",
    payloadBytes,
    confidence: "medium",
    decoderMetadata: capability.createDecoderMetadata("qrcodes", {
      maskPattern: 2,
    }),
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.payloadText, "contract payload");
  assert.deepStrictEqual(result.payloadBytes, payloadBytes);
  assert.ok(capability.CONFIDENCE_LEVELS.includes(result.confidence));
  assert.deepStrictEqual(result.decoderMetadata, {
    version: "1.0",
    algorithm: "qrcodes",
    customizations: { maskPattern: 2 },
  });
  assert.deepStrictEqual(Object.keys(result).sort(), [
    "confidence",
    "decoderMetadata",
    "payloadBytes",
    "payloadText",
    "success",
  ]);
});

test("qrdecodingerrormodel", () => {
  const failure = capability.decode(new Uint8Array());

  if (failure.success === true) {
    assert.fail("Empty image data must fail");
  } else {
    assert.strictEqual(failure.errorType, "invalid_image_data");
    assert.strictEqual(failure.stage, "input_validation");
    assert.strictEqual(failure.payload, null);
    assert.ok(!("payloadText" in failure));
    assert.ok(!("payloadBytes" in failure));
  }

  const lowConfidence = capability.createDecodingSuccess({
    payloadText: "uncertain payload",
    payloadBytes: capability.encodeUtf8("uncertain payload"),
    confidence: capability.confidenceFromScore(0.2),
    decoderMetadata: capability.createDecoderMetadata(),
  });

  assert.strictEqual(lowConfidence.success, true);
  assert.strictEqual(lowConfidence.confidence, "low");
});

test("qrdecodingrealimageevidence", () => {
  const validPng = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAASgAAAEoAQMAAADRyf5aAAAABlBMVEUAAAD///+l2Z/dAAAAAnRSTlP//8i138cAAAAJcEhZcwAACxIAAAsSAdLdfvwAAAEuSURBVGiB7dXJEoMwDANQ//9Pq9NYchZD6ZGDwpQleXDQ2GngnxFWVlZW71SRYzzE93FcNWvVlKIbJObzBqzmKdc4Px6iZq3uFLjKW6snxQamsbpVZWPJFDuwqhP3/+PgrNWp5hihLjuepq1WlXMjwKhLVaPVqTShTMcbvIFVV7XMXS57WFue1aFUbtt7LE1YdcUMR8vmKaoyrZrCtgrdHqlazSrcmhXZvszZqimwa8XWErS6VAR5KVhFanWoXMv6Y8ZRX7DalYJkk2Y9QofVqWaqWJxitjpVVLfqHvpPiLBqSkMpMuG5aLWpUIZrrAiWpVVTiq4qb2teq6YiNJ/dqzE/YHWhYv6YqNUPpUCBJVyrCwVlyHRBCsCqK7UoSzG3OqZs1dTjsLKysnqf+gBLpRx8B+/dPQAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
  const nonQrPng = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAASgAAAEoCAAAAADObDPFAAABdklEQVR42u3QMQEAAAgDILV/51nB0wMi0CkuRoEoUaJEiRKFKFGiRIkSJQpRokSJEiUKUaJEiRIlShSiRIkSJUqUKESJEiVKlChEiRIlSpQoUYgSJUqUKFGIEiVKlChRohAlSpQoUaJEIUqUKFGiRCFKlChRokSJQpQoUaJEiRKlQJQoUaJEiUKUKFGiRIkShShRokSJEoUoUaJEiRIlClGiRIkSJUoUokSJEiVKFKJEiRIlSpQoRIkSJUqUKESJEiVKlChRiBIlSpQoUaIQJUqUKFGiECVKlChRokQhSpQoUaJEiVIgSpQoUaJEIUqUKFGiRIlClChRokSJQpQoUaJEiRKFKFGiRIkSJQpRokSJEiUKUaJEiRIlShSiRIkSJUoUokSJEiVKlChEiRIlSpQoUYgSJUqUKFGIEiVKlChRohAlSpQoUaJEKRAlSpQoUaIQJUqUKFGiRCFKlChRokQhSpQoUaJEiUKUKFGiRIkShShRor5aop0DT/Tix4cAAAAASUVORK5CYII=",
      "base64",
    ),
  );

  assert.strictEqual(validPng.length, 412);
  assert.strictEqual(nonQrPng.length, 431);

  const validResult = capability.decode(validPng);
  assert.strictEqual(validResult.success, true);
  if (validResult.success === true) {
    assert.strictEqual(validResult.payloadText, "ANQR QR fixture 2026-09-06");
    assert.strictEqual(
      capability.decodeUtf8(validResult.payloadBytes),
      "ANQR QR fixture 2026-09-06",
    );
  }

  const nonQrResult = capability.decode(nonQrPng);
  assert.strictEqual(nonQrResult.success, false);
  if (nonQrResult.success === false) {
    assert.strictEqual(nonQrResult.errorType, "no_qr_found");
    assert.strictEqual(nonQrResult.payload, null);
    assert.ok(!("payloadText" in nonQrResult));
    assert.ok(!("payloadBytes" in nonQrResult));
  }
});

test("qrdecodingstatemodel", () => {
  const image = new Uint8Array([1, 2, 3]);
  assert.deepStrictEqual(capability.decode(image), capability.decode(image));

  const first = capability.createDecodeArtifacts({
    id: "first",
    image,
    errorCorrectionLevel: "M",
    payload: capability.encodeUtf8("first"),
    payloadText: "first",
    confidence: "medium",
    structuredAppend: capability.createStructuredAppendInfo(0, 2, 0xa3),
  });
  const second = capability.createDecodeArtifacts({
    id: "second",
    image,
    errorCorrectionLevel: "M",
    payload: capability.encodeUtf8("second"),
    payloadText: "second",
    confidence: "medium",
    structuredAppend: capability.createStructuredAppendInfo(1, 2, 0xa3),
  });

  const expected: readonly capability.StructuredAppendInfo[] = [
    { sequenceIndex: 0, totalCount: 2, parity: 0xa3 },
    { sequenceIndex: 1, totalCount: 2, parity: 0xa3 },
  ];
  assert.deepStrictEqual(
    capability.readStructuredAppendSequence([first, second]),
    expected,
  );
  assert.deepStrictEqual(
    capability.readStructuredAppendSequence([first, second]),
    expected,
  );

  const independent = capability.createDecodeArtifacts({
    id: "independent",
    image,
    errorCorrectionLevel: "Q",
    payload: capability.encodeUtf8("independent"),
    payloadText: "independent",
    confidence: "high",
  });
  assert.throws(
    () => capability.readStructuredAppendSequence([independent]),
    /no structured-append information/,
  );
});

test("qrdecodinguisemantics", () => {
  const result = capability.createDecodingSuccess({
    payloadText: "visible payload",
    payloadBytes: capability.encodeUtf8("visible payload"),
    confidence: "low",
    decoderMetadata: capability.createDecoderMetadata(),
  });
  const presentation = capability.presentDecodingResult(result);

  if (!("payloadText" in presentation)) {
    assert.fail("A successful decode must present its payload");
  } else {
    assert.strictEqual(presentation.payloadText, "visible payload");
    assert.strictEqual(presentation.confidence, "low");
    assert.strictEqual(presentation.isLowConfidence, true);
    assert.deepStrictEqual(
      presentation.payloadBytes,
      capability.encodeUtf8("visible payload"),
    );
  }
});

test("qrdecodingvalidation", () => {
  const vectors = capability.buildRoundTripVectors(["round-trip ✓"]);

  assert.strictEqual(
    vectors.length,
    capability.ERROR_CORRECTION_LEVELS.length * 3,
  );
  assert.deepStrictEqual(
    new Set(vectors.map((vector) => vector.errorCorrectionLevel)),
    new Set<capability.ErrorCorrectionLevel>(["L", "M", "Q", "H"]),
  );
  assert.deepStrictEqual(
    new Set(vectors.map((vector) => JSON.stringify(vector.customizations))),
    new Set(["{}", '{"logoOverlay":true}', '{"maskPattern":4}']),
  );

  const report = capability.validateRoundTripVectors(
    vectors,
    (vector): capability.DecodingResult =>
      capability.createDecodingSuccess({
        payloadText: vector.payloadText,
        payloadBytes: vector.payload,
        confidence: "high",
        decoderMetadata: capability.createDecoderMetadata(
          "qrcodes",
          vector.customizations,
        ),
      }),
  );

  assert.strictEqual(report.total, vectors.length);
  assert.strictEqual(report.passed, vectors.length);
  assert.strictEqual(report.failed, 0);
  assert.ok(report.results.every((result) => result.passed));
  assert.ok(report.results.every((result) => result.mismatches.length === 0));

  const vector = vectors[0];
  assert.ok(vector);
  const corrupted = new Uint8Array(vector.payload);
  corrupted[0] = (corrupted[0] ?? 0) ^ 0xff;
  const rejected = capability.verifyRoundTripVector(vector, corrupted);
  assert.strictEqual(rejected.passed, false);
  assert.ok(rejected.mismatches.length > 0);
});