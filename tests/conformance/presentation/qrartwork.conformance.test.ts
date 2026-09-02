import assert from 'node:assert/strict';
import test from 'node:test';
import * as capability from '../../../src/capabilities/presentation/qrartwork.ts';

test('qrartworkcontracts', () => {
  const validRequest = {
    payload: 'hello',
    overlayMode: 'replace-modules',
    dithering: 'floyd-steinberg',
    diffusionKernel: 'atkinson',
    orderedMatrix: 'bayer-4',
    colorMode: 'color',
    threshold: 128,
    acceptance: {
      name: 'test',
      minimumSymbolScore: 0.5,
      minimumContrast: 0.1,
    },
  } as const as capability.ArtworkRequest;

  const result = capability.validateArtworkRequest(validRequest);
  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.ok(result.artifact);
    assert.strictEqual(result.artifact.overlayMode, 'replace-modules');
    assert.strictEqual(result.artifact.dithering, 'floyd-steinberg');
    assert.strictEqual(result.artifact.diffusionKernel, 'atkinson');
    assert.strictEqual(result.artifact.orderedMatrix, 'bayer-4');
    assert.strictEqual(result.artifact.colorMode, 'color');
    assert.strictEqual(result.artifact.threshold, 128);
  }

  const invalidRequest = { ...validRequest, overlayMode: 'invalid' } as unknown as capability.ArtworkRequest;
  const invalidResult = capability.validateArtworkRequest(invalidRequest);
  assert.strictEqual(invalidResult.success, false);
});

test('qrartworkerrormodel', () => {
  const request = {
    payload: 'test',
    overlayMode: 'blend-modules',
    dithering: 'none',
    diffusionKernel: 'sierra',
    orderedMatrix: 'blue-noise',
    colorMode: 'grayscale',
    threshold: 200,
    acceptance: {
      name: 'strict',
      minimumSymbolScore: 0.9,
      minimumContrast: 0.5,
    },
  } as const as capability.ArtworkRequest;

  const source: capability.ArtworkSource = {
    width: 2,
    height: 2,
    pixels: [0, 0, 0, 0],
  };

  const result = capability.reduceSourceToArtifact(source, request);
  assert.strictEqual(result.success, false);
  if (!result.success) {
    assert.strictEqual(result.error.code, 'acceptance-breach');
    assert.strictEqual(result.error.acceptanceName, 'strict');
  }
});

test('qrartworkproof', () => {
  const request = {
    payload: 'proof-payload',
    overlayMode: 'embed-eye',
    dithering: 'threshold',
    diffusionKernel: 'burkes',
    orderedMatrix: 'void-and-cluster',
    colorMode: 'bw',
    threshold: 100,
    acceptance: capability.DEFAULT_ACCEPTANCE,
  } as const as capability.ArtworkRequest;

  const artifactResult = capability.validateArtworkRequest(request);
  if (!artifactResult.success) throw new Error('Expected valid request');
  const artifact = artifactResult.artifact;

  const correctDecode: capability.DecodeArtifactFn = (art) => art.payload;
  const proofOk = capability.proveArtworkByDecode(artifact, correctDecode);
  assert.strictEqual(proofOk.success, true);

  const wrongDecode: capability.DecodeArtifactFn = () => 'wrong';
  const proofFail = capability.proveArtworkByDecode(artifact, wrongDecode);
  assert.strictEqual(proofFail.success, false);
  if (!proofFail.success) {
    assert.strictEqual(proofFail.error.code, 'decode-mismatch');
  }
});

test('qrartworkvalidation', () => {
  const request = {
    payload: 'validate-payload',
    overlayMode: 'overlay-eye',
    dithering: 'jarvis',
    diffusionKernel: 'floyd-steinberg',
    orderedMatrix: 'bayer-2',
    colorMode: 'color',
    threshold: 50,
    acceptance: capability.DEFAULT_ACCEPTANCE,
  } as const as capability.ArtworkRequest;

  const decode: capability.DecodeArtifactFn = (art) => art.payload;

  const createResult = capability.createAndValidateArtifact(request, decode);
  assert.strictEqual(createResult.success, true);
  if (createResult.success) {
    const validateResult = capability.validateArtifact(createResult.artifact, decode);
    assert.strictEqual(validateResult.success, true);
  }

  const wrongDecode: capability.DecodeArtifactFn = () => 'other';
  const createFail = capability.createAndValidateArtifact(request, wrongDecode);
  assert.strictEqual(createFail.success, false);
  if (!createFail.success) {
    assert.strictEqual(createFail.error.code, 'decode-mismatch');
  }

  const artifactResult = capability.validateArtworkRequest(request);
  if (!artifactResult.success) throw new Error('Expected valid request');
  const tampered: capability.ArtworkArtifact = {
    ...artifactResult.artifact,
    bytes: new Uint8Array(artifactResult.artifact.bytes),
  };
  tampered.bytes[0] = (tampered.bytes[0] + 1) % 256;
  const validateTampered = capability.validateArtifact(tampered, decode);
  assert.strictEqual(validateTampered.success, false);
  if (!validateTampered.success) {
    assert.strictEqual(validateTampered.error.code, 'decode-mismatch');
  }
});