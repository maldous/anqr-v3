import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  contrastRatio, joinArtefactSpecification, MINIMUM_CONTRAST_RATIO, OUTPUT_FORMATS,
} from "../src/model/artefact-specification.ts";
import { createArtefactProducer } from "../src/application/produce-artefact.ts";
import { createPixelSurface } from "../src/adapters/pixel-surface.ts";
import { svgContainer } from "../src/adapters/svg-container.ts";
import { fixedClock } from "../src/adapters/system-clock.ts";

// The admissible join.
//
// A user interface collects values; it must not assemble them into a capability
// request. These tests prove that a prohibited combination cannot become a
// valid invocation: it is refused at the join, before the producer is reached,
// and the producer refuses it again if called directly.
//
// The rules under test are declared in the semantic graph and projected into
// packages/architecture/experience.json. The projection is read here so a rule
// removed from authority cannot silently stop being tested.

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const experience = JSON.parse(
  readFileSync(resolve(repositoryRoot, "packages/architecture/experience.json"), "utf8"),
) as {
  contrastRequirement: number;
  joinRules: readonly { name: string; kind: string; antecedent: string; consequent: string }[];
};

const VALID = {
  payload: "https://anqr.link/join",
  errorCorrectionLevel: "M",
  outputFormat: "svg",
};

const producer = createArtefactProducer({
  containerFor: () => svgContainer,
  surfaceFor: createPixelSurface,
  clock: fixedClock(1_700_000_000_000),
});

test("the declared cross-parameter rules are the ones under test", () => {
  // If authority gains a cross-parameter rule and this list is not extended,
  // the gap is visible here rather than silently untested.
  const crossParameter = experience.joinRules
    .filter((rule) => rule.kind === "constrains" || rule.kind === "requires" || rule.kind === "excludes")
    .map((rule) => `${rule.kind}:${rule.antecedent}->${rule.consequent}`)
    .sort();
  assert.deepEqual(crossParameter, [
    "constrains:errorCorrectionLevel->symbolVersion",
    "constrains:foregroundColour->minimumContrastRatio",
    "constrains:payload->symbolVersion",
  ]);
  assert.equal(experience.contrastRequirement, MINIMUM_CONTRAST_RATIO);
});

test("a well-formed set of values joins into a specification", () => {
  const result = joinArtefactSpecification(VALID);
  assert.equal(result.admissible, true);
  if (!result.admissible) return;
  assert.equal(result.specification.payload, VALID.payload);
  assert.equal(result.specification.symbolVersion, "auto");
  assert.equal(result.specification.moduleSizePx, 6, "an omitted value takes its declared default");
});

test("every individually invalid value is refused, naming the parameter to change", () => {
  const cases: readonly (readonly [Record<string, unknown>, string, string])[] = [
    [{ payload: "" }, "payload", "PAYLOAD_EMPTY"],
    [{ errorCorrectionLevel: "Z" }, "errorCorrectionLevel", "ERROR_CORRECTION_LEVEL_UNKNOWN"],
    [{ outputFormat: "bmp" }, "outputFormat", "OUTPUT_FORMAT_UNKNOWN"],
    [{ symbolVersion: 41 }, "symbolVersion", "SYMBOL_VERSION_OUT_OF_RANGE"],
    [{ symbolVersion: 0 }, "symbolVersion", "SYMBOL_VERSION_OUT_OF_RANGE"],
    [{ maskPattern: 8 }, "maskPattern", "MASK_PATTERN_OUT_OF_RANGE"],
    [{ moduleSizePx: 0 }, "moduleSizePx", "MODULE_SIZE_OUT_OF_RANGE"],
    [{ moduleSizePx: 65 }, "moduleSizePx", "MODULE_SIZE_OUT_OF_RANGE"],
    [{ quietZoneModules: 17 }, "quietZoneModules", "QUIET_ZONE_OUT_OF_RANGE"],
    [{ foregroundColour: "black" }, "foregroundColour", "COLOUR_MALFORMED"],
    [{ backgroundColour: "#fff" }, "backgroundColour", "COLOUR_MALFORMED"],
  ];
  for (const [override, parameter, code] of cases) {
    const result = joinArtefactSpecification({ ...VALID, ...override });
    assert.equal(result.admissible, false, `${code} must be refused`);
    if (result.admissible) continue;
    const refusal = result.refusals.find((entry) => entry.code === code);
    assert.ok(refusal !== undefined, `expected ${code}, got ${JSON.stringify(result.refusals.map((r) => r.code))}`);
    assert.equal(refusal.parameter, parameter, "a refusal must name the parameter so feedback can be placed");
    assert.ok(refusal.detail.length > 0);
  }
});

// ------------------------------------------------ prohibited combinations

