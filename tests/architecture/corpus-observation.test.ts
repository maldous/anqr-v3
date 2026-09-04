import assert from "node:assert/strict";
import test from "node:test";

import { createArtefactProducer } from "../../packages/artefact/src/application/produce-artefact.ts";
import { createPixelSurface } from "../../packages/artefact/src/adapters/pixel-surface.ts";
import { svgContainer } from "../../packages/artefact/src/adapters/svg-container.ts";
import { fixedClock } from "../../packages/artefact/src/adapters/system-clock.ts";
import { architectureReport, facetVerdict } from "../conformance/architecture-verdict.ts";

/**
 * The corpus observation procedure for ANQR's architecture requirements.
 *
 * These requirements are stated over a corpus -- "the product source contains
 * no dependency cycle", "every import resolves" -- and a corpus is not a
 * behaviour of any one capability module. A per-capability conformance test
 * cannot evidence one: the only admissible shape there is to call an export
 * and assert on what it returned, and no export of one module knows what the
 * other modules import. That is why fifteen of these sat BLOCKED through five
 * repair rounds each. The requested artefact was impossible, not merely
 * unwritten.
 *
 * So the observation is made at the scope the requirement is stated at. Each
 * subtest below is named for exactly one requirement and runs the mechanism
 * that decides it over the real tree. One subtest, one requirement, no
 * restatement: the checker computes a verdict from the corpus and this asserts
 * that verdict is "satisfied" with no findings, so a real violation fails here
 * rather than being described.
 *
 * Deterministic artefact production is decided here too, and by producing the
 * artefact rather than by inspecting anything. It was grouped with the
 * requirements needing a child process on the assumption that determinism
 * meant repeating the build; it does not. Artefact production is a library
 * call with an injectable clock, so the honest check is to produce one
 * specification twice in this process and compare the bytes.
 *
 * Two architecture requirements are absent because they need a child process:
 * static type correctness needs the compiler and build correctness needs the
 * declared build, while this procedure executes inside a confinement that
 * grants no child-process allowance, by design. They are undecided by this
 * procedure rather than quietly passed. Locale parity is absent for a
 * different and more important reason -- it is required and unrealised, so a
 * subtest asserting it would be the one thing this exercise forbids.
 */

/** Every requirement this procedure decides, asserted the same way. */
const decided = [
  "architecturedeclareddependenciesagree",
  "architecturedependencydirection",
  "architecturedomainhasnoruntimedependency",
  "architectureexperiencetraceability",
  "architectureframeworkisolation",
  "architectureimportsresolve",
  "architecturenodependencycycles",
  "architectureportimplementationconformance",
] as const;

for (const facet of decided) {
  test(facet, () => {
    const observed = facetVerdict(facet);
    // The findings come first: an empty verdict string tells you nothing about
    // what broke, and the findings name the exact files.
    assert.deepStrictEqual(observed.findings, [], `${facet} reported findings: ${JSON.stringify(observed.findings)}`);
    assert.strictEqual(observed.verdict, "satisfied");
  });
}

test("the observed corpus is the real one and is fully accounted for", () => {
  const report = architectureReport();
  // A procedure that observed nothing would pass every requirement above
  // vacuously, so the size of what it looked at is itself asserted.
  assert.ok(report.sourceFileCount > 0, "the checker enumerated no source files");
  assert.strictEqual(report.assignedFileCount + report.declaredExcludedFiles.length, report.sourceFileCount);
  assert.deepStrictEqual(report.unaccountedFiles, []);
  assert.strictEqual(report.blockingViolationCount, 0);
});

test("architecturedeterministicartefact", async () => {
  // Determinism is a property of production, so this produces rather than
  // inspects: the same specification twice, through the same producer, with a
  // fixed clock so that a real nondeterminism cannot hide behind the time.
  const specification = {
    payload: "https://anqr.link/deterministic", errorCorrectionLevel: "M", outputFormat: "svg",
  } as const;
  const producer = createArtefactProducer({
    containerFor: () => svgContainer, surfaceFor: createPixelSurface, clock: fixedClock(1_700_000_000_000),
  });
  const first = await producer.produce(specification);
  const second = await producer.produce(specification);
  assert.equal(first.ok && second.ok, true, "the specification must produce an artefact at all");
  if (!first.ok || !second.ok) return;
  const left = await producer.exportArtefact(first.artefact);
  const right = await producer.exportArtefact(second.artefact);
  assert.equal(left.ok && right.ok, true, "the artefact must export at all");
  if (!left.ok || !right.ok) return;
  assert.deepEqual([...left.bytes], [...right.bytes], "the same specification produced different bytes");
});
