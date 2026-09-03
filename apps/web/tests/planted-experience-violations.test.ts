import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { Window } from "happy-dom";
import { h, render } from "preact";

import {
  checkArchitecture, experienceIntegrity, loadExperience, loadRules, patternContamination,
  type Experience,
} from "../../../packages/architecture/src/check.ts";
import { createExperience, INITIAL_MODEL, type ExperienceModel } from "../src/experience/machine.ts";
import { createProducer } from "../src/composition.ts";
import { isolatedTree } from "../../../packages/architecture/tests/isolated-tree.ts";

// Adversarial proof for the first semantic experience.
//
// Every case runs known-good, plants a prohibited state, observes the
// authoritative check fail for the intended reason, restores, and observes it
// pass. Where the intended guarantee is semantic, an incidental type error
// would not do: the specific finding code is asserted.
//
// Most cases mutate a copy of the experience projection in memory and pass it
// to the checker, which needs no filesystem change. The cases that must prove
// discovery, layering or the build plant a real file and remove it.

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const rules = loadRules(repositoryRoot);

const clone = (): Experience => JSON.parse(JSON.stringify(loadExperience(repositoryRoot))) as Experience;

function traceability(experience: Experience) {
  const report = checkArchitecture(repositoryRoot, rules, experience);
  const facet = report.facets.find((entry) => entry.facet === "architectureexperiencetraceability");
  assert.ok(facet !== undefined);
  return facet;
}
const codes = (experience: Experience): readonly string[] =>
  traceability(experience).findings.map((entry) => entry.code).sort();

function facetOf(name: string, experience?: Experience) {
  const report = checkArchitecture(repositoryRoot, rules, experience ?? loadExperience(repositoryRoot));
  const facet = report.facets.find((entry) => entry.facet === `architecture${name}`);
  assert.ok(facet !== undefined, `facet ${name} absent`);
  return facet;
}

test("known good: the real repository conforms before anything is planted", () => {
  assert.deepEqual(codes(loadExperience(repositoryRoot)), []);
  assert.deepEqual(experienceIntegrity(loadExperience(repositoryRoot)), []);
  assert.deepEqual(patternContamination(loadExperience(repositoryRoot)), []);
});

// ---------------------------------------------- 2. unknown semantic element

test("planted: a binding naming an unknown semantic element is rejected", () => {
  const experience = clone();
  (experience.bindings as unknown as { element: string }[])[0].element = "urn:anqr:design-role:not-declared";
  assert.ok(codes(experience).includes("BINDING_ELEMENT_UNKNOWN"));
  assert.deepEqual(codes(loadExperience(repositoryRoot)), [], "restored");
});

test("planted: a binding whose location does not exist is rejected", () => {
  const experience = clone();
  (experience.bindings as unknown as { location: string }[])[0].location = "apps/web/src/components/absent.ts";
  assert.ok(codes(experience).includes("BINDING_LOCATION_ABSENT"));
});

test("planted: a binding whose location does not render its identity is rejected", () => {
  const experience = clone();
  // A real file that genuinely does not carry this identity.
  const binding = (experience.bindings as unknown as { element: string; location: string }[])
    .find((entry) => entry.element.includes("design-role")) as { location: string };
  binding.location = "apps/web/src/experience/machine.ts";
  assert.ok(codes(experience).includes("BINDING_IDENTITY_NOT_RENDERED"));
});

// ------------------------------------------------- 3. unknown pattern

test("planted: a journey step selecting an undeclared pattern is rejected", () => {
  const experience = clone();
  (experience.journeys[0]?.steps as unknown as { pattern: string }[])[0].pattern = "invented-pattern";
  assert.ok(codes(experience).includes("JOURNEY_PATTERN_UNKNOWN"));
});

test("planted: a profile selecting a pattern the catalogue lacks is rejected", () => {
  const experience = clone();
  (experience.selectedPatterns as unknown as string[]).push("not-in-the-catalogue");
  const problems = experienceIntegrity(experience);
  assert.ok(problems.some((problem) => problem.startsWith("EXPERIENCE_SELECTED_PATTERN_UNKNOWN")));
  assert.ok(codes(experience).includes("EXPERIENCE_PROJECTION_INVALID"));
});

// --------------------------------------------- 4. pattern contamination

