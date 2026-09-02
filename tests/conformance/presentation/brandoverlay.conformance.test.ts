import * as assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/presentation/brandoverlay.ts";

test("brandoverlaycontracts", () => {
  const modeSet = new Set<string>(capability.overlayModes);
  const expectedModes = [
    'center', 'blend', 'halftone', 'halftone-dithered', 'mosaic', 'gapfill',
    'brightness', 'duotone', 'subpixel', 'dithered', 'blue-noise', 'pixelate',
    'outline', 'wave', 'subpixel-size', 'dither', 'extreme', 'artwork'
  ];
  assert.equal(modeSet.size, expectedModes.length);
  for (const mode of expectedModes) {
    assert.ok(modeSet.has(mode), `overlayModes missing: ${mode}`);
  }

  const typeSet = new Set<string>(capability.overlayTypes);
  const expectedTypes = ['static', 'gif', 'apng', 'webp_anim', 'video'];
  assert.equal(typeSet.size, expectedTypes.length);
  for (const t of expectedTypes) {
    assert.ok(typeSet.has(t), `overlayTypes missing: ${t}`);
  }

  const watermarkSet = new Set<string>(capability.watermarkTypes);
  const expectedWatermarks = ['text', 'image', 'pattern'];
  assert.equal(watermarkSet.size, expectedWatermarks.length);
  for (const w of expectedWatermarks) {
    assert.ok(watermarkSet.has(w), `watermarkTypes missing: ${w}`);
  }

  const probe: capability.OverlayConfig = {
    mode: 'center',
    type: 'static',
    watermark: 'text',
    url: 'https://example.com/overlay.png'
  };
  assert.equal(capability.validateOverlayConfig(probe), null);

  const badWatermark: capability.OverlayConfig = {
    mode: 'center',
    type: 'static',
    watermark: 'not-a-watermark' as capability.WatermarkType
  };
  const badResult = capability.validateOverlayConfig(badWatermark);
  assert.ok(badResult);
  assert.equal(badResult!.status, 'failure');
  assert.equal(badResult!.reason, 'decode');
});

test("brandoverlayerrormodel", () => {
  // Each named refusal reason is producible through the public surface.
  const fetchRefusal = capability.refuseFetch('cannot reach host');
  assert.equal(fetchRefusal.status, 'failure');
  assert.equal(fetchRefusal.reason, 'fetch');

  const decodeRefusal = capability.refuseDecode('bad mode');
  assert.equal(decodeRefusal.status, 'failure');
  assert.equal(decodeRefusal.reason, 'decode');

  const placeRefusal = capability.refusePlace('cannot place');
  assert.equal(placeRefusal.status, 'failure');
  assert.equal(placeRefusal.reason, 'place');

  // A refusal that names an unrecognised reason must be coerced to a known
  // failure reason rather than silently accepted.
  const coerced = capability.refuseOverlay('nonsense' as capability.OverlayFailureReason, 'oops');
  assert.equal(coerced.status, 'failure');
  assert.equal(coerced.reason, 'decode');

  // A refusal never returns an artefact with the overlay silently omitted.
  // applyOverlay on a refused config returns the failure; the bare artefact
  // string is never returned as the payload.
  const refusedConfig: capability.OverlayConfig = {
    mode: 'center',
    type: 'static',
    url: 'http://example.com/overlay.png'
  };
  const refusedOutcome: capability.OverlayOutcome =
    capability.applyOverlay('bare-artefact', refusedConfig, capability.validateOverlayConfig);
  assert.equal(refusedOutcome.status, 'failure');
  if (refusedOutcome.status === 'failure') {
    assert.notEqual(refusedOutcome.detail, 'bare-artefact');
  }

  // When accepted, the payload must visibly carry the overlay marker -- the
  // overlay is never silently dropped.
  const acceptedConfig: capability.OverlayConfig = {
    mode: 'center',
    type: 'static',
    url: 'https://example.com/overlay.png'
  };
  const acceptedOutcome: capability.OverlayOutcome =
    capability.applyOverlay('bare-artefact', acceptedConfig, capability.validateOverlayConfig);
  assert.equal(acceptedOutcome.status, 'success');
  if (acceptedOutcome.status === 'success') {
    assert.match(acceptedOutcome.payload, /\[overlay:center\]/);
    assert.notEqual(acceptedOutcome.payload, 'bare-artefact');
  }
});

