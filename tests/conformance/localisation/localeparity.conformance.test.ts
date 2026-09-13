import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assessLocaleParity, prepareAllLocales, prepareLocaleResource, readLocaleRegistry,
  type LocaleRegistry, type LocaleResource,
} from '../../../src/capabilities/localisation/localeparity.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const localesDir = join(root, 'src/capabilities/localisation/locales');
const registry = readLocaleRegistry(JSON.parse(readFileSync(join(root, 'packages/architecture/locales.json'), 'utf8')));
const reference = JSON.parse(readFileSync(join(localesDir, `${registry.referenceCode}.json`), 'utf8')) as LocaleResource;

function allResources(): LocaleResource[] {
  return readdirSync(localesDir)
    .filter((name) => name.endsWith('.json') && name !== `${registry.referenceCode}.json`)
    .map((name) => JSON.parse(readFileSync(join(localesDir, name), 'utf8')) as LocaleResource);
}

const locale = (code: string, direction: 'ltr' | 'rtl', translations: Record<string, string | null>): LocaleResource =>
  ({ code, direction, translations });

test('every claimed locale is prepared, and the denominator is the graph\'s', () => {
  const resources = allResources();
  assert.equal(registry.locales.length, 86, 'the graph claims 86 locales');
  assert.equal(resources.length + 1, registry.locales.length, 'every claimed locale has a resource');
  const codes = new Set(resources.map((resource) => resource.code));
  for (const claimed of registry.locales) {
    if (claimed.code === registry.referenceCode) continue;
    assert.ok(codes.has(claimed.code), `claimed locale has no prepared resource: ${claimed.code}`);
  }
});

test('every prepared resource carries the reference key set exactly', () => {
  const report = assessLocaleParity(registry, reference, allResources());
  assert.deepEqual(report.refusals, []);
  assert.equal(report.referenceKeyCount, Object.keys(reference.translations).length);
  const offKeySet = report.verdicts.filter((verdict) =>
    verdict.state !== 'reference' && (verdict.missingKeys.length > 0 || verdict.unknownKeys.length > 0));
  assert.deepEqual(offKeySet.map((verdict) => verdict.code), [], 'no locale disagrees with the reference key set');
});

test('a prepared locale is reported untranslated, never satisfied', () => {
  const report = assessLocaleParity(registry, reference, allResources());
  // This is the honest state of the product today: every claimed locale is
  // ready to receive translations, and none has received any. A green count
  // here would mean the checker had been taught to lie.
  assert.equal(report.completeLocaleCount, 0, 'no locale is translated yet');
  const prepared = report.verdicts.filter((verdict) => verdict.state === 'prepared');
  assert.equal(prepared.length, registry.locales.length - 1);
  for (const verdict of prepared) assert.equal(verdict.translatedKeyCount, 0);
});

test('the reference locale is fully translated and is not compared against itself', () => {
  const report = assessLocaleParity(registry, reference, allResources());
  const verdict = report.verdicts.find((entry) => entry.code === registry.referenceCode);
  assert.equal(verdict?.state, 'reference');
  assert.equal(verdict?.translatedKeyCount, report.referenceKeyCount);
  for (const value of Object.values(reference.translations)) {
    assert.equal(typeof value, 'string');
    assert.notEqual(value, '');
  }
});

test('writing direction comes from the graph and a resource may not restate it differently', () => {
  const rtl = registry.locales.filter((entry) => entry.direction === 'rtl');
  assert.equal(rtl.length, 7, 'the graph declares seven right-to-left locales');
  for (const entry of rtl) {
    const resource = JSON.parse(readFileSync(join(localesDir, `${entry.code}.json`), 'utf8')) as LocaleResource;
    assert.equal(resource.direction, 'rtl', entry.code);
  }
  const conflicting = allResources().map((resource) =>
    resource.code === rtl[0]!.code ? { ...resource, direction: 'ltr' as const } : resource);
  const report = assessLocaleParity(registry, reference, conflicting);
  assert.ok(report.refusals.includes(`LOCALE_RESOURCE_DIRECTION_CONFLICT:${rtl[0]!.code}`));
});

test('a resource for a locale the product does not claim is refused, not counted', () => {
  const report = assessLocaleParity(registry, reference, [...allResources(), locale('zz-ZZ', 'ltr', {})]);
  assert.ok(report.refusals.includes('LOCALE_RESOURCE_UNCLAIMED:zz-ZZ'));
});