test("planted: a pattern naming the product is rejected as contaminated", () => {
  const experience = clone();
  (experience.patterns as unknown as { purpose: string }[])[0].purpose =
    "Let an ANQR user describe the code they want and see it.";
  const problems = patternContamination(experience);
  assert.ok(problems.some((problem) => problem.includes("anqr")), JSON.stringify(problems));
  assert.ok(codes(experience).includes("PATTERN_CONTAMINATED"));
});

test("planted: a pattern naming a framework or markup is rejected", () => {
  for (const contaminant of ["Render a Preact component for the input.", "Set the className on the preview.", "Use querySelector to find the control."]) {
    const experience = clone();
    (experience.patterns as unknown as { purpose: string }[])[0].purpose = contaminant;
    assert.ok(patternContamination(experience).length > 0, `"${contaminant}" must be rejected`);
  }
  // And the real catalogue is clean, so this is not vacuous.
  assert.deepEqual(patternContamination(loadExperience(repositoryRoot)), []);
});

test("planted: a pattern assuming a specific output format is rejected", () => {
  const experience = clone();
  (experience.patterns as unknown as { anatomy: string[] }[])[0].anatomy = ["A preview rendered as an SVG."];
  assert.ok(patternContamination(experience).some((problem) => problem.includes("svg")));
});

// ------------------------------------- 6. declared action with no implementation

test("planted: a declared action with no implementation binding is rejected", () => {
  const experience = clone();
  (experience.actions as unknown as { name: string; capability: string }[]).push({
    name: "set-something-unimplemented", capability: "encodingcontrolsurface",
  });
  assert.ok(codes(experience).includes("ACTION_WITHOUT_IMPLEMENTATION"));
});

test("planted: a state permitting an undeclared action is rejected", () => {
  const experience = clone();
  (experience.states[0]?.permits as unknown as string[]).push("set-nonexistent");
  const problems = experienceIntegrity(experience);
  assert.ok(problems.some((problem) => problem.startsWith("EXPERIENCE_STATE_ACTION_UNKNOWN")));
});

test("planted: a transition naming an undeclared state is rejected", () => {
  const experience = clone();
  (experience.transitions as unknown as { from: string; to: string }[]).push({ from: "ready", to: "invented-state" });
  assert.ok(experienceIntegrity(experience).some((problem) => problem.startsWith("EXPERIENCE_TRANSITION_STATE_UNKNOWN")));
});

// ------------------------------------------ 7. invalid state transition

test("planted: an undeclared state transition is refused at runtime", async () => {
  const machine = createExperience({ producer: createProducer(), deliver: () => {} });
  // exported -> empty is not a declared transition. The machine refuses rather
  // than silently allowing a state the graph does not describe.
  const exported: ExperienceModel = { ...INITIAL_MODEL, state: "exported", artefact: null };
  await assert.rejects(() => machine.exportArtefact(exported), /EXPERIENCE_ACTION_FORBIDDEN|EXPERIENCE_TRANSITION_FORBIDDEN/);

  const ready = await machine.setPayload(INITIAL_MODEL, "https://anqr.link/transition");
  assert.equal(ready.state, "ready", "and the declared path still works");
});

// ------------------------- 1, 5, 11, 12. planted files in the real tree

/**
 * Plants into a disposable copy of the tree. Planting into the shared tree made
 * this file and the port-conformance file interfere, because each runs as its
 * own process and each asserts the tree is clean before planting.
 */
function withPlanted(path: string, source: string, assertions: (facet: (name: string) => ReturnType<typeof facetOf>, root: string) => void): void {
  const tree = isolatedTree(repositoryRoot);
  try {
    writeFileSync(resolve(tree.root, path), source);
    const facetIn = (name: string) => {
      const report = checkArchitecture(tree.root, rules, loadExperience(tree.root));
      const facet = report.facets.find((entry) => entry.facet === `architecture${name}`);
      assert.ok(facet !== undefined, `facet ${name} absent`);
      return facet;
    };
    assertions(facetIn, tree.root);
    rmSync(resolve(tree.root, path), { force: true });
    const after = checkArchitecture(tree.root, rules, loadExperience(tree.root));
    assert.equal(after.blockingViolationCount, 0, "removing the violation must restore conformance");
  } finally { tree.dispose(); }
}

