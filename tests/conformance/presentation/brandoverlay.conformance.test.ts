import * as assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/presentation/brandoverlay.ts";

test("brandoverlaycontracts", () => {
  assert.deepEqual(capability.overlayModes, [
    'center', 'blend', 'halftone', 'halftone-dithered', 'mosaic', 'gapfill',
    'brightness', 'duotone', 'subpixel', 'dithered', 'blue-noise', 'pixelate',
    'outline', 'wave', 'subpixel-size', 'dither', 'extreme', 'artwork'
  ]);
  assert.deepEqual(capability.overlayTypes, ['static', 'gif', 'apng', 'webp_anim', 'video']);
  assert.deepEqual(capability.watermarkTypes, ['text', 'image', 'pattern']);
});

test("brandoverlayerrormodel", () => {
  const invalidUrlConfig: capability.OverlayConfig = {
    mode: 'center',
    type: 'static',
    url: 'http://example.com/overlay.png'
  };
  const fetchFailure = capability.validateOverlayConfig(invalidUrlConfig);
  assert.equal(fetchFailure?.status, 'failure');
  assert.equal(fetchFailure?.reason, 'fetch');

  const invalidModeConfig: capability.OverlayConfig = {
    mode: 'invalid-mode' as capability.OverlayMode,
    type: 'static'
  };
  const decodeFailure = capability.validateOverlayConfig(invalidModeConfig);
  assert.equal(decodeFailure?.status, 'failure');
  assert.equal(decodeFailure?.reason, 'decode');

  const validConfig: capability.OverlayConfig = {
    mode: 'center',
    type: 'static',
    url: 'https://example.com/overlay.png'
  };
  const result = capability.applyOverlay('artefact', validConfig, capability.validateOverlayConfig);
  assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.match(result.payload, /overlay/);
  }
});

test("brandoverlaypermissions", () => {
  const privateUrls = [
    'https://10.0.0.1/overlay.png',
    'https://172.16.0.1/overlay.png',
    'https://192.168.1.1/overlay.png',
    'https://127.0.0.1/overlay.png',
    'https://169.254.169.254/overlay.png',
    'https://localhost/overlay.png'
  ];
  for (const url of privateUrls) {
    assert.equal(capability.isUrlSafe(url), false);
  }
  assert.equal(capability.isUrlSafe('https://example.com/overlay.png'), true);
  assert.equal(
    capability.validateRedirects(['https://example.com/step1', 'https://example.com/step2']),
    true
  );
  assert.equal(
    capability.validateRedirects(['https://example.com/step1', 'https://10.0.0.1/step2']),
    false
  );
  const configWithPrivateUrl: capability.OverlayConfig = {
    mode: 'center',
    type: 'static',
    url: 'https://192.168.1.1/overlay.png'
  };
  const failure = capability.validateOverlayConfig(configWithPrivateUrl);
  assert.equal(failure?.status, 'failure');
  assert.equal(failure?.reason, 'fetch');
});

test("brandoverlayuisemantics", () => {
  const config: capability.OverlayConfig = {
    mode: 'blend',
    type: 'static',
    url: 'https://example.com/overlay.png'
  };
  const preview = capability.previewOverlay('artefact', config, capability.validateOverlayConfig);
  assert.equal(preview.status, 'success');
  if (preview.status === 'success') {
    assert.equal(preview.previewData, 'artefact[overlay:blend]');
  }

  const invalidConfig: capability.OverlayConfig = {
    mode: 'center',
    type: 'static',
    url: 'http://example.com/overlay.png'
  };
  const failedPreview = capability.previewOverlay('artefact', invalidConfig, capability.validateOverlayConfig);
  assert.equal(failedPreview.status, 'failure');
  if (failedPreview.status === 'failure') {
    assert.equal(failedPreview.reason, 'URL validation failed');
  }
});

test("brandoverlayvalidation", () => {
  const validations = capability.validateAllModes();
  assert.equal(validations.length, capability.overlayModes.length);
  for (const validation of validations) {
    assert.equal(validation.valid, true);
    assert.ok(validation.payload);
  }
});