test('a duplicate resource is refused', () => {
  const resources = allResources();
  const report = assessLocaleParity(registry, reference, [...resources, resources[0]!]);
  assert.ok(report.refusals.includes(`LOCALE_RESOURCE_DUPLICATE:${resources[0]!.code}`));
});

test('a locale missing reference keys is partial, and names exactly what is missing', () => {
  const keys = Object.keys(reference.translations).sort();
  const short = locale('af', 'ltr', Object.fromEntries(keys.slice(1).map((key) => [key, null])));
  const report = assessLocaleParity(registry, reference, [short]);
  const verdict = report.verdicts.find((entry) => entry.code === 'af');
  assert.equal(verdict?.state, 'partial');
  assert.deepEqual(verdict?.missingKeys, [keys[0]!]);
});

test('a locale carrying a key the reference does not declare is partial', () => {
  const translations = Object.fromEntries(Object.keys(reference.translations).map((key) => [key, null]));
  const report = assessLocaleParity(registry, reference, [locale('af', 'ltr', { ...translations, 'stale.key': null })]);
  const verdict = report.verdicts.find((entry) => entry.code === 'af');
  assert.equal(verdict?.state, 'partial');
  assert.deepEqual(verdict?.unknownKeys, ['stale.key']);
});

test('a claimed locale with no resource at all is absent, not silently ignored', () => {
  const report = assessLocaleParity(registry, reference, []);
  const absent = report.verdicts.filter((verdict) => verdict.state === 'absent');
  assert.equal(absent.length, registry.locales.length - 1);
  assert.equal(absent[0]!.missingKeys.length, report.referenceKeyCount);
});

test('a fully translated locale reads complete', () => {
  const translations = Object.fromEntries(Object.keys(reference.translations).map((key) => [key, `x-${key}`]));
  const report = assessLocaleParity(registry, reference, [locale('af', 'ltr', translations)]);
  assert.equal(report.verdicts.find((entry) => entry.code === 'af')?.state, 'complete');
  assert.equal(report.completeLocaleCount, 1);
});

test('an empty string is not a translation', () => {
  const keys = Object.keys(reference.translations);
  const translations = Object.fromEntries(keys.map((key) => [key, key === keys[0] ? '' : `x-${key}`]));
  const report = assessLocaleParity(registry, reference, [locale('af', 'ltr', translations)]);
  const verdict = report.verdicts.find((entry) => entry.code === 'af');
  assert.equal(verdict?.state, 'partial');
  assert.equal(verdict?.translatedKeyCount, keys.length - 1);
});

test('preparation preserves an existing translation and drops a retired key', () => {
  const keys = Object.keys(reference.translations).sort();
  const existing = locale('af', 'ltr', { [keys[0]!]: 'kept', 'retired.key': 'dropped' });
  const prepared = prepareLocaleResource({ code: 'af', direction: 'ltr', reference: false }, keys, existing);
  assert.equal(prepared.translations[keys[0]!], 'kept');
  assert.equal(Object.hasOwn(prepared.translations, 'retired.key'), false);
  assert.equal(prepared.translations[keys[1]!], null);
});

test('preparing every locale covers the denominator minus the reference', () => {
  const prepared = prepareAllLocales(registry, reference);
  assert.equal(prepared.length, registry.locales.length - 1);
  assert.equal(prepared.some((resource) => resource.code === registry.referenceCode), false);
});

test('an invalid registry is refused rather than partly believed', () => {
  const base = JSON.parse(readFileSync(join(root, 'packages/architecture/locales.json'), 'utf8')) as LocaleRegistry;
  assert.throws(() => readLocaleRegistry({ ...base, schema: 'urn:anqr:locale-registry:2' }), /LOCALE_REGISTRY_SCHEMA_UNKNOWN/);
  assert.throws(() => readLocaleRegistry({ ...base, localeCount: base.localeCount + 1 }), /LOCALE_REGISTRY_COUNT_MISMATCH/);
  assert.throws(() => readLocaleRegistry({ ...base, rightToLeftCount: 0 }), /LOCALE_REGISTRY_DIRECTION_COUNT_MISMATCH/);
  assert.throws(() => readLocaleRegistry({ ...base, locales: [...base.locales, base.locales[0]!] }), /LOCALE_REGISTRY_(CODE_DUPLICATE|COUNT_MISMATCH)/);
});

test('preparation is idempotent, so the committed resources are exactly what it produces', () => {
  execFileSync(process.execPath, ['packages/architecture/tools/prepare-locales.mjs', '--check'], { cwd: root, encoding: 'utf8' });
});