test("planted: Preact imported into the domain layer is rejected", () => {
  assert.deepEqual(facetOf("frameworkisolation").findings, [], "known good in the real tree");
  withPlanted("packages/artefact/src/qr/planted-framework.ts",
    'import { h } from "preact";\nexport const used = h;\n',
    (facetIn) => {
      const findings = facetIn("frameworkisolation").findings;
      assert.equal(findings.length, 1);
      assert.equal(findings[0]?.code, "FRAMEWORK_IMPORT_IN_ISOLATED_LAYER");
      assert.match(findings[0]?.detail ?? "", /domain layer imports "preact"/);
    });
});

test("planted: Preact imported into the application layer is rejected", () => {
  withPlanted("packages/artefact/src/application/planted-framework.ts",
    'import { h } from "preact";\nexport const used = h;\n',
    (facetIn) => {
      assert.equal(facetIn("frameworkisolation").findings[0]?.code, "FRAMEWORK_IMPORT_IN_ISOLATED_LAYER");
    });
});

test("planted: the application layer reaching an adapter directly is rejected", () => {
  // Export must go through the container port. An application module naming a
  // concrete container bypasses the port, and only the composition root in the
  // delivery layer may do that.
  assert.deepEqual(facetOf("dependencydirection").findings, [], "known good in the real tree");
  withPlanted("packages/artefact/src/application/planted-bypass.ts",
    'import { svgContainer } from "../adapters/svg-container.ts";\nexport const used = svgContainer;\n',
    (facetIn) => {
      const findings = facetIn("dependencydirection").findings;
      assert.ok(findings.some((entry) => entry.code === "FORBIDDEN_LAYER_DEPENDENCY"),
        JSON.stringify(findings.map((entry) => entry.code)));
      assert.match(findings[0]?.detail ?? "", /application/);
    });
});

test("planted: a rendered action with no semantic binding is rejected, and discovery sees the new file", () => {
  // Two classes in one: the identity is unknown, and the file carrying it was
  // created since the last run. A checker that enumerated a remembered set
  // would see neither.
  assert.deepEqual(codes(loadExperience(repositoryRoot)), [], "known good in the real tree");
  withPlanted("apps/web/src/components/planted-control.ts",
    'import { h, type JSX } from "preact";\n'
    + 'export function PlantedControl(): JSX.Element {\n'
    + '  return h("button", { "data-experience-action": "invent-an-action", "data-design-role": "invented-role" }, "x");\n'
    + '}\n',
    (facetIn) => {
      const findings = facetIn("experiencetraceability").findings;
      const found = findings.map((entry) => entry.code).sort();
      assert.ok(found.includes("RENDERED_ACTION_UNBOUND"), JSON.stringify(found));
      assert.ok(found.includes("RENDERED_ROLE_UNKNOWN"), JSON.stringify(found));
      assert.ok(findings.some((entry) => entry.file === "apps/web/src/components/planted-control.ts"),
        "the newly created file must be the one reported");
    });
});

test("planted: a missing join validator is rejected", () => {
  const experience = clone();
  (experience as { joinValidatorLocation: string }).joinValidatorLocation = "packages/artefact/src/model/absent.ts";
  assert.ok(codes(experience).includes("JOIN_VALIDATOR_ABSENT"));
});

// ------------------------------------------------ 10. broken production build

