import assert from 'node:assert/strict';
import test from 'node:test';
import * as capability from '../../../src/capabilities/localisation/bidirectionaltextsupport.ts';

test("bidirectionaltextsupportcontracts", () => {
  for (const locale of capability.supportedLocales) {
    const dir = capability.localeDirection[locale];
    assert.strictEqual(dir, capability.resolveDirection(locale));
    const state = capability.createDocumentState(locale);
    assert.strictEqual(state.direction, dir);
  }
});

test("bidirectionaltextsupportstatemodel", () => {
  const audit: string[] = [];
  const auditFn = (msg: string): void => {
    audit.push(msg);
  };
  const state = capability.createDocumentState('en');
  const newState = capability.updateDocumentState(state, auditFn, 'ar');
  assert.strictEqual(newState.direction, capability.resolveDirection('ar'));
  assert.strictEqual(newState.locale, 'ar');
  assert.ok(audit.length > 0);
  const another = capability.updateDocumentState(newState, auditFn, 'he');
  assert.strictEqual(another.direction, capability.resolveDirection('he'));
});

test("bidirectionaltextsupportuisemantics", () => {
  const elements: capability.UIElement[] = [
    { type: 'navigation', content: 'Home' },
    { type: 'control', content: 'Button' },
    { type: 'content', content: 'Text' },
  ];
  const result = capability.applyDirectionToUI(elements, 'rtl');
  for (const el of result) {
    assert.strictEqual(el.direction, 'rtl');
  }
  const resultLtr = capability.applyDirectionToUI(elements, 'ltr');
  for (const el of resultLtr) {
    assert.strictEqual(el.direction, 'ltr');
  }
});

test("bidirectionaltextsupportvalidation", () => {
  const rtlLocales = ['ar', 'he', 'ur'] as const;
  for (const locale of rtlLocales) {
    const result = capability.validateRTL(locale);
    assert.strictEqual(result.status, 'success');
    if (result.status === 'success') {
      assert.strictEqual(result.direction, 'rtl');
      assert.strictEqual(result.artifact.direction, 'rtl');
      assert.strictEqual(result.artifact.content, 'RTL content example');
    }
  }
  const enResult = capability.validateRTL('en');
  assert.strictEqual(enResult.status, 'failure');
  if (enResult.status === 'failure') {
    assert.strictEqual(enResult.reason, 'not-rtl');
  }
});