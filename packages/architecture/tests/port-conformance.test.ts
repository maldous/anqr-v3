import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";

import {
  adapterSourcePath, checkArchitecture, loadRules, portInterfaceName, type Rules,
} from "../src/check.ts";

// Adversarial proof for port and adapter conformance.
//
// The first form of this check asked only whether ANY file existed beneath the
// adapters component, so one file satisfied all six adapters, deleting an
// adapter went undetected, and an empty file passed. That was measured, not
// assumed. The checks below exist so that failure mode cannot return.
//
// Two mechanisms share the work, and the split is deliberate. This scanner
// decides that the compiler is ENGAGED — the adapter exists at its derived
// path, is owned by a component in its declared layer, imports the contract of
// every port it claims, and binds an exported value annotated with that port's
// interface. The TYPE CHECKER then decides whether the implementation actually
// satisfies the interface, which a regular expression cannot know. The last
// case below proves that half by compiling an incompatible adapter.

const realRoot = resolve(import.meta.dirname, "../../..");

/** A tree where every declared port and adapter conforms, so a planted defect is the only difference. */
function conformingTree(): string {
  const root = mkdtempSync(join(tmpdir(), "anqr-ports-"));
  const rules = loadRules(realRoot);
  mkdirSync(join(root, "packages/architecture"), { recursive: true });
  writeFileSync(join(root, "packages/architecture/rules.json"), JSON.stringify(rules));
  writeFileSync(join(root, "package.json"), JSON.stringify({
    name: "synthetic", private: true, type: "module", scripts: {}, devDependencies: {},
  }));
  writeFileSync(join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: {} }));

  for (const component of rules.components) {
    mkdirSync(join(root, component.location), { recursive: true });
    writeFileSync(join(root, component.location, "index.ts"), "export const marker = 1;\n");
  }
  for (const port of rules.ports) {
    mkdirSync(resolve(root, dirname(port.contractLocation)), { recursive: true });
    writeFileSync(resolve(root, port.contractLocation),
      `export interface ${portInterfaceName(port.name)} { readonly marker: 1 }\n`);
  }
  // Required edge: an adapter must depend on the ports layer.
  const adapters = rules.components.find((entry) => entry.layer === "adapters");
  const first = rules.ports[0];
  if (adapters !== undefined && first !== undefined) {
    writeFileSync(join(root, adapters.location, "index.ts"),
      `import type { ${portInterfaceName(first.name)} } from "${relativeTo(`${adapters.location}index.ts`, first.contractLocation)}";\n`
      + `export const marker: ${portInterfaceName(first.name)} | 1 = 1;\n`);
  }
  for (const adapter of rules.adapters) {
    const path = adapterSourcePath(adapter, rules);
    if (path === null) continue;
    writeFileSync(resolve(root, path), conformingAdapter(adapter, rules, path));
  }
  mkdirSync(join(root, "src/capabilities/creation"), { recursive: true });
  writeFileSync(join(root, "src/capabilities/creation/legacy.ts"), "export const legacy = 1;\n");
  return root;
}

function relativeTo(from: string, to: string): string {
  const fromParts = from.split("/").slice(0, -1);
  const toParts = to.split("/");
  let shared = 0;
  while (shared < fromParts.length && shared < toParts.length - 1 && fromParts[shared] === toParts[shared]) shared += 1;
  const up = "../".repeat(fromParts.length - shared) || "./";
  return `${up}${toParts.slice(shared).join("/")}`;
}

function conformingAdapter(adapter: Rules["adapters"][number], rules: Rules, path: string): string {
  const lines: string[] = [];
  const names: string[] = [];
  for (const portName of adapter.implementsPort) {
    const port = rules.ports.find((entry) => entry.name === portName);
    if (port === undefined) continue;
    const iface = portInterfaceName(port.name);
    names.push(iface);
    lines.push(`import type { ${iface} } from "${relativeTo(path, port.contractLocation)}";`);
  }
  for (const iface of names) {
    lines.push(`export const ${iface.charAt(0).toLowerCase()}${iface.slice(1)}Instance: ${iface} = { marker: 1 };`);
  }
  return `${lines.join("\n")}\n`;
}

const conformance = (root: string) => {
  const report = checkArchitecture(root, loadRules(realRoot));
  const entry = report.facets.find((item) => item.facet === "architectureportimplementationconformance");
  assert.ok(entry !== undefined);
  return entry;
};
const codes = (root: string) => conformance(root).findings.map((item) => item.code).sort();

