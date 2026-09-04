import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { loadExperience } from "../src/check.ts";
import { deliveryClosure, uiFindings, VIEWPORTS, type RenderedSurface } from "../src/delivery.ts";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const base = JSON.parse(readFileSync(resolve(repositoryRoot, "packages/architecture/delivery.json"), "utf8")) as
  Parameters<typeof deliveryClosure>[0];
const experience = loadExperience(repositoryRoot);

/**
 * Adversarial proof for the delivery gate.
 *
 * Two halves, because the gate has two: the delivery closure derived from the
 * graph, and the user interface actually rendered. A gate that passed on a
 * repository with an unbound environment, a secret in authority or a control a
 * user cannot reach would be worse than no gate, because it would be reported
 * as coverage.
 */

const firstCode = (findings: readonly { code: string }[]): string | null => findings[0]?.code ?? null;

test("known good: the real delivery closure has no finding", () => {
  assert.deepEqual(deliveryClosure(base), [], "the planted cases prove nothing if the base state is already broken");
});

test("planted: a required contract that resolves to nothing is rejected", () => {
  assert.equal(firstCode(deliveryClosure({ ...base, required: [{ contract: "invented", declared: false }] })),
    "DELIVERY_REQUIREMENT_UNCONTRACTED");
});

test("planted: an exclusion without a reviewable reason is rejected", () => {
  assert.equal(firstCode(deliveryClosure({ ...base, notRequired: [{ contract: "x", declared: true, reason: "no" }] })),
    "DELIVERY_EXCLUSION_UNREASONED");
});

test("planted: a contract both required and excluded is rejected", () => {
  const contract = base.required[0]?.contract ?? "";
  const findings = deliveryClosure({ ...base, notRequired: [...base.notRequired, { contract, declared: true, reason: "a".repeat(50) }] });
  assert.ok(findings.some((finding) => finding.code === "DELIVERY_REQUIREMENT_CONTRADICTED"));
});

test("planted: a rung that skips the next one is rejected", () => {
  const rungs = base.rungs.map((rung) => rung.name === "development" ? { ...rung, promotesTo: "production" } : rung);
  assert.equal(firstCode(deliveryClosure({ ...base, rungs })), "DELIVERY_RUNG_ORDER_BROKEN");
});

test("planted: human approval anywhere but production is rejected", () => {
  const rungs = base.rungs.map((rung) => rung.name === "staging" ? { ...rung, requiresHumanApproval: true } : rung);
  assert.equal(firstCode(deliveryClosure({ ...base, rungs })), "DELIVERY_APPROVAL_POSTURE_WRONG");
});

test("planted: a binding claiming to be bound with open decisions is rejected", () => {
  const bindings = [{ ...base.bindings[0]!, status: "bound", unresolvedDecisions: 3 }];
  assert.equal(firstCode(deliveryClosure({ ...base, bindings })), "DELIVERY_BINDING_INCOMPLETE");
});

test("planted: an unresolved binding naming no authority is rejected", () => {
  const unresolved = base.bindings.find((binding) => binding.status === "unresolved");
  assert.ok(unresolved !== undefined, "there must be an unresolved binding to mutate");
  assert.equal(firstCode(deliveryClosure({ ...base, bindings: [{ ...unresolved, requiresExternalAuthority: null }] })),
    "DELIVERY_BINDING_INCOMPLETE");
});

test("planted: anything shaped like a credential in authority is rejected", () => {
  const secrets = [{ requirement: "x", resolver: "r", consequence: "sk-abcdefghijklmnop is the value here" }];
  assert.equal(firstCode(deliveryClosure({ ...base, secrets })), "SECRET_VALUE_IN_AUTHORITY");
});

test("planted: a required-and-unrealised disposition naming no facet is rejected", () => {
  const parityDispositions = [{ disposition: "d", status: "required-unrealised", appliesToFacet: null }];
  assert.equal(firstCode(deliveryClosure({ ...base, parityDispositions })), "DELIVERY_DISPOSITION_UNATTACHED");
});

// ------------------------------------------------------ the rendered surface