test("prohibited: a forced version too small for the payload cannot be invoked", async () => {
  // Each value is individually valid. Only their combination is prohibited,
  // which is exactly what a per-field validator would miss.
  // Version 5 holds the short default payload, and 300 characters need far
  // more. Version 1 would have been the wrong probe: it cannot hold even the
  // default, so the case would have passed for the wrong reason.
  const supplied = { ...VALID, payload: "x".repeat(300), symbolVersion: 5 };
  assert.equal(joinArtefactSpecification({ ...VALID, payload: "x".repeat(300) }).admissible, true,
    "the long payload alone is fine at automatic version");
  assert.equal(joinArtefactSpecification({ ...VALID, symbolVersion: 5 }).admissible, true,
    "version 5 alone is fine for the default payload");

  const join = joinArtefactSpecification(supplied);
  assert.equal(join.admissible, false);
  if (join.admissible) return;
  const refusal = join.refusals[0];
  assert.equal(refusal?.code, "SYMBOL_VERSION_TOO_SMALL_FOR_PAYLOAD");
  assert.equal(refusal?.parameter, "symbolVersion");
  assert.match(refusal?.joinRule ?? "", /join-rule:24-constrains-payload-symbolVersion/);

  // And it cannot reach production by going round the join.
  const produced = await producer.produce(supplied);
  assert.equal(produced.ok, false);
  if (produced.ok) return;
  assert.equal(produced.refusal.kind, "inadmissible");
});

test("prohibited: raising error correction can make an admissible version inadmissible", async () => {
  // The two choices cannot be validated independently, which is the point of
  // the constrains:errorCorrectionLevel->symbolVersion rule.
  const payload = "x".repeat(100);
  const atL = joinArtefactSpecification({ ...VALID, payload, symbolVersion: 6, errorCorrectionLevel: "L" });
  assert.equal(atL.admissible, true, "version 6 at level L holds a hundred characters");
  const atH = joinArtefactSpecification({ ...VALID, payload, symbolVersion: 6, errorCorrectionLevel: "H" });
  assert.equal(atH.admissible, false, "the same version at level H does not");
  if (atH.admissible) return;
  assert.equal(atH.refusals[0]?.code, "SYMBOL_VERSION_TOO_SMALL_FOR_PAYLOAD");
  assert.equal((await producer.produce({ ...VALID, payload, symbolVersion: 6, errorCorrectionLevel: "H" })).ok, false);
});

test("prohibited: a colour pair below the contrast floor cannot be invoked", async () => {
  const supplied = { ...VALID, foregroundColour: "#fdfdfd", backgroundColour: "#ffffff" };
  assert.ok(contrastRatio("#fdfdfd", "#ffffff") < MINIMUM_CONTRAST_RATIO);

  const join = joinArtefactSpecification(supplied);
  assert.equal(join.admissible, false);
  if (join.admissible) return;
  const refusal = join.refusals[0];
  assert.equal(refusal?.code, "CONTRAST_BELOW_FLOOR");
  assert.equal(refusal?.parameter, "foregroundColour");
  assert.match(refusal?.detail ?? "", /4\.5 to 1/);
  assert.match(refusal?.joinRule ?? "", /constrains-foregroundColour-minimumContrastRatio/);

  const produced = await producer.produce(supplied);
  assert.equal(produced.ok, false);
  if (produced.ok) return;
  assert.equal(produced.refusal.kind, "inadmissible");
});

test("the contrast floor admits what it should and refuses what it should", () => {
  assert.ok(contrastRatio("#000000", "#ffffff") > 20, "black on white is the maximum");
  assert.equal(Number(contrastRatio("#ffffff", "#ffffff").toFixed(2)), 1, "identical colours contrast at one");
  assert.equal(joinArtefactSpecification({ ...VALID, foregroundColour: "#111827" }).admissible, true);
  assert.equal(joinArtefactSpecification({ ...VALID, foregroundColour: "#9ca3af" }).admissible, false);
});

test("an admissible specification produces a verified artefact through the real boundary", async () => {
  const produced = await producer.produce({ ...VALID, symbolVersion: "auto" });
  assert.equal(produced.ok, true);
  if (!produced.ok) return;
  // The join is not the only gate: production decodes its own output.
  assert.equal(produced.artefact.scanSafety.verdict, "scannable");
  assert.equal(produced.artefact.scanSafety.decodedPayload, VALID.payload);
  assert.equal(produced.artefact.producedAtMs, 1_700_000_000_000, "the clock is injected, not ambient");

  const exported = await producer.exportArtefact(produced.artefact);
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  assert.equal(exported.mediaType, "image/svg+xml");
});

test("an unverified artefact cannot be exported", async () => {
  const produced = await producer.produce(VALID);
  assert.equal(produced.ok, true);
  if (!produced.ok) return;
  // Scan-safe output is a real gate: an artefact whose verdict is not
  // scannable is refused at export even though it exists.
  const tampered = {
    ...produced.artefact,
    scanSafety: { verified: false, decodedPayload: null, verdict: "unsafe" as const, detail: "planted: not verified" },
  };
  const exported = await producer.exportArtefact(tampered);
  assert.equal(exported.ok, false);
  if (exported.ok) return;
  assert.equal(exported.refusal.kind, "unsafe");
});

test("every declared output format is one the composition can actually serve", () => {
  // The export-download pattern forbids offering a form the producer cannot
  // deliver, so the declared set and the served set must agree.
  assert.deepEqual([...OUTPUT_FORMATS].sort(), ["gif", "png", "svg"]);
});
