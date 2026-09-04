// The delivery gate, run as a command.
//
// It mounts the real creation surface in a document implementation at each
// declared viewport class and hands the observations to the checker. The
// mounting lives here rather than in the checker so the checker keeps no
// framework dependency, and so a caller with no document can still run the
// closure half.

import { Window } from "happy-dom";
import { h, render } from "preact";

import { checkDelivery, type RenderedSurface, type SurfaceObserver } from "./delivery.ts";
import { CreationSurface } from "../../../apps/web/src/surfaces/creation-surface.ts";
import { createProducer } from "../../../apps/web/src/composition.ts";
import type { ExperienceModel } from "../../../apps/web/src/experience/machine.ts";

const repositoryRoot = new URL("../../..", import.meta.url).pathname;

const observe: SurfaceObserver = async (viewport) => {
  const window = new Window({ url: "https://anqr.test/", width: viewport.width, height: viewport.height });
  const document = window.document as unknown as Document;
  for (const key of ["window", "document", "HTMLElement", "Node", "Element", "Event", "CustomEvent", "Blob", "URL"] as const) {
    Object.defineProperty(globalThis, key, {
      value: (window as unknown as Record<string, unknown>)[key], configurable: true, writable: true,
    });
  }
  const root = document.createElement("div");
  document.body.append(root);
  const previewFor = async (model: ExperienceModel): Promise<string | null> =>
    model.artefact === null ? null : "data:image/svg+xml;base64,PHN2Zy8+";
  render(h(CreationSurface, { host: { producer: createProducer(), deliver: () => {} }, previewFor }), root as unknown as Element);
  for (let pass = 0; pass < 40; pass += 1) await new Promise((resolve) => setTimeout(resolve, 2));

  const controls = [...document.querySelectorAll("input, select, textarea, button")].map((control) => {
    const id = control.getAttribute("id");
    const named = (id !== null && document.querySelector(`label[for="${id}"]`) !== null)
      || (control.getAttribute("aria-label") ?? "").trim().length > 0
      || (control.textContent ?? "").trim().length > 0;
    return { named, outline: control.outerHTML.slice(0, 90) };
  });

  const unresolved: string[] = [];
  for (const element of [...document.querySelectorAll("[aria-describedby]")]) {
    for (const reference of (element.getAttribute("aria-describedby") ?? "").split(/\s+/u).filter(Boolean)) {
      const target = document.getElementById(reference);
      if (target === null || (target.textContent ?? "").trim().length === 0) unresolved.push(reference);
    }
  }

  const primary = document.querySelector('[data-design-role="primary-action"], [data-design-role="export-action"]');
  const primaryButton = primary?.querySelector("button") ?? (primary?.tagName === "BUTTON" ? primary : null);
  const primaryActionState: RenderedSurface["primaryActionState"] = primaryButton === null || primaryButton === undefined
    ? "absent"
    : primaryButton.hasAttribute("disabled")
      ? ((primaryButton.getAttribute("aria-describedby") ?? "").length > 0 || (primaryButton.textContent ?? "").trim().length > 0
        ? "disabled-with-reason" : "absent")
      : "operable";

  const surface: RenderedSurface = {
    actions: [...new Map([...document.querySelectorAll("[data-experience-action]")].map((element) => {
      const action = element.getAttribute("data-experience-action") ?? "";
      const control = element.tagName === "BUTTON" || element.tagName === "INPUT" || element.tagName === "SELECT"
        ? element : element.querySelector("button, input, select, textarea");
      const disabled = control?.hasAttribute("disabled") ?? false;
      const describedBy = control?.getAttribute("aria-describedby") ?? "";
      const reason = describedBy.split(/\s+/u).filter(Boolean)
        .map((reference) => document.getElementById(reference)?.textContent ?? "").join(" ").trim()
        || (element.textContent ?? "").trim();
      return [action, { action, operable: !disabled, disabledReason: disabled ? reason : null }] as const;
    }).filter(([action]) => action !== "")).values()],
    roles: [...document.querySelectorAll("[data-design-role]")].map((element) => element.getAttribute("data-design-role") ?? "").filter(Boolean),
    headingCount: document.querySelectorAll("h1, h2, h3").length,
    landmarkPresent: document.querySelector("main") !== null,
    controls,
    unresolvedDescriptions: unresolved,
    primaryActionState,
    // The surface is mounted fresh with no payload, so it is in the empty
    // state. Read from the surface rather than assumed, so a surface that
    // starts somewhere else is a finding rather than a silent pass.
    observedState: document.querySelector("[data-experience-state]")?.getAttribute("data-experience-state") ?? "empty",
  };
  render(null, root as unknown as Element);
  window.close();
  return surface;
};

const report = await checkDelivery(repositoryRoot, observe);
const asJson = process.argv.includes("--json");
const out = (text: string): void => { (asJson ? process.stderr : process.stdout).write(text); };

out("ANQR delivery check\n");
for (const viewport of report.viewports) {
  out(`  ${viewport.viewportClass.padEnd(8)} ${String(viewport.width).padStart(5)}px  actions ${viewport.renderedActions.length}`
    + `  roles ${viewport.renderedRoles.length}  controls ${viewport.namedControlCount}/${viewport.controlCount} named`
    + `  state ${viewport.observedState}  primary ${viewport.primaryActionState}\n`);
}
out(`  closure findings ${report.closureFindings.length}, interface findings ${report.uiFindings.length}\n`);
out(`  blocking ${report.blockingCount}, conforming ${report.conforming}\n`);
if (asJson) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
for (const finding of [...report.closureFindings, ...report.uiFindings]) {
  process.stderr.write(`${finding.code} ${finding.detail}\n`);
}
if (!report.conforming) process.exitCode = 1;