test("planted: a broken production import fails the declared build", () => {
  // Isolated in a copied tree rather than planted in place. Node runs each test
  // FILE as its own process, so mutating a shared source while siblings read it
  // is unsound: doing that made one test fail on a fresh clone and pass on
  // re-run, which is exactly the kind of order dependence that must not be
  // left in. The copy is the real sources and the real build script, so the
  // guarantee under test is unchanged.
  const root = mkdtempSync(join(tmpdir(), "anqr-build-"));
  try {
    cpSync(resolve(repositoryRoot, "apps/web"), resolve(root, "apps/web"), { recursive: true });
    cpSync(resolve(repositoryRoot, "packages/artefact"), resolve(root, "packages/artefact"), { recursive: true });
    symlinkSync(resolve(repositoryRoot, "node_modules"), resolve(root, "node_modules"), "dir");
    rmSync(resolve(root, "apps/web/dist"), { recursive: true, force: true });

    const build = (): { ok: boolean; output: string } => {
      try {
        return {
          ok: true,
          output: execFileSync(process.execPath, [resolve(root, "apps/web/tools/build.mjs")], {
            cwd: root, encoding: "utf8",
          }),
        };
      } catch (error) {
        const failure = error as { stdout?: string; stderr?: string };
        return { ok: false, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
      }
    };

    const known = build();
    assert.equal(known.ok, true, `known good: the declared build succeeds\n${known.output}`);
    assert.ok(existsSync(resolve(root, "apps/web/dist/main.js")), "and produces the declared artefact");
    assert.match(known.output, /bundle apps\/web\/dist\/main\.js/);

    const target = resolve(root, "apps/web/src/composition.ts");
    const original = readFileSync(target, "utf8");
    writeFileSync(target, original.replace(
      'import { svgContainer } from "../../../packages/artefact/src/adapters/svg-container.ts";',
      'import { svgContainer } from "../../../packages/artefact/src/adapters/does-not-exist.ts";',
    ));
    const broken = build();
    assert.equal(broken.ok, false, "an unresolved production import must fail the build");
    assert.match(broken.output, /Could not resolve|does-not-exist/);

    writeFileSync(target, original);
    assert.equal(build().ok, true, "restored: the build succeeds again");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ------------------------------- 9. inaccessible required interaction

test("planted: an inaccessible interaction fails the accessibility assertions", () => {
  // The accessibility suite asserts semantic properties. This proves those
  // assertions can reject: a deliberately inaccessible tree is rendered and
  // each check is shown to fail on it.
  const window = new Window({ url: "https://anqr.test/" });
  for (const key of ["window", "document", "HTMLElement", "Node", "Element", "Event", "CustomEvent"] as const) {
    Object.defineProperty(globalThis, key, {
      value: (window as unknown as Record<string, unknown>)[key], configurable: true, writable: true,
    });
  }
  const document = window.document as unknown as Document;
  const root = document.createElement("div");
  document.body.append(root);

  const Inaccessible = (): ReturnType<typeof h> => h("div", {}, [
    // A button with no text and no label: operable but unnameable.
    h("button", { type: "button", id: "planted-nameless" }, ""),
    // A label pointing at nothing: it looks associated and is not.
    h("label", { for: "planted-absent" }, "Payload"),
    // An error that is neither announced nor associated.
    h("p", { class: "validation-message" }, "Something is wrong"),
    // A fake button: a div with a handler, unreachable by keyboard.
    h("div", { "data-experience-action": "set-payload", onClick: () => {} }, "Click"),
  ]);
  render(h(Inaccessible, {}), root as unknown as Element);

  const nameless = document.getElementById("planted-nameless") as Element;
  assert.equal((nameless.textContent ?? "").trim(), "", "the button has no accessible name");
  assert.equal(nameless.getAttribute("aria-label"), null);

  const dangling = document.querySelector('label[for="planted-absent"]') as Element;
  assert.equal(document.getElementById(dangling.getAttribute("for") as string), null,
    "the label resolves to nothing, which the real suite rejects");

  const message = document.querySelector(".validation-message") as Element;
  assert.equal(message.getAttribute("role"), null, "the error is not announced");
  assert.equal(message.getAttribute("id"), null, "and cannot be associated with an input");

  const fake = document.querySelector('[data-experience-action="set-payload"]') as Element;
  assert.equal(fake.tagName.toLowerCase(), "div", "a div carrying an action is not natively operable");
  assert.ok(!["button", "textarea", "select", "input", "a"].includes(fake.tagName.toLowerCase()),
    "which is the condition the real suite asserts against");

  root.remove();
});

test("nothing planted was left behind", () => {
  for (const path of [
    "packages/artefact/src/qr/planted-framework.ts",
    "packages/artefact/src/application/planted-framework.ts",
    "packages/artefact/src/application/planted-bypass.ts",
    "apps/web/src/components/planted-control.ts",
  ]) {
    assert.equal(existsSync(resolve(repositoryRoot, path)), false, `${path} must not survive`);
  }
  assert.deepEqual(codes(loadExperience(repositoryRoot)), []);
  assert.deepEqual(facetOf("frameworkisolation").findings, []);
  assert.deepEqual(facetOf("dependencydirection").findings, []);
});
