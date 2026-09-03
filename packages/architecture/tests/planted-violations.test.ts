import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { checkArchitecture, enumerateSources, importsOf, loadRules, type Rules } from "../src/check.ts";

// Adversarial proof for ANQR architecture enforcement.
//
// A passing checker is evidence that a checker ran. It is not evidence that an
// invariant is enforced until a violation has been planted and the checker has
// demonstrably rejected it for the intended reason.
//
// Each case follows the same shape: a known-good tree passes the facet under
// test, a prohibited condition is introduced, the facet fails with a specific
// code, the tree is restored, and the facet passes again. Controls distinguish
// the intended invariant from incidental breakage.
//
// Most cases run against a synthetic tree so the prohibited state is actually
// constructible: the real repository has no delivery layer to import from, so
// several rules could never be violated in place, and a fixture that cannot
// express the violation proves nothing. One case is planted in the real
// repository as well, to prove the same machinery sees real novelty.

const realRoot = resolve(import.meta.dirname, "../../..");

/**
 * A minimal tree that faithfully carries the declared rule structure: one
 * component per layer, at the real declared locations, so layer edges and the
 * module boundary are all expressible.
 */
function syntheticTree(): string {
  const root = mkdtempSync(join(tmpdir(), "anqr-architecture-"));
  const rules = loadRules(realRoot);
  mkdirSync(join(root, "packages/architecture"), { recursive: true });
  writeFileSync(join(root, "packages/architecture/rules.json"), JSON.stringify(rules));
  writeFileSync(join(root, "package.json"), JSON.stringify({
    name: "synthetic", private: true, type: "module",
    scripts: { typecheck: "tsc --noEmit" },
    devDependencies: {},
  }));
  writeFileSync(join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: {} }));

  // One benign module per component location, so every layer exists and the
  // known-good state is genuinely known-good.
  for (const component of rules.components) {
    mkdirSync(join(root, component.location), { recursive: true });
    writeFileSync(join(root, component.location, "index.ts"), "export const marker = 1;\n");
  }
  // Ports, so port-contract existence is satisfied in the known-good state.
  for (const port of rules.ports) {
    mkdirSync(resolve(root, port.contractLocation, ".."), { recursive: true });
    writeFileSync(resolve(root, port.contractLocation), "export interface Port { readonly marker: 1 }\n");
  }
  // A released-convention module, so the module boundary is crossable.
  mkdirSync(join(root, "src/capabilities/creation"), { recursive: true });
  writeFileSync(join(root, "src/capabilities/creation/legacy.ts"), "export const legacy = 1;\n");

  // The architecture REQUIRES adapters to depend on ports: an adapter that
  // implements no declared port has no reason to exist. So the known-good tree
  // has to satisfy that edge, or every dependency-direction case would start
  // from an already-failing state and prove nothing. The checker was right to
  // report it; the fixture was what was wrong.
  const adapters = rules.components.find((entry) => entry.layer === "adapters");
  const somePort = rules.ports[0];
  if (adapters !== undefined && somePort !== undefined) {
    const depth = adapters.location.split("/").filter(Boolean).length;
    writeFileSync(join(root, adapters.location, "index.ts"),
      `import type { Port } from "${"../".repeat(depth)}${somePort.contractLocation}";\nexport const marker: Port | 1 = 1;\n`);
  }
  return root;
}

const facet = (root: string, name: string) => {
  const report = checkArchitecture(root, loadRules(realRoot));
  const entry = report.facets.find((item) => item.facet === `architecture${name}`);
  assert.ok(entry !== undefined, `facet ${name} absent from the report`);
  return entry;
};

const codes = (root: string, name: string) => facet(root, name).findings.map((item) => item.code).sort();

const componentPath = (layer: string): string => {
  const rules = loadRules(realRoot);
  const component = rules.components.find((entry) => entry.layer === layer);
  assert.ok(component !== undefined, `no component declared in layer ${layer}`);
  return component.location;
};

