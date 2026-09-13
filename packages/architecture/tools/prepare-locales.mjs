// Prepare a resource for every locale the product claims.
//
// The claimed denominator comes from packages/architecture/locales.json, which
// is projected out of the semantic graph. Preparation writes the reference key
// set into every other locale with no value against any key, so a translator
// has somewhere to work and a checker can see that nothing is filled yet.
// Existing translations are preserved; keys the reference has dropped are
// dropped, because a stale key is not coverage. No value is ever invented.
//
//   node packages/architecture/tools/prepare-locales.mjs [--check]
//
// With --check it writes nothing and exits non-zero if preparation would
// change any resource, which is how the drift test uses it.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const localesDir = join(root, "src/capabilities/localisation/locales");
const registry = JSON.parse(readFileSync(join(root, "packages/architecture/locales.json"), "utf8"));
const reference = JSON.parse(readFileSync(join(localesDir, `${registry.referenceCode}.json`), "utf8"));
const referenceKeys = Object.keys(reference.translations).sort();
const check = process.argv.includes("--check");

if (referenceKeys.length === 0) throw new Error("LOCALE_REFERENCE_EMPTY");
for (const key of referenceKeys) {
  const value = reference.translations[key];
  if (typeof value !== "string" || value === "") throw new Error(`LOCALE_REFERENCE_UNTRANSLATED:${key}`);
}

mkdirSync(localesDir, { recursive: true });
const changed = [];
for (const locale of registry.locales) {
  if (locale.code === registry.referenceCode) continue;
  const path = join(localesDir, `${locale.code}.json`);
  const existing = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
  const translations = {};
  for (const key of referenceKeys) {
    const carried = existing?.translations?.[key];
    translations[key] = typeof carried === "string" && carried !== "" ? carried : null;
  }
  const next = `${JSON.stringify({ code: locale.code, direction: locale.direction, translations }, null, 2)}\n`;
  if (!existsSync(path) || readFileSync(path, "utf8") !== next) {
    changed.push(locale.code);
    if (!check) writeFileSync(path, next);
  }
}

const unexpected = readdirSync(localesDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.slice(0, -5))
  .filter((code) => !registry.locales.some((locale) => locale.code === code));

const result = {
  schema: "urn:anqr:locale-preparation:1",
  mode: check ? "check" : "prepare",
  referenceCode: registry.referenceCode,
  referenceKeyCount: referenceKeys.length,
  claimedLocaleCount: registry.locales.length,
  changed,
  unclaimedResources: unexpected,
  nonClaims: [
    "A prepared locale carries the reference key set and no translated value. It is untranslated, not satisfied.",
    "No value is generated to close a count; an untranslated key stays null so the gap stays visible.",
    "This tool makes no claim about any legacy translation corpus, which remains legacy evidence.",
  ],
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (unexpected.length > 0) process.exit(1);
if (check && changed.length > 0) process.exit(1);
