import test from 'node:test';
import assert from 'node:assert/strict';
import * as capability from '../../../src/capabilities/enterprise/programmaticgeneration.ts';

import { architectureReport, distMain, facetVerdict, runScript } from "../architecture-verdict.ts";


test('programmaticgenerationauditmodel', () => {
  const initialState = capability.createAuditState();
  const now = Date.now();
  const auditResult = capability.auditInvocation(initialState, capability.incrementAudit, now);
  assert.ok(auditResult.success);
  if (auditResult.success) {
    assert.strictEqual(auditResult.state.counted, true);
    assert.strictEqual(auditResult.state.invocations, 1);
    assert.ok(!('payload' in auditResult.state));
  }
  assert.strictEqual(initialState.invocations, 0);
});

test('programmaticgenerationcontracts', () => {
  const httpInvocation: capability.ProgrammaticInvocation = {
    surfaceId: 'pg-http-invoke',
    capabilityId: 'invoke',
    input: { test: 'data' },
    nonce: 'http-nonce'
  };
  const now = Date.now();
  const httpResult1 = capability.invokeHttpSurface(httpInvocation, now);
  const httpResult2 = capability.invokeHttpSurface(httpInvocation, now);
  assert.ok(httpResult1.success);
  assert.ok(httpResult2.success);
  if (httpResult1.success && httpResult2.success) {
    assert.strictEqual(httpResult1.surfaceId, 'pg-http-invoke');
    assert.strictEqual(httpResult1.capabilityId, 'invoke');
    assert.strictEqual(httpResult1.nonce, 'http-nonce');
    assert.deepStrictEqual(httpResult1.payload, { test: 'data' });
    assert.strictEqual(httpResult1.issuedAt, now);
    assert.strictEqual(httpResult1.surfaceId, httpResult2.surfaceId);
    assert.strictEqual(httpResult1.capabilityId, httpResult2.capabilityId);
    assert.strictEqual(httpResult1.nonce, httpResult2.nonce);
    assert.deepStrictEqual(httpResult1.payload, httpResult2.payload);
    assert.strictEqual(httpResult1.issuedAt, httpResult2.issuedAt);
  }

  const mcpInvocation: capability.ProgrammaticInvocation = {
    surfaceId: 'pg-mcp-invoke',
    capabilityId: 'invoke',
    input: { test: 'mcp' },
    nonce: 'mcp-nonce'
  };
  const mcpResult1 = capability.invokeMcpSurface(mcpInvocation, now);
  const mcpResult2 = capability.invokeMcpSurface(mcpInvocation, now);
  assert.ok(mcpResult1.success);
  assert.ok(mcpResult2.success);
  if (mcpResult1.success && mcpResult2.success) {
    assert.strictEqual(mcpResult1.surfaceId, 'pg-mcp-invoke');
    assert.strictEqual(mcpResult1.capabilityId, 'invoke');
    assert.strictEqual(mcpResult1.nonce, 'mcp-nonce');
    assert.deepStrictEqual(mcpResult1.payload, { test: 'mcp' });
    assert.strictEqual(mcpResult1.issuedAt, now);
    assert.strictEqual(mcpResult1.surfaceId, mcpResult2.surfaceId);
    assert.strictEqual(mcpResult1.capabilityId, mcpResult2.capabilityId);
    assert.strictEqual(mcpResult1.nonce, mcpResult2.nonce);
    assert.deepStrictEqual(mcpResult1.payload, mcpResult2.payload);
    assert.strictEqual(mcpResult1.issuedAt, mcpResult2.issuedAt);
  }
});