/** known-good -> plant -> fail for the intended reason -> restore -> pass. */
function plantedCycle(
  name: string,
  expectedCode: string,
  plant: (root: string) => readonly string[],
): void {
  const root = syntheticTree();
  try {
    assert.deepEqual(codes(root, name), [], `${name} must pass before planting, or the case proves nothing`);
    const planted = plant(root);
    const after = codes(root, name);
    assert.ok(after.includes(expectedCode),
      `${name} must fail with ${expectedCode} after planting; got ${JSON.stringify(after)}`);
    const detail = facet(root, name).findings.find((item) => item.code === expectedCode);
    assert.ok(detail !== undefined);
    // Attribution: a finding that cannot be traced to its requirement is an
    // assurance defect, so every finding carries the facet IRI.
    assert.match(detail.facetIri, /^urn:anqr:delivery-facet:architecture/);
    for (const file of planted) rmSync(resolve(root, file), { force: true });
    assert.deepEqual(codes(root, name), [], `${name} must pass again once the violation is removed`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("planted: a domain module importing a delivery module is rejected", () => {
  plantedCycle("dependencydirection", "FORBIDDEN_LAYER_DEPENDENCY", (root) => {
    const domain = componentPath("domain");
    const delivery = componentPath("delivery");
    const file = `${domain}violation.ts`;
    const back = resolve(root, delivery, "index.ts");
    const relative = `${"../".repeat(domain.split("/").filter(Boolean).length)}${delivery}index.ts`;
    assert.ok(existsSync(back));
    writeFileSync(resolve(root, file), `import { marker } from "${relative}";\nexport const used = marker;\n`);
    return [file];
  });
});

test("planted: a component importing the released capability convention is rejected", () => {
  plantedCycle("dependencydirection", "MODULE_BOUNDARY_CROSSED", (root) => {
    const domain = componentPath("domain");
    const depth = domain.split("/").filter(Boolean).length;
    const file = `${domain}crosses-boundary.ts`;
    writeFileSync(resolve(root, file),
      `import { legacy } from "${"../".repeat(depth)}src/capabilities/creation/legacy.ts";\nexport const used = legacy;\n`);
    return [file];
  });
});

test("planted: a framework import inside an isolated layer is rejected", () => {
  plantedCycle("frameworkisolation", "FRAMEWORK_IMPORT_IN_ISOLATED_LAYER", (root) => {
    const file = `${componentPath("domain")}framework.ts`;
    writeFileSync(resolve(root, file), `import { render } from "preact";\nexport const used = render;\n`);
    return [file];
  });
});

test("planted: a third-party runtime import in the domain layer is rejected", () => {
  plantedCycle("domainhasnoruntimedependency", "THIRD_PARTY_IMPORT_IN_DOMAIN", (root) => {
    const file = `${componentPath("domain")}third-party.ts`;
    writeFileSync(resolve(root, file), `import qr from "some-qr-library";\nexport const used = qr;\n`);
    return [file];
  });
});

test("planted: a dependency cycle is rejected", () => {
  plantedCycle("nodependencycycles", "DEPENDENCY_CYCLE", (root) => {
    const domain = componentPath("domain");
    const left = `${domain}cycle-left.ts`;
    const right = `${domain}cycle-right.ts`;
    writeFileSync(resolve(root, left), `import { right } from "./cycle-right.ts";\nexport const left = right;\n`);
    writeFileSync(resolve(root, right), `import { left } from "./cycle-left.ts";\nexport const right = left;\n`);
    return [left, right];
  });
});

test("planted: an unresolvable relative import is rejected", () => {
  plantedCycle("importsresolve", "IMPORT_UNRESOLVED", (root) => {
    const file = `${componentPath("domain")}dangling.ts`;
    writeFileSync(resolve(root, file), `import { gone } from "./does-not-exist.ts";\nexport const used = gone;\n`);
    return [file];
  });
});

test("planted: an undeclared package dependency is rejected", () => {
  plantedCycle("declareddependenciesagree", "UNDECLARED_DEPENDENCY", (root) => {
    const file = `${componentPath("adapters")}undeclared.ts`;
    writeFileSync(resolve(root, file), `import sharp from "sharp";\nexport const used = sharp;\n`);
    return [file];
  });
});

test("planted: a missing lockfile is rejected", () => {
  const root = syntheticTree();
  try {
    assert.deepEqual(codes(root, "declareddependenciesagree"), []);
    rmSync(join(root, "package-lock.json"));
    assert.ok(codes(root, "declareddependenciesagree").includes("LOCKFILE_ABSENT"));
    writeFileSync(join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: {} }));
    assert.deepEqual(codes(root, "declareddependenciesagree"), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("planted: a deleted port contract is rejected", () => {
  const root = syntheticTree();
  const rules = loadRules(realRoot);
  const port = rules.ports[0] as Rules["ports"][number];
  try {
    const before = facet(root, "portimplementationconformance").findings
      .filter((item) => item.code === "PORT_CONTRACT_ABSENT");
    assert.deepEqual(before, [], "every declared port contract must exist in the known-good tree");
    const bytes = readFileSync(resolve(root, port.contractLocation), "utf8");
    rmSync(resolve(root, port.contractLocation));
    const after = facet(root, "portimplementationconformance").findings
      .filter((item) => item.code === "PORT_CONTRACT_ABSENT");
    assert.equal(after.length, 1);
    assert.equal(after[0]?.file, port.contractLocation);
    writeFileSync(resolve(root, port.contractLocation), bytes);
    assert.deepEqual(
      facet(root, "portimplementationconformance").findings.filter((item) => item.code === "PORT_CONTRACT_ABSENT"),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// -------------------------------------------------------------- blind spots

test("blind spot: discovery sees a source created since the last run", () => {
  // The Priority 1 defect in miniature. A checker that enumerated a remembered
  // set, or that only looked inside paths it had already seen, would miss a
  // newly created violating file entirely.
  const root = syntheticTree();
  try {
    const before = enumerateSources(root).length;
    const file = `${componentPath("domain")}brand-new.ts`;
    writeFileSync(resolve(root, file), `import { render } from "preact";\nexport const used = render;\n`);
    const after = enumerateSources(root);
    assert.equal(after.length, before + 1, "the newly created file must be discovered");
    assert.ok(after.includes(file));
    assert.ok(codes(root, "frameworkisolation").includes("FRAMEWORK_IMPORT_IN_ISOLATED_LAYER"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("blind spot: enumeration is recursive, so depth is not a hiding place", () => {
  const root = syntheticTree();
  try {
    const domain = componentPath("domain");
    const deep = `${domain}a/b/c/d/hidden.ts`;
    mkdirSync(resolve(root, domain, "a/b/c/d"), { recursive: true });
    writeFileSync(resolve(root, deep), `import qr from "some-qr-library";\nexport const used = qr;\n`);
    const findings = facet(root, "domainhasnoruntimedependency").findings;
    assert.equal(findings.length, 1, "a violation five directories down must still be found");
    assert.equal(findings[0]?.file, deep);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("blind spot: a file belonging to no declared component is reported, not skipped", () => {
  const root = syntheticTree();
  try {
    mkdirSync(join(root, "somewhere/unmodelled"), { recursive: true });
    writeFileSync(join(root, "somewhere/unmodelled/loose.ts"), "export const loose = 1;\n");
    const report = checkArchitecture(root, loadRules(realRoot));
    assert.ok(report.unassignedFiles.includes("somewhere/unmodelled/loose.ts"),
      "an unassigned source must appear in the report; silence about it is how a hiding place forms");
    assert.equal(report.sourceFileCount, report.assignedFileCount + report.unassignedFiles.length,
      "every enumerated source is either assigned or reported unassigned");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("blind spot: dynamic and re-export specifiers are read, not only static imports", () => {
  // The sample is assembled from fragments rather than written literally. The
  // scanner is regex-based and cannot tell an import expression from a string
  // containing one, so writing these forms literally here would make this file
  // report two unresolved imports of its own — which it did, and which is a
  // real limitation of the mechanism recorded rather than hidden.
  const dynamic = `const c = await ${"import"}("./dynamic.ts");`;
  const required = `const d = ${"require"}("./required.ts");`;
  const source = [
    `import a from "./static.ts";`,
    `export { b } from "./reexport.ts";`,
    dynamic,
    required,
    `import "./side-effect.ts";`,
  ].join("\n");
  const found = importsOf(source);
  for (const specifier of ["./static.ts", "./reexport.ts", "./dynamic.ts", "./required.ts", "./side-effect.ts"]) {
    assert.ok(found.includes(specifier), `${specifier} must be seen; an unread import form is an escape hatch`);
  }
});

// ------------------------------------------------------------------ controls

test("control: a permitted cross-layer import is not reported", () => {
  const root = syntheticTree();
  try {
    const delivery = componentPath("delivery");
    const application = componentPath("application");
    const depth = delivery.split("/").filter(Boolean).length;
    const file = `${delivery}permitted.ts`;
    writeFileSync(resolve(root, file),
      `import { marker } from "${"../".repeat(depth)}${application}index.ts";\nexport const used = marker;\n`);
    // delivery -> application is explicitly permitted. If this reported a
    // violation the checker would be rejecting shape rather than direction.
    assert.ok(!codes(root, "dependencydirection").includes("FORBIDDEN_LAYER_DEPENDENCY"),
      "a permitted edge must not be reported");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("control: a stdlib import in the domain layer is not a third-party dependency", () => {
  const root = syntheticTree();
  try {
    const file = `${componentPath("domain")}stdlib.ts`;
    writeFileSync(resolve(root, file), `import { deflateSync } from "node:zlib";\nexport const used = deflateSync;\n`);
    assert.deepEqual(codes(root, "domainhasnoruntimedependency"), [],
      "the standard library is admissible; flagging it would make the rule useless");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("control: planting one violation does not disturb unrelated facets", () => {
  const root = syntheticTree();
  try {
    const before = checkArchitecture(root, loadRules(realRoot));
    const file = `${componentPath("domain")}isolated-defect.ts`;
    writeFileSync(resolve(root, file), `import qr from "some-qr-library";\nexport const used = qr;\n`);
    const after = checkArchitecture(root, loadRules(realRoot));
    const moved = after.facets.filter((entry) => {
      const previous = before.facets.find((item) => item.facet === entry.facet);
      return previous !== undefined && previous.verdict !== entry.verdict;
    }).map((entry) => entry.facet);
    // Two facets legitimately observe a third-party import in the domain: the
    // domain runtime-dependency rule, and dependency declaration agreement.
    assert.deepEqual(moved.sort(), [
      "architecturedeclareddependenciesagree",
      "architecturedomainhasnoruntimedependency",
    ], `only the facets that observe this property may move; moved ${JSON.stringify(moved)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ------------------------------------------------------- the real repository

test("the real repository is enumerated completely and every finding is attributable", () => {
  const report = checkArchitecture(realRoot, loadRules(realRoot));
  assert.ok(report.sourceFileCount > 80, "the real tree must actually be enumerated");
  assert.equal(report.sourceFileCount, report.assignedFileCount + report.unassignedFiles.length);
  for (const entry of report.facets) {
    for (const item of entry.findings) {
      assert.match(item.facetIri, /^urn:anqr:delivery-facet:architecture/);
      assert.ok(item.detail.length > 0, "a finding with no detail cannot be acted on");
    }
  }
  // Every declared facet is accounted for, so a facet cannot be quietly dropped.
  const declared = loadRules(realRoot).facets.map((item) => item.name).sort();
  assert.deepEqual(report.facets.map((item) => item.facet).sort(), declared);
});

test("planted in the real repository: a framework import in the real domain is rejected", () => {
  // The synthetic cases prove the rules; this proves the same machinery sees a
  // violation in the actual tree, then leaves nothing behind.
  const file = "packages/artefact/src/qr/planted-framework-violation.ts";
  const absolute = resolve(realRoot, file);
  try {
    const before = checkArchitecture(realRoot, loadRules(realRoot));
    const beforeCodes = before.facets.find((entry) => entry.facet === "architectureframeworkisolation");
    assert.deepEqual(beforeCodes?.findings ?? [], [], "the real domain must be clean before planting");

    writeFileSync(absolute, `import { render } from "preact";\nexport const used = render;\n`);
    const after = checkArchitecture(realRoot, loadRules(realRoot));
    const afterFacet = after.facets.find((entry) => entry.facet === "architectureframeworkisolation");
    assert.equal(afterFacet?.verdict, "violated");
    assert.equal(afterFacet?.findings.length, 1);
    assert.equal(afterFacet?.findings[0]?.file, file);
    assert.equal(afterFacet?.findings[0]?.code, "FRAMEWORK_IMPORT_IN_ISOLATED_LAYER");
  } finally {
    rmSync(absolute, { force: true });
  }
  const restored = checkArchitecture(realRoot, loadRules(realRoot));
  assert.equal(restored.facets.find((entry) => entry.facet === "architectureframeworkisolation")?.verdict, "satisfied");
  assert.equal(existsSync(absolute), false, "the planted file must not be left behind");
});