test("brandoverlaypermissions", () => {
  const forbiddenUrls = [
    'https://10.0.0.1/overlay.png',
    'https://172.16.0.1/overlay.png',
    'https://192.168.1.1/overlay.png',
    'https://127.0.0.1/overlay.png',
    'https://169.254.1.1/overlay.png',
    'https://169.254.169.254/latest/meta-data/',
    'https://localhost/overlay.png',
    'https://0.0.0.0/overlay.png',
    'http://example.com/overlay.png'
  ];
  for (const url of forbiddenUrls) {
    assert.equal(capability.isUrlSafe(url), false, `expected unsafe: ${url}`);
  }

  assert.equal(capability.isUrlSafe('https://example.com/overlay.png'), true);

  assert.equal(
    capability.validateRedirects(['https://example.com/step1', 'https://example.com/step2']),
    true
  );
  assert.equal(
    capability.validateRedirects(['https://example.com/step1', 'http://example.com/step2']),
    false
  );
  assert.equal(
    capability.validateRedirects(['https://example.com/step1', 'https://10.0.0.1/step2']),
    false
  );

  const zeroBytes: capability.OverlayConfig = {
    mode: 'center',
    type: 'static',
    url: 'https://example.com/overlay.png',
    maxBytes: 0
  };
  const zeroBytesResult = capability.validateOverlayConfig(zeroBytes);
  assert.ok(zeroBytesResult);
  assert.equal(zeroBytesResult!.status, 'failure');
  assert.equal(zeroBytesResult!.reason, 'fetch');

  const negativeMs: capability.OverlayConfig = {
    mode: 'center',
    type: 'static',
    url: 'https://example.com/overlay.png',
    maxMs: -5
  };
  const negativeMsResult = capability.validateOverlayConfig(negativeMs);
  assert.ok(negativeMsResult);
  assert.equal(negativeMsResult!.status, 'failure');
  assert.equal(negativeMsResult!.reason, 'fetch');

  const bounded: capability.OverlayConfig = {
    mode: 'center',
    type: 'static',
    url: 'https://example.com/overlay.png',
    maxBytes: 1024,
    maxMs: 5000
  };
  assert.equal(capability.validateOverlayConfig(bounded), null);
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
    assert.match(preview.previewData, /\[overlay:blend\]/);
  }

  // The preview must agree with applyOverlay so the user never discovers
  // the effect only after download.
  const applied: capability.OverlayOutcome =
    capability.applyOverlay('artefact', config, capability.validateOverlayConfig);
  assert.equal(applied.status, 'success');
  if (applied.status === 'success' && preview.status === 'success') {
    assert.equal(preview.previewData, applied.payload);
  }

  const invalidConfig: capability.OverlayConfig = {
    mode: 'blend',
    type: 'static',
    url: 'http://example.com/overlay.png'
  };
  const failedPreview = capability.previewOverlay('artefact', invalidConfig, capability.validateOverlayConfig);
  assert.equal(failedPreview.status, 'failure');
  if (failedPreview.status === 'failure') {
    assert.ok(failedPreview.reason);
  }
});

test("brandoverlayvalidation", () => {
  const validations = capability.validateAllModes();
  assert.equal(validations.length, capability.overlayModes.length);

  const expectedByMode: Record<capability.OverlayMode, string> = {
    center: 'base[center][overlay:center]',
    blend: 'base[blend][overlay:blend]',
    halftone: 'base[halftone][overlay:halftone]',
    'halftone-dithered': 'base[halftone-dithered][overlay:halftone-dithered]',
    mosaic: 'base[mosaic][overlay:mosaic]',
    gapfill: 'base[gapfill][overlay:gapfill]',
    brightness: 'base[brightness][overlay:brightness]',
    duotone: 'base[duotone][overlay:duotone]',
    subpixel: 'base[subpixel][overlay:subpixel]',
    dithered: 'base[dithered][overlay:dithered]',
    'blue-noise': 'base[blue-noise][overlay:blue-noise]',
    pixelate: 'base[pixelate][overlay:pixelate]',
    outline: 'base[outline][overlay:outline]',
    wave: 'base[wave][overlay:wave]',
    'subpixel-size': 'base[subpixel-size][overlay:subpixel-size]',
    dither: 'base[dither][overlay:dither]',
    extreme: 'base[extreme][overlay:extreme]',
    artwork: 'base[artwork][overlay:artwork]'
  };

  for (const validation of validations) {
    assert.equal(validation.valid, true, `mode not valid: ${validation.mode}`);
    assert.ok(validation.payload, `mode payload missing: ${validation.mode}`);
    assert.equal(validation.payload, expectedByMode[validation.mode]);
  }
});