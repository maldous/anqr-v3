import assert from 'node:assert/strict';
import test from 'node:test';
import * as capability from '../../../src/capabilities/localisation/interfacelocalisation.ts';

test('interfacelocalisationcontracts', () => {
  const enLocale = capability.createLocale(
    'en',
    'English',
    'English',
    capability.DIRECTION_LTR,
    [{ key: 'greeting', value: 'Hello' }]
  );
  assert.equal(enLocale.code, 'en');
  assert.equal(enLocale.englishName, 'English');
  assert.equal(enLocale.nativeName, 'English');
  assert.equal(enLocale.direction, 'ltr');

  const esLocale = capability.createLocale(
    'es',
    'Spanish',
    'Español',
    capability.DIRECTION_LTR,
    [{ key: 'greeting', value: 'Hola' }]
  );

  const state = capability.createInitialLocalisationState([enLocale, esLocale], 'es');
  const result = capability.resolveString(state, 'greeting');
  assert.equal(result.resolved, 'Hola');
  assert.equal(result.missing, false);
});

test('interfacelocalisationerrormodel', () => {
  const enLocale = capability.createLocale(
    'en',
    'English',
    'English',
    capability.DIRECTION_LTR,
    [{ key: 'foo', value: 'Bar' }]
  );
  const esLocale = capability.createLocale(
    'es',
    'Spanish',
    'Español',
    capability.DIRECTION_LTR,
    []
  );
  const state = capability.createInitialLocalisationState([enLocale, esLocale], 'es');
  const result = capability.resolveString(state, 'foo');
  assert.equal(result.resolved, 'Bar');
  assert.equal(result.missing, true);
  assert.notEqual(result.resolved, 'foo');
  assert.notEqual(result.resolved, '');

  const state2 = capability.createInitialLocalisationState([enLocale, esLocale], 'es');
  assert.throws(() => capability.resolveString(state2, 'nonexistent'), /Key "nonexistent" not found/);
});

test('interfacelocalisationstatemodel', () => {
  const enLocale = capability.createLocale(
    'en',
    'English',
    'English',
    capability.DIRECTION_LTR,
    [{ key: 'greeting', value: 'Hello' }]
  );
  const esLocale = capability.createLocale(
    'es',
    'Spanish',
    'Español',
    capability.DIRECTION_LTR,
    [{ key: 'greeting', value: 'Hola' }]
  );
  let state = capability.createInitialLocalisationState([enLocale, esLocale], 'en');
  let resolved = capability.resolveString(state, 'greeting');
  assert.equal(resolved.resolved, 'Hello');

  state = capability.setActiveLocale(state, 'es');
  resolved = capability.resolveString(state, 'greeting');
  assert.equal(resolved.resolved, 'Hola');

  const active = capability.getActiveLocale(state);
  assert.equal(active.code, 'es');
});

test('interfacelocalisationuisemantics', () => {
  const enLocale = capability.createLocale('en', 'English', 'English', capability.DIRECTION_LTR, []);
  const esLocale = capability.createLocale('es', 'Spanish', 'Español', capability.DIRECTION_LTR, []);
  const frLocale = capability.createLocale('fr', 'French', 'Français', capability.DIRECTION_LTR, []);
  const state = capability.createInitialLocalisationState([enLocale, esLocale, frLocale], 'en');
  const sorted = capability.getLocalesByNativeName(state);
  assert.equal(sorted.length, 3);
  assert.equal(sorted[0].code, 'en');
  assert.equal(sorted[1].code, 'es');
  assert.equal(sorted[2].code, 'fr');
});

test('interfacelocalisationvalidation', () => {
  const validLocale = capability.createLocale('en', 'English', 'English', capability.DIRECTION_LTR, [{ key: 'ok', value: 'Good' }]);
  let result = capability.validateLocale(validLocale);
  assert.equal(result.success, true);

  const rawKeyLocale = capability.createLocale('en', 'English', 'English', capability.DIRECTION_LTR, [{ key: 'raw', value: 'raw' }]);
  result = capability.validateLocale(rawKeyLocale);
  if (result.success) {
    assert.fail('Expected validation failure for raw key');
  } else {
    assert.ok(result.error.includes('Raw key'));
  }

  const unmatchedLocale = capability.createLocale('en', 'English', 'English', capability.DIRECTION_LTR, [{ key: 'unmatched', value: 'Hello {0' }]);
  result = capability.validateLocale(unmatchedLocale);
  if (result.success) {
    assert.fail('Expected validation failure for unmatched braces');
  } else {
    assert.ok(result.error.includes('Unmatched braces'));
  }

  const duplicateLocale = capability.createLocale('en', 'English', 'English', capability.DIRECTION_LTR, [{ key: 'dup', value: '{0}{0}' }]);
  result = capability.validateLocale(duplicateLocale);
  if (result.success) {
    assert.fail('Expected validation failure for duplicate placeholder');
  } else {
    assert.ok(result.error.includes('Duplicate placeholder'));
  }

  const state = capability.createInitialLocalisationState([validLocale, rawKeyLocale], 'en');
  const allResult = capability.validateAllLocales(state);
  if (allResult.success) {
    assert.fail('Expected validation failure for all locales');
  } else {
    assert.ok(allResult.error.includes('Raw key'));
  }
});