/** known-good -> plant -> fail for the intended code -> restore -> pass. */
function cycle(expectedCode: string, plant: (root: string, rules: Rules) => () => void): void {
  const root = conformingTree();
  const rules = loadRules(realRoot);
  try {
    assert.deepEqual(codes(root), [], "the tree must conform before planting, or the case proves nothing");
    const restore = plant(root, rules);
    const after = codes(root);
    assert.ok(after.includes(expectedCode), `expected ${expectedCode}; got ${JSON.stringify(after)}`);
    const detail = conformance(root).findings.find((item) => item.code === expectedCode);
    assert.ok(detail !== undefined && detail.detail.length > 0);
    assert.match(detail.facetIri, /^urn:anqr:delivery-facet:architectureportimplementationconformance$/);
    restore();
    assert.deepEqual(codes(root), [], "removing the violation must restore conformance");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("planted: a missing port contract is rejected", () => {
  cycle("PORT_CONTRACT_ABSENT", (root, rules) => {
    const port = rules.ports[0] as Rules["ports"][number];
    const absolute = resolve(root, port.contractLocation);
    const bytes = readFileSync(absolute, "utf8");
    rmSync(absolute);
    return () => writeFileSync(absolute, bytes);
  });
});

test("planted: a missing adapter is rejected, and one sibling does not cover for it", () => {
  // The exact defect the earlier check could not see: five other adapters exist
  // beneath the same component, and the sixth is gone.
  cycle("ADAPTER_NOT_REALISED", (root, rules) => {
    const adapter = rules.adapters[0] as Rules["adapters"][number];
    const path = adapterSourcePath(adapter, rules) as string;
    const absolute = resolve(root, path);
    const bytes = readFileSync(absolute, "utf8");
    rmSync(absolute);
    assert.ok(existsSync(resolve(root, adapterSourcePath(rules.adapters[1] as Rules["adapters"][number], rules) as string)),
      "a sibling adapter must still exist, or this proves only that the directory was emptied");
    return () => writeFileSync(absolute, bytes);
  });
});

test("planted: an empty file is not an implementation", () => {
  const root = conformingTree();
  const rules = loadRules(realRoot);
  try {
    assert.deepEqual(codes(root), []);
    const adapter = rules.adapters[0] as Rules["adapters"][number];
    const path = adapterSourcePath(adapter, rules) as string;
    const bytes = readFileSync(resolve(root, path), "utf8");
    writeFileSync(resolve(root, path), "");
    const after = codes(root);
    assert.ok(after.includes("ADAPTER_DOES_NOT_IMPORT_PORT"));
    assert.ok(after.includes("ADAPTER_EXPORT_NOT_PORT_TYPED"));
    writeFileSync(resolve(root, path), bytes);
    assert.deepEqual(codes(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("planted: a marker file that merely exports something is not an implementation", () => {
  cycle("ADAPTER_EXPORT_NOT_PORT_TYPED", (root, rules) => {
    const adapter = rules.adapters[0] as Rules["adapters"][number];
    const path = adapterSourcePath(adapter, rules) as string;
    const bytes = readFileSync(resolve(root, path), "utf8");
    const port = rules.ports.find((entry) => entry.name === adapter.implementsPort[0]) as Rules["ports"][number];
    // Imports the contract, so it is not the bypass case, and exports a value —
    // but nothing is annotated with the port interface, so the compiler is
    // never asked whether it conforms.
    writeFileSync(resolve(root, path),
      `import type { ${portInterfaceName(port.name)} } from "${relativeTo(path, port.contractLocation)}";\n`
      + `export const somethingElse = 1;\n`);
    return () => writeFileSync(resolve(root, path), bytes);
  });
});

test("planted: an annotated binding that is not exported is rejected", () => {
  cycle("ADAPTER_EXPORT_NOT_PORT_TYPED", (root, rules) => {
    const adapter = rules.adapters[0] as Rules["adapters"][number];
    const path = adapterSourcePath(adapter, rules) as string;
    const bytes = readFileSync(resolve(root, path), "utf8");
    writeFileSync(resolve(root, path), bytes.replace(/^export const /m, "const "));
    return () => writeFileSync(resolve(root, path), bytes);
  });
});

test("planted: an adapter that bypasses its port is rejected", () => {
  cycle("ADAPTER_DOES_NOT_IMPORT_PORT", (root, rules) => {
    const adapter = rules.adapters[0] as Rules["adapters"][number];
    const path = adapterSourcePath(adapter, rules) as string;
    const port = rules.ports.find((entry) => entry.name === adapter.implementsPort[0]) as Rules["ports"][number];
    const iface = portInterfaceName(port.name);
    const bytes = readFileSync(resolve(root, path), "utf8");
    // Declares its own local copy of the shape instead of importing the
    // contract. It would compile, and it would drift.
    writeFileSync(resolve(root, path),
      `interface ${iface} { readonly marker: 1 }\nexport const local: ${iface} = { marker: 1 };\n`);
    return () => writeFileSync(resolve(root, path), bytes);
  });
});

test("planted: an adapter in the wrong component is rejected", () => {
  cycle("ADAPTER_NOT_REALISED", (root, rules) => {
    // Moved into a component of another layer. The derived path is where the
    // architecture says it must live, so relocating it is a violation even
    // though the file still exists somewhere.
    const adapter = rules.adapters[0] as Rules["adapters"][number];
    const path = adapterSourcePath(adapter, rules) as string;
    const domain = rules.components.find((entry) => entry.layer === "domain") as Rules["components"][number];
    const wrong = `${domain.location}${adapter.name}.ts`;
    const bytes = readFileSync(resolve(root, path), "utf8");
    rmSync(resolve(root, path));
    writeFileSync(resolve(root, wrong), bytes);
    return () => { rmSync(resolve(root, wrong)); writeFileSync(resolve(root, path), bytes); };
  });
});

test("planted: an adapter created since the last run is discovered", () => {
  // Novelty, the Priority 1 lesson applied here. The checker resolves each
  // adapter's derived path at invocation, so a file that did not exist a moment
  // ago is found and judged rather than remembered as absent.
  const root = conformingTree();
  const rules = loadRules(realRoot);
  try {
    const adapter = rules.adapters[0] as Rules["adapters"][number];
    const path = adapterSourcePath(adapter, rules) as string;
    const bytes = readFileSync(resolve(root, path), "utf8");
    rmSync(resolve(root, path));
    assert.ok(codes(root).includes("ADAPTER_NOT_REALISED"), "absent must be seen as absent");
    // Recreate it, non-conforming, and confirm the new bytes are read.
    writeFileSync(resolve(root, path), "export const brandNew = 1;\n");
    const after = codes(root);
    assert.ok(!after.includes("ADAPTER_NOT_REALISED"), "the created file must be discovered");
    assert.ok(after.includes("ADAPTER_EXPORT_NOT_PORT_TYPED"), "and judged on its contents");
    writeFileSync(resolve(root, path), bytes);
    assert.deepEqual(codes(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("planted: an unknown port claim is rejected", () => {
  const root = conformingTree();
  const rules = JSON.parse(JSON.stringify(loadRules(realRoot))) as Rules;
  try {
    // Through unknown: the rules type is deeply readonly, and this test
    // deliberately violates that to plant an incoherent rule set.
    (rules.adapters[0] as unknown as { implementsPort: string[] }).implementsPort = ["not-a-declared-port"];
    writeFileSync(join(root, "packages/architecture/rules.json"), JSON.stringify(rules));
    const report = checkArchitecture(root, rules);
    const entry = report.facets.find((item) => item.facet === "architectureportimplementationconformance");
    assert.ok(entry?.findings.some((item) => item.code === "ADAPTER_PORT_UNKNOWN"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// -------------------------------------------- the compiler half of the proof

test("an incompatible implementation fails the type checker, which the scanner cannot judge", () => {
  // The scanner proves the compiler is engaged; only the compiler can decide
  // structural conformance. This asserts that half directly: an adapter that
  // imports its contract and binds an annotated export, but whose shape is
  // wrong, compiles to an error.
  const root = mkdtempSync(join(tmpdir(), "anqr-tsc-"));
  const tsc = resolve(realRoot, "node_modules/.bin/tsc");
  try {
    writeFileSync(join(root, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        strict: true, noEmit: true, module: "NodeNext", moduleResolution: "NodeNext",
        target: "ES2024", allowImportingTsExtensions: true, skipLibCheck: true, types: [],
      },
      include: ["*.ts"],
    }));
    writeFileSync(join(root, "port.ts"),
      "export interface ContainerEncoderPort {\n  readonly mediaType: string;\n  readonly supportsAnimation: boolean;\n  encode(frames: readonly number[]): Promise<Uint8Array>;\n}\n");

    // Conforming first, so a failure below is attributable to the defect.
    writeFileSync(join(root, "good.ts"),
      `import type { ContainerEncoderPort } from "./port.ts";\n`
      + `export const good: ContainerEncoderPort = {\n  mediaType: "image/x",\n  supportsAnimation: false,\n  async encode() { return new Uint8Array(0); },\n};\n`);
    execFileSync(tsc, ["--noEmit", "-p", root], { encoding: "utf8" });

    // Now incompatible: the wrong return type and a missing member.
    writeFileSync(join(root, "good.ts"),
      `import type { ContainerEncoderPort } from "./port.ts";\n`
      + `export const good: ContainerEncoderPort = {\n  mediaType: "image/x",\n  async encode() { return "not bytes"; },\n};\n`);
    let failed = false;
    let output = "";
    try {
      execFileSync(tsc, ["--noEmit", "-p", root], { encoding: "utf8" });
    } catch (error) {
      failed = true;
      output = String((error as { stdout?: string }).stdout ?? "");
    }
    assert.ok(failed, "an incompatible implementation must fail the type checker");
    assert.match(output, /supportsAnimation|not assignable/, `unexpected compiler output: ${output.slice(0, 300)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the real repository's adapters all conform and every port has an adapter", () => {
  const report = checkArchitecture(realRoot, loadRules(realRoot));
  const entry = report.facets.find((item) => item.facet === "architectureportimplementationconformance");
  assert.equal(entry?.verdict, "satisfied", `findings: ${JSON.stringify(entry?.findings)}`);
  const rules = loadRules(realRoot);
  for (const port of rules.ports.filter((item) => item.direction === "outbound")) {
    assert.ok(rules.adapters.some((adapter) => adapter.implementsPort.includes(port.name)),
      `outbound port ${port.name} must have an adapter`);
  }
  // Source accounting must stay complete, and nothing may be unaccounted.
  assert.equal(report.sourceFileCount, report.assignedFileCount + report.unassignedFiles.length);
  assert.deepEqual(report.unaccountedFiles, [], "an unaccounted source is a hiding place");
});
