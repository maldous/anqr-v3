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

const finiteMeasurementPaths = ['validateOnly', 'validateAndMutate'] as const;

function exerciseFiniteMeasurementPath(
  path: typeof finiteMeasurementPaths[number],
  decoder: NonNullable<capability.SafetyState['decoder']>,
  mode: capability.SafetyMode = 'strict'
) {
  const artefact = Object.freeze({ value: 'synthetic artefact' });
  const state = Object.freeze({ decoder, safetyMode: mode });
  let mutationCalls = 0;
  const mutate = (validated: unknown) => {
    mutationCalls += 1;
    assert.strictEqual(validated, artefact);
    return validated;
  };
  const result = path === 'validateOnly'
    ? capability.validateOnly(state, artefact)
    : capability.validateAndMutate(state, artefact, mutate);
  assert.strictEqual(state.decoder, decoder);
  assert.strictEqual(state.safetyMode, mode);
  assert.deepEqual(artefact, { value: 'synthetic artefact' });
  return { result, mutationCalls, artefact };
}

function requireFiniteMeasurementRefusal(result: capability.SafetyCheckResult) {
  assert.strictEqual(result.success, false);
  if (result.success) throw new Error('Expected strict measurement refusal');
  assert.strictEqual(result.error.mode, 'strict');
  assert.strictEqual(result.error.contributingControl, 'decoder');
  return result.error.message;
}

test('scan_safe_finite_measurements_missing_nonfinite_and_malformed_refuse_before_mutation', () => {
  const invalid: readonly unknown[] = [NaN, Infinity, -Infinity, undefined, null, '0.9', {}];
  for (const path of finiteMeasurementPaths) {
    for (const value of invalid) {
      for (const field of ['margin', 'threshold'] as const) {
        const decoded = { decodable: true, margin: 0.9, threshold: 0.8, [field]: value };
        const observed = exerciseFiniteMeasurementPath(path, () => decoded as capability.DecodedArtefact);
        assert.strictEqual(requireFiniteMeasurementRefusal(observed.result), 'Strict safety measurements must be finite numbers');
        assert.strictEqual(observed.mutationCalls, 0);
      }
    }
  }
});

test('scan_safe_finite_measurements_keep_finite_comparison_and_mutation_semantics', () => {
  const cases = [
    { margin: 0.9, threshold: 0.8, accepted: true },
    { margin: 0.8, threshold: 0.8, accepted: false },
    { margin: 0.7, threshold: 0.8, accepted: false },
    { margin: 0, threshold: 0, accepted: false },
    { margin: 0.1, threshold: 0, accepted: true },
    { margin: -0.2, threshold: -0.3, accepted: true },
  ];
  for (const path of finiteMeasurementPaths) {
    for (const { margin, threshold, accepted } of cases) {
      const observed = exerciseFiniteMeasurementPath(path, () => ({ decodable: true, margin, threshold }));
      assert.strictEqual(observed.result.success, accepted);
      assert.strictEqual(observed.mutationCalls, path === 'validateAndMutate' && accepted ? 1 : 0);
      if (observed.result.success) {
        assert.strictEqual(observed.result.artefact, observed.artefact);
        assert.strictEqual(observed.result.decoderUsed, true);
      } else {
        assert.strictEqual(observed.result.error.message,
          `Margin (${margin}) does not exceed threshold (${threshold}) in strict mode`);
      }
    }
  }
});

test('scan_safe_finite_measurements_capture_each_getter_once_including_failure_messages', () => {
  for (const path of finiteMeasurementPaths) {
    for (const margin of [0.9, 0.8, 0.7]) {
      let marginReads = 0;
      let thresholdReads = 0;
      const decoded = {
        decodable: true,
        get margin() {
          marginReads += 1;
          if (marginReads !== 1) throw new Error('SYNTHETIC_SECOND_MARGIN_READ');
          return margin;
        },
        get threshold() {
          thresholdReads += 1;
          if (thresholdReads !== 1) throw new Error('SYNTHETIC_SECOND_THRESHOLD_READ');
          return 0.8;
        },
      };
      const observed = exerciseFiniteMeasurementPath(path, () => decoded);
      assert.strictEqual(observed.result.success, margin > 0.8);
      assert.strictEqual(observed.mutationCalls, path === 'validateAndMutate' && margin > 0.8 ? 1 : 0);
      assert.strictEqual(marginReads, 1);
      assert.strictEqual(thresholdReads, 1);
      if (!observed.result.success) {
        assert.strictEqual(observed.result.error.message,
          `Margin (${margin}) does not exceed threshold (0.8) in strict mode`);
      }
    }
  }
});

test('scan_safe_finite_measurements_throwing_getters_refuse_without_error_disclosure', () => {
  for (const path of finiteMeasurementPaths) {
    for (const field of ['margin', 'threshold'] as const) {
      const decoded = { decodable: true, margin: 0.9, threshold: 0.8 };
      Object.defineProperty(decoded, field, { get() { throw new Error('SYNTHETIC_PRIVATE_MEASUREMENT'); } });
      const observed = exerciseFiniteMeasurementPath(path, () => decoded);
      assert.strictEqual(requireFiniteMeasurementRefusal(observed.result), 'Strict safety measurements are unavailable');
      assert.strictEqual(observed.mutationCalls, 0);
    }
  }
});

test('scan_safe_finite_measurements_nondecode_refusal_precedes_measurement_access', () => {
  for (const path of finiteMeasurementPaths) {
    let reads = 0;
    const decoded = {
      decodable: false,
      get margin(): number { reads += 1; throw new Error('SYNTHETIC_UNREAD_MARGIN'); },
      get threshold(): number { reads += 1; throw new Error('SYNTHETIC_UNREAD_THRESHOLD'); },
    };
    const observed = exerciseFiniteMeasurementPath(path, () => decoded);
    assert.strictEqual(requireFiniteMeasurementRefusal(observed.result), 'Artefact is not decodable in strict mode');
    assert.strictEqual(observed.mutationCalls, 0);
    assert.strictEqual(reads, 0);
  }
});

test('scan_safe_finite_measurements_balanced_and_off_preserve_their_existing_contracts', () => {
  for (const path of finiteMeasurementPaths) {
    for (const mode of ['balanced', 'off'] as const) {
      let reads = 0;
      const decoded = {
        decodable: mode === 'balanced',
        get margin(): number { reads += 1; throw new Error('SYNTHETIC_UNREAD_MARGIN'); },
        get threshold(): number { reads += 1; throw new Error('SYNTHETIC_UNREAD_THRESHOLD'); },
      };
      const observed = exerciseFiniteMeasurementPath(path, () => decoded, mode);
      assert.strictEqual(observed.result.success, true);
      assert.strictEqual(observed.mutationCalls, path === 'validateAndMutate' ? 1 : 0);
      assert.strictEqual(reads, 0);
    }
  }
});

test('scan_safe_finite_measurements_decoder_exceptions_keep_existing_fail_closed_order', () => {
  for (const path of finiteMeasurementPaths) {
    let calls = 0;
    const observed = exerciseFiniteMeasurementPath(path, () => {
      calls += 1;
      throw new Error('SYNTHETIC_PRIVATE_DECODER');
    });
    assert.strictEqual(requireFiniteMeasurementRefusal(observed.result), 'Decoder failed to process artefact');
    assert.strictEqual(observed.mutationCalls, 0);
    assert.strictEqual(calls, 1);
  }
});
