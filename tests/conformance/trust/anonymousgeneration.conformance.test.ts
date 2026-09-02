import assert from 'node:assert/strict';
import test from 'node:test';
import * as capability from '../../../src/capabilities/trust/anonymousgeneration.ts';

test("anonymousgenerationauditmodel", () => {
  let audit = capability.INITIAL_AUDIT_COUNT;
  audit = capability.recordRequest(audit);
  assert.strictEqual(audit, 1);
  assert.strictEqual(capability.getAuditCount(audit), audit);
  const req: capability.AnonymousRequest = { payload: 'test' };
  const res = capability.executeAnonymousRequest(req, audit);
  assert.strictEqual(typeof res.audit, 'number');
  assert.strictEqual(res.audit, audit + 1);
});

test("anonymousgenerationcontracts", () => {
  const req: capability.AnonymousRequest = {};
  const execRes = capability.executeAnonymousRequest(req, capability.INITIAL_AUDIT_COUNT);
  assert.strictEqual(execRes.result.message, 'Anonymous request processed successfully.');
  assert.strictEqual(typeof execRes.audit, 'number');
  const valRes = capability.validateAnonymousGeneration(req, capability.INITIAL_AUDIT_COUNT);
  if (valRes.outcome !== 'success') {
    assert.fail('Expected success outcome');
  }
  assert.strictEqual(valRes.result.message, 'Anonymous request processed successfully.');
});

test("anonymousgenerationpermissions", () => {
  assert.strictEqual(capability.checkAnonymousPermissions(), true);
  const req: capability.AnonymousRequest = {};
  const res = capability.executeAnonymousRequest(req, capability.INITIAL_AUDIT_COUNT);
  assert.deepStrictEqual(Object.keys(res.result), ['message']);
});

test("anonymousgenerationvalidation", () => {
  const req: capability.AnonymousRequest = {};
  const result = capability.validateAnonymousGeneration(req, capability.INITIAL_AUDIT_COUNT);
  if (result.outcome !== 'success') {
    assert.fail('Expected success outcome');
  }
  assert.strictEqual(result.result.message, 'Anonymous request processed successfully.');
});