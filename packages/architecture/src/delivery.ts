// ANQR delivery validation.
//
// Two halves, deliberately in one gate.
//
// The first is delivery closure: every requirement the product declares
// resolves to a contract that exists, each environment binding is either
// complete or explicitly unresolved with its decisions named, every secret is a
// name and a resolver rather than a value, and the rungs and gates are the ones
// authority declares. That half reads the projection derived from the graph.
//
// The second is the user interface and experience itself, rendered. A delivery
// claim that never renders the thing being delivered is a claim about files.
// So the creation surface is mounted in a document implementation at each
// declared viewport class and its semantics are observed: landmarks, headings,
// accessible names, resolving descriptions, design roles, declared experience
// actions actually present, and a primary action that is either operable or
// disabled with a stated reason.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadExperience, type Experience } from "./check.ts";

export interface DeliveryFinding {
  readonly code: string;
  readonly detail: string;
  readonly severity: "blocking" | "advisory";
}

export interface ViewportEvidence {
  readonly viewportClass: string;
  readonly width: number;
  readonly renderedActions: readonly string[];
  readonly renderedRoles: readonly string[];
  readonly headingCount: number;
  readonly landmarkPresent: boolean;
  readonly controlCount: number;
  readonly namedControlCount: number;
  readonly primaryActionState: "operable" | "disabled-with-reason" | "absent";
  readonly observedState: string;
}

export interface DeliveryReport {
  readonly schema: "urn:anqr:delivery-report:1";
  readonly closureFindings: readonly DeliveryFinding[];
  readonly uiFindings: readonly DeliveryFinding[];
  readonly viewports: readonly ViewportEvidence[];
  readonly blockingCount: number;
  readonly conforming: boolean;
}

interface DeliveryProjection {
  readonly schema: string;
  readonly rungs: readonly {
    name: string; order: number; promotesTo: string | null;
    requiresHumanApproval: boolean; requiresEvidenceClass: readonly string[];
  }[];
  readonly environments: readonly { name: string; rung: string }[];
  readonly gates: readonly { name: string; from: string; to: string; requiresHumanApproval: boolean; refuses: readonly string[] }[];
  readonly required: readonly { contract: string; declared: boolean }[];
  readonly notRequired: readonly { contract: string; declared: boolean; reason: string | null }[];
  readonly bindings: readonly {
    binding: string; environment: string | null; status: string;
    contracts: readonly string[]; unresolvedDecisions: number; requiresExternalAuthority: string | null;
  }[];
  readonly parityDispositions: readonly { disposition: string; status: string; appliesToFacet: string | null }[];
  readonly secrets: readonly { requirement: string; resolver: string; consequence: string | null }[];
  readonly externalDecisions: readonly { decision: string; secret: boolean; contract: string | null; authority: string | null }[];
}

export function loadDelivery(root: string): DeliveryProjection {
  return JSON.parse(readFileSync(resolve(root, "packages/architecture/delivery.json"), "utf8")) as DeliveryProjection;
}