function surface(overrides: Partial<RenderedSurface> = {}): RenderedSurface {
  return {
    actions: [
      { action: "set-payload", operable: true, disabledReason: null },
      { action: "toggle-encoding-options", operable: true, disabledReason: null },
    ],
    roles: ["content-heading"],
    headingCount: 1,
    landmarkPresent: true,
    controls: [{ named: true, outline: "<button>Create</button>" }],
    unresolvedDescriptions: [],
    primaryActionState: "operable",
    observedState: "empty",
    ...overrides,
  };
}

test("known good: a conforming surface has no interface finding", () => {
  assert.deepEqual(uiFindings(experience, "regular", surface()), []);
});

test("planted: a surface with no landmark is rejected", () => {
  assert.equal(firstCode(uiFindings(experience, "regular", surface({ landmarkPresent: false }))), "UI_LANDMARK_ABSENT");
});

test("planted: a control with no accessible name is rejected", () => {
  const findings = uiFindings(experience, "regular", surface({ controls: [{ named: false, outline: "<button>" }] }));
  assert.equal(firstCode(findings), "UI_CONTROL_UNNAMED");
});

test("planted: an action the state permits but the surface omits is rejected", () => {
  const findings = uiFindings(experience, "regular", surface({ actions: [{ action: "set-payload", operable: true, disabledReason: null }] }));
  assert.equal(firstCode(findings), "UI_PERMITTED_ACTION_NOT_RENDERED");
});

test("planted: an action the state withholds but a user can invoke is rejected", () => {
  // The important half of the withheld rule. Rendering a withheld action
  // disabled with a reason is correct and must stay legal; letting a user
  // actually invoke it is the defect.
  const findings = uiFindings(experience, "regular", surface({
    actions: [...surface().actions, { action: "export-artefact", operable: true, disabledReason: null }],
  }));
  assert.equal(firstCode(findings), "UI_WITHHELD_ACTION_OPERABLE");
});

test("planted: a withheld action offered with no stated reason is rejected", () => {
  const findings = uiFindings(experience, "regular", surface({
    actions: [...surface().actions, { action: "export-artefact", operable: false, disabledReason: "" }],
  }));
  assert.equal(firstCode(findings), "UI_WITHHELD_ACTION_UNEXPLAINED");
});

test("control: a withheld action, disabled with a reason, is permitted", () => {
  const findings = uiFindings(experience, "regular", surface({
    actions: [...surface().actions, { action: "export-artefact", operable: false, disabledReason: "Enter a payload first." }],
  }));
  assert.deepEqual(findings, [], "hiding it would remove the explanation along with the control");
});

test("planted: a rendered action authority does not declare is rejected", () => {
  const findings = uiFindings(experience, "regular", surface({
    actions: [...surface().actions, { action: "invented", operable: true, disabledReason: null }],
  }));
  assert.equal(firstCode(findings), "UI_RENDERED_ACTION_UNDECLARED");
});

test("planted: an undeclared design role is rejected", () => {
  assert.equal(firstCode(uiFindings(experience, "regular", surface({ roles: ["invented-role"] }))), "UI_RENDERED_ROLE_UNKNOWN");
});

test("planted: a surface in a state authority does not declare is rejected", () => {
  assert.equal(firstCode(uiFindings(experience, "regular", surface({ observedState: "nowhere" }))), "UI_STATE_UNDECLARED");
});

test("planted: a description reference that resolves to nothing is rejected", () => {
  assert.equal(firstCode(uiFindings(experience, "regular", surface({ unresolvedDescriptions: ["missing-id"] }))),
    "UI_DESCRIPTION_UNRESOLVED");
});

test("planted: a missing primary action is rejected", () => {
  assert.equal(firstCode(uiFindings(experience, "regular", surface({ primaryActionState: "absent" }))),
    "UI_PRIMARY_ACTION_ABSENT");
});

test("the declared viewport classes are the ones authority names", () => {
  assert.deepEqual(VIEWPORTS.map((viewport) => viewport.viewportClass), ["compact", "regular", "wide"]);
  for (const viewport of VIEWPORTS) assert.ok(viewport.width > 0 && viewport.height > 0);
  // Widths must genuinely differ, or checking three of them proves one thing.
  assert.equal(new Set(VIEWPORTS.map((viewport) => viewport.width)).size, VIEWPORTS.length);
});
