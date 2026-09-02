import { strict as assert } from "node:assert/strict";
import { test } from "node:test";
import * as capability from "../../../src/capabilities/presentation/animatedartefact.ts";

test("animatedartefactcontracts", () => {
  const pattern: capability.Pattern = {
    alias: "test_pattern",
    pattern: "test_pattern_string",
  };
  const config = capability.createAnimationConfig(
    pattern,
    "target",
    "linear",
    "linear",
    "x",
    "bayer",
    "gif"
  );
  assert.strictEqual(config.pattern.alias, "test_pattern");
  assert.strictEqual(config.pattern.pattern, "test_pattern_string");
  assert.strictEqual(config.target, "target");
  assert.strictEqual(config.easing, "linear");
  assert.strictEqual(config.interpolation, "linear");
  assert.strictEqual(config.waveAxis, "x");
  assert.strictEqual(config.temporalDither, "bayer");
  assert.strictEqual(config.outputFormat, "gif");

  assert.deepStrictEqual([...capability.OUTPUT_FORMATS], ["gif", "webp"]);
  assert.strictEqual(capability.OUTPUT_FORMATS.length, 2);
  assert.ok(capability.OUTPUT_FORMATS.includes("gif"));
  assert.ok(capability.OUTPUT_FORMATS.includes("webp"));
});

test("animatedartefacterrormodel", () => {
  const longDurationConfig = capability.createAnimationConfig(
    { alias: "long_duration", pattern: "p" },
    "t",
    "linear",
    "linear",
    "x",
    "bayer",
    "gif",
    15000
  );
  const auditResult = capability.auditAnimation(longDurationConfig, true);
  assert.strictEqual(auditResult.success, false);
  if (!auditResult.success) {
    assert.strictEqual(
      auditResult.error,
      "Duration 15000 exceeds maximum of 10000"
    );
    assert.ok(auditResult.error.includes("15000"));
    assert.ok(auditResult.error.includes("10000"));
  }

  const highFrameCountConfig = capability.createAnimationConfig(
    { alias: "high_frame_count", pattern: "p" },
    "t",
    "linear",
    "linear",
    "x",
    "bayer",
    "gif",
    undefined,
    400
  );
  const auditResult2 = capability.auditAnimation(highFrameCountConfig, true);
  assert.strictEqual(auditResult2.success, false);
  if (!auditResult2.success) {
    assert.strictEqual(
      auditResult2.error,
      "Frame count 400 exceeds maximum of 300"
    );
    assert.ok(auditResult2.error.includes("400"));
    assert.ok(auditResult2.error.includes("300"));
  }

  const produced = capability.produceAnimation(longDurationConfig, true);
  assert.strictEqual(produced.success, false);
  if (!produced.success) {
    assert.strictEqual(produced.error.error, "AUDIT_FAILED");
    assert.ok(produced.error.message.includes("15000"));
  }

  assert.throws(
    () =>
      capability.createAnimationConfig(
        { alias: "bad", pattern: "p" },
        "t",
        "linear",
        "linear",
        "x",
        "bayer",
        "gif",
        -1
      ),
    /positive/
  );
});

test("animatedartefactreadinessmodel", () => {
  const unavailable = capability.checkReadiness(false);
  assert.strictEqual(unavailable.ready, false);
  if (!unavailable.ready) {
    assert.strictEqual(
      unavailable.reason,
      "Animated rendering surface is not available."
    );
  }

  const available = capability.checkReadiness(true);
  assert.strictEqual(available.ready, true);

  const auditUnavailable = capability.auditAnimation(
    capability.createAnimationConfig(
      { alias: "ready", pattern: "p" },
      "t",
      "linear",
      "linear",
      "x",
      "bayer",
      "gif"
    ),
    false
  );
  assert.strictEqual(auditUnavailable.success, false);
  if (!auditUnavailable.success) {
    assert.ok(
      auditUnavailable.error.includes("Animated rendering surface is not available")
    );
  }

  const producedUnavailable = capability.produceAnimation(
    capability.createAnimationConfig(
      { alias: "ready2", pattern: "p" },
      "t",
      "linear",
      "linear",
      "x",
      "bayer",
      "gif"
    ),
    false
  );
  assert.strictEqual(producedUnavailable.success, false);
  if (!producedUnavailable.success) {
    assert.strictEqual(producedUnavailable.error.error, "AUDIT_FAILED");
    assert.ok(
      producedUnavailable.error.message.includes(
        "Animated rendering surface is not available"
      )
    );
  }
});