/** Anything shaped like a credential, which authority must never hold. */
const SECRET_SHAPED = /\b(?:sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{8,}|eyJ[A-Za-z0-9_-]{12,}|AKIA[0-9A-Z]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/u;

export function deliveryClosure(delivery: DeliveryProjection): readonly DeliveryFinding[] {
  const findings: DeliveryFinding[] = [];
  const blocking = (code: string, detail: string): void => { findings.push({ code, detail, severity: "blocking" }); };

  for (const entry of delivery.required) {
    if (!entry.declared) blocking("DELIVERY_REQUIREMENT_UNCONTRACTED", `${entry.contract} is required and resolves to no declared contract`);
  }
  for (const entry of delivery.notRequired) {
    if (!entry.declared) blocking("DELIVERY_REQUIREMENT_UNCONTRACTED", `${entry.contract} is excluded but is not a declared contract`);
    if ((entry.reason ?? "").length < 40) blocking("DELIVERY_EXCLUSION_UNREASONED", `${entry.contract} is excluded without a reviewable reason`);
  }
  const requiredSet = new Set(delivery.required.map((entry) => entry.contract));
  for (const entry of delivery.notRequired) {
    if (requiredSet.has(entry.contract)) blocking("DELIVERY_REQUIREMENT_CONTRADICTED", `${entry.contract} is both required and explicitly not required`);
  }

  // Rung ordering: total, and each promotes to exactly the next.
  const order = new Map(delivery.rungs.map((rung) => [rung.name, rung.order]));
  for (const rung of delivery.rungs) {
    if (rung.promotesTo === null) continue;
    if (order.get(rung.promotesTo) !== rung.order + 1) {
      blocking("DELIVERY_RUNG_ORDER_BROKEN", `${rung.name} promotes to ${rung.promotesTo}, which is not the next rung`);
    }
    if (rung.requiresEvidenceClass.length === 0) blocking("DELIVERY_RUNG_WITHOUT_EVIDENCE", `${rung.name} requires no evidence class`);
  }
  const approving = delivery.rungs.filter((rung) => rung.requiresHumanApproval).map((rung) => rung.name);
  if (approving.join(",") !== "production") {
    blocking("DELIVERY_APPROVAL_POSTURE_WRONG", `human approval must be required at production alone, not [${approving.join(", ")}]`);
  }

  // Every environment belongs to a declared rung.
  for (const environment of delivery.environments) {
    if (!order.has(environment.rung)) blocking("DELIVERY_ENVIRONMENT_UNRUNGED", `${environment.name} names unknown rung ${environment.rung}`);
  }

  // A binding is complete or explicitly unresolved with its decisions named.
  for (const binding of delivery.bindings) {
    if (binding.status === "bound" && binding.unresolvedDecisions > 0) {
      blocking("DELIVERY_BINDING_INCOMPLETE", `${binding.binding} claims to be bound with ${binding.unresolvedDecisions} open decisions`);
    }
    if (binding.status === "unresolved") {
      if (binding.unresolvedDecisions === 0) blocking("DELIVERY_BINDING_INCOMPLETE", `${binding.binding} is unresolved without saying what is missing`);
      if (binding.requiresExternalAuthority === null) blocking("DELIVERY_BINDING_INCOMPLETE", `${binding.binding} is unresolved and names no authority to resolve it`);
    }
    if (binding.contracts.length === 0) blocking("DELIVERY_BINDING_INCOMPLETE", `${binding.binding} binds no contract`);
  }

  // Secrets are names, resolvers and consequences.
  for (const secret of delivery.secrets) {
    if ((secret.consequence ?? "").length < 20) blocking("SECRET_REQUIREMENT_UNRESOLVED", `${secret.requirement} does not say what breaks without it`);
  }
  const text = JSON.stringify(delivery);
  if (SECRET_SHAPED.test(text)) blocking("SECRET_VALUE_IN_AUTHORITY", "the delivery projection carries something shaped like a credential");

  // Every external decision names its contract and its authority.
  for (const decision of delivery.externalDecisions) {
    if (decision.authority === null) blocking("DELIVERY_BINDING_INCOMPLETE", `${decision.decision} names no supplying authority`);
    if (decision.contract === null) blocking("DELIVERY_REQUIREMENT_UNCONTRACTED", `${decision.decision} names no requiring contract`);
  }

  // A required-and-unrealised facet must name the facet it disposes of, so a
  // derived work unit for it can be declined with a reason.
  for (const disposition of delivery.parityDispositions) {
    if (disposition.appliesToFacet === null) {
      blocking("DELIVERY_DISPOSITION_UNATTACHED", `${disposition.disposition} names no facet, so a work unit derived for it looks like undone work`);
    }
  }
  return Object.freeze(findings);
}

/** The declared viewport classes and a representative width for each. */
export const VIEWPORTS: readonly { readonly viewportClass: string; readonly width: number; readonly height: number }[] = [
  { viewportClass: "compact", width: 390, height: 844 },
  { viewportClass: "regular", width: 834, height: 1112 },
  { viewportClass: "wide", width: 1440, height: 900 },
];

export interface RenderedAction {
  readonly action: string;
  /** Whether a user could invoke it now, as opposed to merely see it. */
  readonly operable: boolean;
  /** Set when it is present and not operable, so the reason is checkable. */
  readonly disabledReason: string | null;
}

export interface RenderedSurface {
  readonly actions: readonly RenderedAction[];
  readonly roles: readonly string[];
  readonly headingCount: number;
  readonly landmarkPresent: boolean;
  readonly controls: readonly { readonly named: boolean; readonly outline: string }[];
  readonly unresolvedDescriptions: readonly string[];
  readonly primaryActionState: ViewportEvidence["primaryActionState"];
  /** The experience state the surface is in when observed. */
  readonly observedState: string;
}

/**
 * Observe the rendered surface.
 *
 * Injected rather than imported so this module carries no framework or DOM
 * dependency of its own: the caller mounts the surface and hands back what it
 * saw. That keeps the delivery checker usable where no document exists, and it
 * keeps the assurance boundary free of the rendering stack it checks.
 */
export type SurfaceObserver = (viewport: { width: number; height: number }) => Promise<RenderedSurface>;

export function uiFindings(
  experience: Experience,
  viewportClass: string,
  surface: RenderedSurface,
): readonly DeliveryFinding[] {
  const findings: DeliveryFinding[] = [];
  const blocking = (code: string, detail: string): void => {
    findings.push({ code, detail: `${viewportClass}: ${detail}`, severity: "blocking" });
  };

  if (!surface.landmarkPresent) blocking("UI_LANDMARK_ABSENT", "the surface exposes no main landmark");
  if (surface.headingCount === 0) blocking("UI_HEADING_ABSENT", "the surface exposes no heading");
  if (surface.controls.length === 0) blocking("UI_NO_CONTROLS", "the surface rendered no interactive control");
  for (const control of surface.controls) {
    if (!control.named) blocking("UI_CONTROL_UNNAMED", `a control carries no accessible name: ${control.outline}`);
  }
  for (const reference of surface.unresolvedDescriptions) {
    blocking("UI_DESCRIPTION_UNRESOLVED", `aria-describedby names a missing or empty element: ${reference}`);
  }
  if (surface.primaryActionState === "absent") {
    blocking("UI_PRIMARY_ACTION_ABSENT", "the primary action is neither operable nor disabled with a reason; it is missing");
  }

  // Both directions, but state-aware.
  //
  // The first attempt asserted that every declared action is rendered at every
  // viewport, and it reported dismiss-failure as missing. The surface was
  // right and the assertion was wrong: dismiss-failure is permitted only in
  // the failed state, and rendering it in the empty state would be the actual
  // defect. So what must hold is that the actions the observed state permits
  // are all present, that nothing the state withholds is present, and that
  // every rendered action is declared somewhere.
  const declaredActions = new Set(experience.actions.map((action) => action.name));
  const rendered = new Set(surface.actions.map((entry) => entry.action));
  const byAction = new Map(surface.actions.map((entry) => [entry.action, entry]));
  const state = experience.states.find((candidate) => candidate.name === surface.observedState);
  if (state === undefined) {
    blocking("UI_STATE_UNDECLARED", `the surface reports state ${surface.observedState}, which authority does not declare`);
  } else {
    for (const action of state.permits) {
      const entry = byAction.get(action);
      if (entry === undefined) {
        blocking("UI_PERMITTED_ACTION_NOT_RENDERED", `state ${state.name} permits ${action} and the surface does not offer it`);
      } else if (!entry.operable) {
        blocking("UI_PERMITTED_ACTION_NOT_OPERABLE", `state ${state.name} permits ${action} and the surface renders it inoperable`);
      }
    }
    // Withheld means not invocable, not absent. Rendering a withheld action
    // disabled with a stated reason is the accessibility behaviour this product
    // deliberately chose: hiding it would remove the explanation along with the
    // control. So what must never happen is a withheld action being operable.
    for (const action of state.withholds) {
      const entry = byAction.get(action);
      if (entry === undefined) continue;
      if (entry.operable) {
        blocking("UI_WITHHELD_ACTION_OPERABLE", `state ${state.name} withholds ${action} and the surface lets a user invoke it`);
      } else if ((entry.disabledReason ?? "").trim().length === 0) {
        blocking("UI_WITHHELD_ACTION_UNEXPLAINED", `state ${state.name} withholds ${action} and the surface offers it with no stated reason`);
      }
    }
  }
  for (const action of rendered) {
    if (!declaredActions.has(action)) blocking("UI_RENDERED_ACTION_UNDECLARED", `rendered action ${action} is not declared`);
  }
  // And every declared action must be reachable in at least one declared state,
  // which is the property the naive per-viewport check was reaching for.
  for (const action of declaredActions) {
    const reachable = experience.states.some((candidate) => candidate.permits.includes(action));
    if (!reachable) blocking("UI_DECLARED_ACTION_UNREACHABLE", `declared action ${action} is permitted by no state`);
  }
  const declaredRoles = new Set(experience.roles.map((role) => role.name));
  for (const role of surface.roles) {
    if (!declaredRoles.has(role)) blocking("UI_RENDERED_ROLE_UNKNOWN", `rendered design role ${role} is not declared`);
  }
  return Object.freeze(findings);
}

export async function checkDelivery(root: string, observe: SurfaceObserver | null = null): Promise<DeliveryReport> {
  const delivery = loadDelivery(root);
  const experience = loadExperience(root);
  const closureFindings = deliveryClosure(delivery);
  const collectedUi: DeliveryFinding[] = [];
  const viewports: ViewportEvidence[] = [];

  if (observe !== null) {
    for (const viewport of VIEWPORTS) {
      const surface = await observe(viewport);
      collectedUi.push(...uiFindings(experience, viewport.viewportClass, surface));
      viewports.push({
        viewportClass: viewport.viewportClass,
        width: viewport.width,
        renderedActions: surface.actions.map((entry) => `${entry.action}${entry.operable ? "" : "(disabled)"}`).sort(),
        renderedRoles: [...new Set(surface.roles)].sort(),
        headingCount: surface.headingCount,
        landmarkPresent: surface.landmarkPresent,
        controlCount: surface.controls.length,
        namedControlCount: surface.controls.filter((control) => control.named).length,
        primaryActionState: surface.primaryActionState,
        observedState: surface.observedState,
      });
    }
  } else {
    collectedUi.push({
      code: "UI_NOT_OBSERVED",
      detail: "no surface observer was supplied, so no user-interface claim is made",
      severity: "blocking",
    });
  }

  const blockingCount = [...closureFindings, ...collectedUi].filter((finding) => finding.severity === "blocking").length;
  return Object.freeze({
    schema: "urn:anqr:delivery-report:1",
    closureFindings,
    uiFindings: Object.freeze(collectedUi),
    viewports: Object.freeze(viewports),
    blockingCount,
    conforming: blockingCount === 0,
  });
}
