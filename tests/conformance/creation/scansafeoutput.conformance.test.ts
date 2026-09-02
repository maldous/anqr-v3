import assert from 'node:assert/strict';
import test from 'node:test';
import * as capability from '../../../src/capabilities/creation/scansafeoutput.ts';

test('scansafeoutputcontracts', () => {
  const nonDecodableDecoder: (artefact: unknown) => capability.DecodedArtefact = () => ({
    decodable: false,
    margin: 0,
    threshold: 0,
  });

  let state = capability.createInitialSafetyState();
  state = capability.setDecoder(state, nonDecodableDecoder);

  // off mode: no safety adjustment
  let offState = capability.setSafetyMode(state, 'off' as const);
  let result = capability.validateOnly(offState, { test: 'artefact' });
  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.mode, 'off');
  } else {
    throw new Error('Expected success in off mode');
  }

  // balanced mode: must be decodable
  let balancedState = capability.setSafetyMode(state, 'balanced' as const);
  result = capability.validateOnly(balancedState, { test: 'artefact' });
  assert.strictEqual(result.success, false);
  if (!result.success) {
    assert.strictEqual(result.error.message, 'Artefact is not decodable in balanced mode');
  } else {
    throw new Error('Expected failure in balanced mode');
  }

  // strict mode: must be decodable and margin above threshold
  const lowMarginDecoder: (artefact: unknown) => capability.DecodedArtefact = () => ({
    decodable: true,
    margin: 0.7,
    threshold: 0.8,
  });
  let strictState = capability.setSafetyMode(
    capability.setDecoder(state, lowMarginDecoder),
    'strict' as const
  );
  result = capability.validateOnly(strictState, { test: 'artefact' });
  assert.strictEqual(result.success, false);
  if (!result.success) {
    assert.ok(result.error.message.includes('Margin'));
  } else {
    throw new Error('Expected failure in strict mode due to margin');
  }

  // strict mode with sufficient margin
  const goodDecoder: (artefact: unknown) => capability.DecodedArtefact = () => ({
    decodable: true,
    margin: 0.9,
    threshold: 0.8,
  });
  let strictGoodState = capability.setSafetyMode(
    capability.setDecoder(state, goodDecoder),
    'strict' as const
  );
  result = capability.validateOnly(strictGoodState, { test: 'artefact' });
  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.mode, 'strict');
  } else {
    throw new Error('Expected success in strict mode with good margin');
  }
});

test('scansafeoutputerrormodel', () => {
  const nonDecodableDecoder: (artefact: unknown) => capability.DecodedArtefact = () => ({
    decodable: false,
    margin: 0,
    threshold: 0,
  });

  let state = capability.createInitialSafetyState();
  state = capability.setDecoder(state, nonDecodableDecoder);
  state = capability.setSafetyMode(state, 'balanced' as const);

  let result = capability.validateOnly(state, { test: 'artefact' });
  assert.strictEqual(result.success, false);
  if (!result.success) {
    assert.strictEqual(result.error.contributingControl, 'decoder');
  } else {
    throw new Error('Expected failure');
  }

  // strict mode with low margin
  const lowMarginDecoder: (artefact: unknown) => capability.DecodedArtefact = () => ({
    decodable: true,
    margin: 0.7,
    threshold: 0.8,
  });
  state = capability.setDecoder(state, lowMarginDecoder);
  state = capability.setSafetyMode(state, 'strict' as const);
  result = capability.validateOnly(state, { test: 'artefact' });
  assert.strictEqual(result.success, false);
  if (!result.success) {
    assert.strictEqual(result.error.contributingControl, 'decoder');
  } else {
    throw new Error('Expected failure');
  }

  // not ready (no decoder)
  let noDecoderState = capability.createInitialSafetyState();
  result = capability.validateOnly(noDecoderState, { test: 'artefact' });
  assert.strictEqual(result.success, false);
  if (!result.success) {
    assert.strictEqual(result.error.contributingControl, 'decoder');
  } else {
    throw new Error('Expected failure');
  }
});

test('scansafeoutputpermissions', () => {
  let state = capability.createInitialSafetyState();
  assert.strictEqual(state.safetyMode, 'balanced');

  state = capability.setSafetyMode(state, 'off' as const);
  assert.strictEqual(state.safetyMode, 'off');

  const dummyDecoder: (artefact: unknown) => capability.DecodedArtefact = () => ({
    decodable: true,
    margin: 0.9,
    threshold: 0.8,
  });
  state = capability.setDecoder(state, dummyDecoder);

  const result = capability.validateOnly(state, { test: 'artefact' });
  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.mode, 'off');
  } else {
    throw new Error('Expected success');
  }
});

test('scansafeoutputreadinessmodel', () => {
  let state = capability.createInitialSafetyState();
  assert.strictEqual(capability.isReady(state), false);

  let result = capability.validateOnly(state, { test: 'artefact' });
  assert.strictEqual(result.success, false);
  if (!result.success) {
    assert.ok(result.error.message.includes('decoder not available'));
  } else {
    throw new Error('Expected failure');
  }

  const dummyDecoder: (artefact: unknown) => capability.DecodedArtefact = () => ({
    decodable: true,
    margin: 0.9,
    threshold: 0.8,
  });
  state = capability.setDecoder(state, dummyDecoder);
  assert.strictEqual(capability.isReady(state), true);
});

test('scansafeoutputvalidation', () => {
  const nonDecodableDecoder: (artefact: unknown) => capability.DecodedArtefact = () => ({
    decodable: false,
    margin: 0,
    threshold: 0,
  });
  const decodableDecoder: (artefact: unknown) => capability.DecodedArtefact = () => ({
    decodable: true,
    margin: 0.9,
    threshold: 0.8,
  });
  const lowMarginDecoder: (artefact: unknown) => capability.DecodedArtefact = () => ({
    decodable: true,
    margin: 0.7,
    threshold: 0.8,
  });

  const artefact = { test: 'value' };

  // balanced mode with non-decodable decoder fails
  let state1 = capability.createInitialSafetyState();
  state1 = capability.setDecoder(state1, nonDecodableDecoder);
  state1 = capability.setSafetyMode(state1, 'balanced' as const);
  const result1 = capability.validateOnly(state1, artefact);
  assert.strictEqual(result1.success, false);

  // balanced mode with decodable decoder succeeds
  let state2 = capability.createInitialSafetyState();
  state2 = capability.setDecoder(state2, decodableDecoder);
  state2 = capability.setSafetyMode(state2, 'balanced' as const);
  const result2 = capability.validateOnly(state2, artefact);
  assert.strictEqual(result2.success, true);

  // strict mode with low margin fails
  let state3 = capability.createInitialSafetyState();
  state3 = capability.setDecoder(state3, lowMarginDecoder);
  state3 = capability.setSafetyMode(state3, 'strict' as const);
  const result3 = capability.validateOnly(state3, artefact);
  assert.strictEqual(result3.success, false);

  // strict mode with sufficient margin succeeds
  let state4 = capability.createInitialSafetyState();
  state4 = capability.setDecoder(state4, decodableDecoder);
  state4 = capability.setSafetyMode(state4, 'strict' as const);
  const result4 = capability.validateOnly(state4, artefact);
  assert.strictEqual(result4.success, true);
});