test("animatedartefactstatemodel", () => {
  const config = capability.createAnimationConfig(
    { alias: "statemodel_test", pattern: "s" },
    "target",
    "linear",
    "linear",
    "x",
    "bayer",
    "webp"
  );
  const result = capability.produceAnimation(config, true);
  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.artefact.format, "webp");
    assert.strictEqual(result.artefact.frameCount, 30);
    const dataFrames = result.artefact.data.split(",");
    assert.strictEqual(dataFrames.length, result.artefact.frameCount);
    assert.strictEqual(result.artefact.duration, 1000);
  }

  const countedConfig = capability.createAnimationConfig(
    { alias: "counted", pattern: "s" },
    "target",
    "linear",
    "linear",
    "x",
    "bayer",
    "gif",
    undefined,
    5
  );
  const countedResult = capability.produceAnimation(countedConfig, true);
  assert.strictEqual(countedResult.success, true);
  if (countedResult.success) {
    assert.strictEqual(countedResult.artefact.frameCount, 5);
    assert.strictEqual(
      countedResult.artefact.data.split(",").length,
      countedResult.artefact.frameCount
    );
  }
});

test("animatedartefactvalidation", () => {
  const cfg = capability.createAnimationConfig(
    { alias: "decoded", pattern: "d" },
    "t",
    "linear",
    "linear",
    "x",
    "bayer",
    "gif"
  );
  for (let i = 0; i < 3; i++) {
    const decodeResult = capability.decodeFrame(i, cfg);
    assert.strictEqual(decodeResult.success, true);
    if (decodeResult.success) {
      assert.strictEqual(decodeResult.frame, `frame-${i}`);
    }
  }

  const failingDecoder = (
    _frameIndex: number,
    _config: capability.AnimationConfig
  ): capability.FrameDecodeResult => ({
    success: false,
    error: "simulated decode failure",
  });

  const failingConfig = capability.createAnimationConfig(
    { alias: "fail", pattern: "f" },
    "t",
    "linear",
    "linear",
    "x",
    "bayer",
    "gif",
    undefined,
    10
  );

  const result = capability.produceAnimation(
    failingConfig,
    true,
    capability.auditAnimation,
    failingDecoder
  );
  assert.strictEqual(result.success, false);
  if (!result.success) {
    assert.strictEqual(result.error.error, "FRAME_DECODE_ERROR");
    assert.strictEqual(result.error.frameIndex, 0);
    assert.ok(result.error.message.includes("simulated decode failure"));
  }

  const partialArtefact: capability.AnimationArtefact = {
    format: "gif",
    data: "frame-0,frame-1",
    frameCount: 5,
    duration: 1000,
  };
  assert.strictEqual(
    capability.validateAnimationArtefact(partialArtefact),
    false
  );

  const completeConfig = capability.createAnimationConfig(
    { alias: "complete", pattern: "c" },
    "t",
    "linear",
    "linear",
    "x",
    "bayer",
    "gif",
    undefined,
    3
  );
  const completeResult = capability.produceAnimation(completeConfig, true);
  assert.strictEqual(completeResult.success, true);
  if (completeResult.success) {
    assert.strictEqual(
      capability.validateAnimationArtefact(completeResult.artefact),
      true
    );
  }
});