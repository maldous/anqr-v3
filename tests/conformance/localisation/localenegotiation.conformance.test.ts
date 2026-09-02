import assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/localisation/localenegotiation.ts";

test("localenegotiationcontracts", () => {
  assert.deepEqual(capability.negotiateLocale('en'), { status: 'success', locale: 'en', resolvedBy: 'explicit' });
  assert.deepEqual(capability.negotiateLocale(undefined, 'fr'), { status: 'success', locale: 'fr', resolvedBy: 'stored' });
  assert.deepEqual(capability.negotiateLocale(undefined, undefined, ['fr-CA']), { status: 'success', locale: 'fr', resolvedBy: 'alias' });
  assert.deepEqual(capability.negotiateLocale(), { status: 'success', locale: 'en', resolvedBy: 'source' });
});

test("localenegotiationerrormodel", () => {
  assert.deepEqual(capability.negotiateLocale('it'), { status: 'failure', locale: 'en', reason: 'unsupported', original: 'it' });
  assert.deepEqual(capability.negotiateLocale(''), { status: 'failure', locale: 'en', reason: 'malformed', original: '' });
});

test("localenegotiationstatemodel", () => {
  assert.deepEqual(capability.negotiateLocale('en'), capability.negotiateLocale('en'));
  assert.deepEqual(capability.negotiateLocale(undefined, 'fr'), capability.negotiateLocale(undefined, 'fr'));
  assert.deepEqual(capability.negotiateLocale(undefined, undefined, ['fr-CA']), capability.negotiateLocale(undefined, undefined, ['fr-CA']));
  assert.deepEqual(capability.negotiateLocale(), capability.negotiateLocale());
});

test("localenegotiationvalidation", () => {
  assert.deepEqual(capability.validateNegotiation('es'), { status: 'success', locale: 'es', resolvedBy: 'explicit' });
  assert.deepEqual(capability.validateNegotiation(undefined, 'es'), { status: 'success', locale: 'es', resolvedBy: 'stored' });
  assert.deepEqual(capability.validateNegotiation(undefined, undefined, ['es']), { status: 'success', locale: 'en', resolvedBy: 'source' });
  assert.deepEqual(capability.validateNegotiation(undefined, undefined, ['fr-CA']), { status: 'success', locale: 'fr', resolvedBy: 'alias' });
});