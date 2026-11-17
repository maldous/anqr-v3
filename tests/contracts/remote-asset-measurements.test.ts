import assert from 'node:assert/strict';
import test from 'node:test';
import * as capability from '../../src/capabilities/trust/remoteassetsafety.ts';

const sourceUrl = 'https://asset.example.test/image';

test('remote_asset_measurements_policy_refuses_nonfinite_controls', () => {
  for (const invalid of [NaN, Infinity, -Infinity]) {
    assert.throws(() => capability.createPolicy(invalid, 100, 2));
    assert.throws(() => capability.createPolicy(10, invalid, 2));
    assert.throws(() => capability.createPolicy(10, 100, invalid));
  }
});

test('remote_asset_measurements_policy_preserves_finite_domains_and_errors', () => {
  assert.throws(() => capability.createPolicy(0), /^Error: maxBytes must be positive$/);
  assert.throws(() => capability.createPolicy(10, 0), /^Error: timeoutMs must be positive$/);
  assert.throws(() => capability.createPolicy(10, 100, -1), /^Error: maxRedirects must be non-negative$/);
  const fractional = capability.createPolicy(10.5, 100.5, 1.5);
  assert.equal(fractional.maxBytes, 10.5);
  assert.equal(fractional.timeoutMs, 100.5);
  assert.equal(fractional.maxRedirects, 1.5);
  assert.equal(capability.createPolicy().maxBytes, capability.DEFAULT_MAX_BYTES);
  assert.equal(capability.createPolicy().timeoutMs, capability.DEFAULT_TIMEOUT_MS);
  assert.equal(capability.createPolicy().maxRedirects, capability.DEFAULT_MAX_REDIRECTS);
});

test('remote_asset_measurements_size_refuses_unknown_negative_and_infinite_values', () => {
  const policy = capability.createPolicy(10, 100, 2);
  for (const size of [NaN, -1, -Infinity, Infinity]) {
    assert.equal(capability.checkSizeBoundary(size, policy)?.boundary, 'size');
  }
  assert.match(capability.checkSizeBoundary(Infinity, policy)!.reason, /exceeds maximum/);
  assert.match(capability.checkSizeBoundary(11, policy)!.reason, /Response size 11 exceeds maximum 10/);
  assert.equal(capability.checkSizeBoundary(0, policy), null);
  assert.equal(capability.checkSizeBoundary(9.5, policy), null);
  assert.equal(capability.checkSizeBoundary(10, policy), null);
});

test('remote_asset_measurements_timeout_refuses_unknown_negative_and_infinite_values', () => {
  const policy = capability.createPolicy(10, 100, 2);
  for (const elapsedMs of [NaN, -1, -Infinity, Infinity]) {
    assert.equal(capability.checkTimeoutBoundary(elapsedMs, policy)?.boundary, 'timeout');
  }
  assert.match(capability.checkTimeoutBoundary(Infinity, policy)!.reason, /exceeds maximum/);
  assert.match(capability.checkTimeoutBoundary(101, policy)!.reason, /Elapsed 101ms exceeds maximum 100ms/);
  assert.equal(capability.checkTimeoutBoundary(0, policy), null);
  assert.equal(capability.checkTimeoutBoundary(99.5, policy), null);
  assert.equal(capability.checkTimeoutBoundary(100, policy), null);
});

test('remote_asset_measurements_fetch_refuses_invalid_metadata_with_boundary_audit', () => {
  const policy = capability.createPolicy(10, 100, 2);
  const cases = [
    { size: NaN, elapsedMs: 0, boundary: 'size' },
    { size: -1, elapsedMs: 0, boundary: 'size' },
    { size: -Infinity, elapsedMs: 0, boundary: 'size' },
    { size: 1, elapsedMs: NaN, boundary: 'timeout' },
    { size: 1, elapsedMs: -1, boundary: 'timeout' },
    { size: 1, elapsedMs: -Infinity, boundary: 'timeout' },
  ] as const;
  for (const entry of cases) {
    const mockFetch = () => ({ content: 'must-not-be-delivered', size: entry.size, elapsedMs: entry.elapsedMs });
    for (const outcome of [
      capability.auditFetch(sourceUrl, policy, mockFetch, [], 123),
      capability.serverSideFetch(sourceUrl, policy, mockFetch, 123),
    ]) {
      assert.equal(outcome.result.kind, 'refusal');
      if (outcome.result.kind !== 'refusal') assert.fail('invalid metadata reached success');
      assert.equal(outcome.result.refusal.boundary, entry.boundary);
      assert.equal(outcome.audit.length, 1);
      assert.equal(outcome.audit[0]!.boundary, entry.boundary);
      assert.equal(outcome.audit[0]!.timestamp, 123);
      assert(!JSON.stringify(outcome).includes('must-not-be-delivered'));
    }
  }
});

test('remote_asset_measurements_fetch_preserves_omission_bounds_and_refusal_order', () => {
  const policy = capability.createPolicy(10, 100, 2);
  for (const response of [
    { content: 'ok', size: 10, elapsedMs: 100 },
    { content: 'ok', size: 0, elapsedMs: 0 },
    { content: 'ok', size: 9.5, elapsedMs: 99.5 },
    { content: 'ok', size: 1 },
  ]) {
    const outcome = capability.auditFetch(sourceUrl, policy, () => response);
    assert.equal(outcome.result.kind, 'success');
    if (outcome.result.kind !== 'success') assert.fail('finite admitted response refused');
    assert.equal(outcome.result.content, 'ok');
    assert.equal(outcome.result.bytes, response.size);
  }
  const sizeFirst = capability.auditFetch(sourceUrl, policy, () => ({ content: 'x', size: 11, elapsedMs: NaN }));
  assert.equal(sizeFirst.result.kind, 'refusal');
  if (sizeFirst.result.kind !== 'refusal') assert.fail('oversized response admitted');
  assert.equal(sizeFirst.result.refusal.boundary, 'size');
  assert.match(sizeFirst.result.refusal.reason, /Response size 11 exceeds maximum 10/);
  const timeout = capability.auditFetch(sourceUrl, policy, () => ({ content: 'x', size: 1, elapsedMs: 101 }));
  assert.equal(timeout.result.kind, 'refusal');
  if (timeout.result.kind !== 'refusal') assert.fail('late response admitted');
  assert.equal(timeout.result.refusal.boundary, 'timeout');
});