test('programmaticgenerationerrormodel', () => {
  const perimeterState = capability.createPerimeterState(2, 60000);
  const now = Date.now();
  const auditFn = capability.incrementAudit;

  let state = perimeterState;
  let res = capability.evaluatePerimeter(state, now, auditFn);
  assert.ok(res.success);
  if (res.success) {
    state = res.state;
    assert.strictEqual(state.observed.length, 1);
  }

  res = capability.evaluatePerimeter(state, now, auditFn);
  assert.ok(res.success);
  if (res.success) {
    state = res.state;
    assert.strictEqual(state.observed.length, 2);
  }

  res = capability.evaluatePerimeter(state, now, auditFn);
  assert.ok(!res.success);
  if (!res.success) {
    assert.strictEqual(res.error.code, capability.ERROR_CODE_RATE_LIMIT_EXCEEDED);
    assert.strictEqual(state.observed.length, 2);
  }
});

test('programmaticgenerationreadinessmodel', () => {
  const validState = capability.createReadinessState();
  const validResult = capability.evaluateReadiness(validState);
  assert.ok(validResult.success);

  const invalidState1: capability.ReadinessState = {
    ...validState,
    servedSurfaceIds: validState.servedSurfaceIds.filter(id => id !== 'pg-http-invoke')
  };
  const invalidResult1 = capability.evaluateReadiness(invalidState1);
  assert.ok(!invalidResult1.success);
  if (!invalidResult1.success) {
    assert.strictEqual(invalidResult1.error.code, capability.ERROR_CODE_READINESS_MISMATCH);
  }

  const invalidState2: capability.ReadinessState = {
    ...validState,
    advertisedCapabilityIds: validState.advertisedCapabilityIds.filter(id => id !== 'invoke')
  };
  const invalidResult2 = capability.evaluateReadiness(invalidState2);
  assert.ok(!invalidResult2.success);
  if (!invalidResult2.success) {
    assert.strictEqual(invalidResult2.error.code, capability.ERROR_CODE_READINESS_MISMATCH);
  }
});

test('programmaticgenerationvalidation', () => {
  const invocations: capability.ProgrammaticInvocation[] = [
    { surfaceId: 'pg-http-invoke', capabilityId: 'invoke', input: { key: 'value' }, nonce: 'stable-nonce' },
    { surfaceId: 'pg-http-invoke', capabilityId: 'invoke', input: { key: 'value' }, nonce: 'stable-nonce' }
  ];
  const now = Date.now();
  const results = capability.exerciseRepeatedInvocation(invocations, now, capability.incrementAudit);
  assert.strictEqual(results.length, 2);
  for (const result of results) {
    assert.ok(result.success);
  }
  for (let i = 1; i < results.length; i++) {
    const stable = capability.assertStableStructure(results[0], results[i]);
    assert.ok(stable);
  }
});
test("architecturedependencydirection", () => {
  // Layer edges run one way. A programmatic surface that reached backwards
  // would make the same capability behave differently per caller.
  const { verdict, findings } = facetVerdict("architecturedependencydirection");
  assert.deepEqual(findings, [], "a forbidden layer edge would appear here");
  assert.equal(verdict, "satisfied");
});

test("architectureimportsresolve", () => {
  // Every relative import resolves. An unresolvable one is a runtime failure
  // that a type check alone can miss.
  const { verdict, findings } = facetVerdict("architectureimportsresolve");
  assert.deepEqual(findings, [], "an unresolvable relative specifier would appear here");
  assert.equal(verdict, "satisfied");
  assert.ok(architectureReport().sourceFileCount > 100, "the check must have enumerated the tree, not an empty set");
});

test("architecturenodependencycycles", () => {
  // No module cycle. A cycle makes initialisation order load-bearing, which
  // is the kind of dependency nobody declares and everybody trips over.
  const { verdict, findings } = facetVerdict("architecturenodependencycycles");
  assert.deepEqual(findings, [], "a cycle would appear here");
  assert.equal(verdict, "satisfied");
});

test("architectureportimplementationconformance", () => {
  // Every declared port has an adapter that imports its contract and exports
  // an annotated binding, so the type checker decides conformance.
  const { verdict, findings } = facetVerdict("architectureportimplementationconformance");
  assert.deepEqual(findings, [], "a missing, empty or bypassing adapter would appear here");
  assert.equal(verdict, "satisfied");
});
