import assert from 'node:assert/strict';
import test from 'node:test';
import * as capability from '../../../src/capabilities/creation/qrartefactcreation.ts';

test('qrartefactcreationcontracts', () => {
  // Minimal request – all option groups omitted
  const minimalRequest = { payload: 'hello' } as capability.CreationRequest;
  const minimalResult = capability.createArtefact(minimalRequest);
  assert.strictEqual(minimalResult.success, true);
  if (minimalResult.success) {
    assert.deepStrictEqual(minimalResult.usedOptions.core, capability.DEFAULT_CORE_OPTIONS);
    assert.deepStrictEqual(minimalResult.usedOptions.render, capability.DEFAULT_RENDER_OPTIONS);
    assert.deepStrictEqual(minimalResult.usedOptions.output, capability.DEFAULT_OUTPUT_OPTIONS);
    assert.deepStrictEqual(minimalResult.usedOptions.overlay, capability.DEFAULT_OVERLAY_OPTIONS);
    assert.deepStrictEqual(minimalResult.usedOptions.animation, capability.DEFAULT_ANIMATION_OPTIONS);
    assert.deepStrictEqual(minimalResult.usedOptions.safety, capability.DEFAULT_SAFETY_OPTIONS);
    assert.deepStrictEqual(minimalResult.usedOptions.metadata, capability.DEFAULT_METADATA_OPTIONS);
    assert.deepStrictEqual(minimalResult.usedOptions.qualityAssurance, capability.DEFAULT_QUALITY_ASSURANCE_OPTIONS);
  }

  // One option group provided – others still default
  const overrideRequest = {
    payload: 'hello',
    core: { ...capability.DEFAULT_CORE_OPTIONS, errorCorrectionLevel: 'H' as const },
  } as capability.CreationRequest;
  const overrideResult = capability.createArtefact(overrideRequest);
  assert.strictEqual(overrideResult.success, true);
  if (overrideResult.success) {
    assert.strictEqual(overrideResult.usedOptions.core.errorCorrectionLevel, 'H');
    assert.deepStrictEqual(overrideResult.usedOptions.render, capability.DEFAULT_RENDER_OPTIONS);
    assert.deepStrictEqual(overrideResult.usedOptions.output, capability.DEFAULT_OUTPUT_OPTIONS);
  }
});

test('qrartefactcreationerrormodel', () => {
  // Capacity exceeded
  const longPayload = 'a'.repeat(2954); // > 2953 for L
  const capacityRequest = {
    payload: longPayload,
    core: {
      errorCorrectionLevel: 'L' as const,
      maskPattern: 0,
      moduleShape: 'square' as const,
      moduleSizePx: 8,
    },
  } as capability.CreationRequest;
  const capacityResult = capability.createArtefact(capacityRequest);
  assert.strictEqual(capacityResult.success, false);
  if (!capacityResult.success) {
    assert.strictEqual(capacityResult.reason, 'capacity-exceeded');
    assert.strictEqual(capacityResult.capacityLimit, 2953);
  }

  // Unsupported option value
  const badOptionRequest = {
    payload: 'test',
    core: {
      errorCorrectionLevel: 'X' as unknown as capability.ErrorCorrectionLevel,
      maskPattern: 0,
      moduleShape: 'square' as const,
      moduleSizePx: 8,
    },
  } as capability.CreationRequest;
  const badOptionResult = capability.createArtefact(badOptionRequest);
  assert.strictEqual(badOptionResult.success, false);
  if (!badOptionResult.success) {
    assert.strictEqual(badOptionResult.reason, 'unsupported-option');
    assert.strictEqual(badOptionResult.optionName, 'core.errorCorrectionLevel');
  }
});

test('qrartefactcreationstatemodel', () => {
  const request = { payload: 'stateless' } as capability.CreationRequest;
  const first = capability.createArtefact(request);
  const second = capability.createArtefact(request);
  assert.strictEqual(first.success, true);
  assert.strictEqual(second.success, true);
  if (first.success && second.success) {
    assert.deepStrictEqual(first.usedOptions, second.usedOptions);
  }

  // Audit callback sees fresh initial state each call
  const transitions: capability.CreationTransition[] = [];
  capability.createArtefact(request, (t) => transitions.push(t));
  assert.strictEqual(transitions.length, 1);
  assert.deepStrictEqual(transitions[0].previous, capability.initialRuntimeState());
  assert.deepStrictEqual(transitions[0].next, {
    requestsProcessed: 1,
    artefactsProduced: 1,
  });
});

test('qrartefactcreationuisemantics', () => {
  const request = { payload: 'preview' } as capability.CreationRequest;
  const preview = capability.previewArtefact(request);
  assert.strictEqual(preview.success, true);
  if (preview.success) {
    const exportResult = capability.createArtefact(request);
    assert.strictEqual(exportResult.success, true);
    if (exportResult.success) {
      const matches = capability.previewMatchesExport(preview.frame, exportResult);
      assert.strictEqual(matches, true);
    }
  }

  // When export fails, previewMatchesExport returns false
  const validPreview = capability.previewArtefact({ payload: 'ok' } as capability.CreationRequest);
  if (validPreview.success) {
    const failedExport = capability.createArtefact({
      payload: 'x'.repeat(3000),
    } as capability.CreationRequest);
    assert.strictEqual(failedExport.success, false);
    const matches = capability.previewMatchesExport(validPreview.frame, failedExport);
    assert.strictEqual(matches, false);
  }
});

test('qrartefactcreationvalidation', () => {
  // Non-ASCII payload with decodeCheck true must fail (decode mismatch)
  const mismatchRequest = {
    payload: 'é',
    qualityAssurance: {
      decodeCheck: true,
      contrastCheck: true,
      level: 'standard' as const,
    },
  } as capability.CreationRequest;
  const mismatchResult = capability.createArtefact(mismatchRequest);
  assert.strictEqual(mismatchResult.success, false);
  if (!mismatchResult.success) {
    assert.strictEqual(mismatchResult.reason, 'decode-mismatch');
  }

  // Same payload with decodeCheck false must succeed
  const noCheckRequest = {
    payload: 'é',
    qualityAssurance: {
      decodeCheck: false,
      contrastCheck: true,
      level: 'standard' as const,
    },
  } as capability.CreationRequest;
  const noCheckResult = capability.createArtefact(noCheckRequest);
  assert.strictEqual(noCheckResult.success, true);

  // ASCII payload with decodeCheck true must succeed
  const asciiRequest = {
    payload: 'hello',
    qualityAssurance: {
      decodeCheck: true,
      contrastCheck: true,
      level: 'standard' as const,
    },
  } as capability.CreationRequest;
  const asciiResult = capability.createArtefact(asciiRequest);
  assert.strictEqual(asciiResult.success, true);
});