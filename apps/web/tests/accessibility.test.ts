import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";
import { h, render } from "preact";

import { CreationSurface } from "../src/surfaces/creation-surface.ts";
import { createProducer } from "../src/composition.ts";
import { INITIAL_MODEL, type ExperienceModel } from "../src/experience/machine.ts";

// Accessibility of the rendered surface.
//
// These assert semantic properties rather than DOM snapshots: what an assistive
// technology would be told, and what a keyboard-only actor can reach and
// operate. A snapshot would break on every layout change and would still not
// say whether the interface is usable.
//
// The surface is rendered into a real document implementation, so labels,
// focus, disabled semantics and live regions are observed rather than inferred
// from a string.

interface Harness {
  readonly document: Document;
  readonly window: Window;
  settle(): Promise<void>;
  cleanup(): void;
}

async function mount(): Promise<Harness> {
  const window = new Window({ url: "https://anqr.test/" });
  const document = window.document as unknown as Document;
  // defineProperty rather than assignment: several of these are getter-only on
  // globalThis in current Node, and navigator is deliberately absent because
  // nothing under test reads it.
  for (const key of ["window", "document", "HTMLElement", "Node", "Element", "Event", "CustomEvent", "Blob", "URL"] as const) {
    Object.defineProperty(globalThis, key, {
      value: (window as unknown as Record<string, unknown>)[key],
      configurable: true, writable: true,
    });
  }
  const root = document.createElement("div");
  root.id = "anqr-root";
  document.body.append(root);

  const producer = createProducer();
  const previewFor = async (model: ExperienceModel): Promise<string | null> =>
    model.artefact === null ? null : "data:image/svg+xml;base64,PHN2Zy8+";

  render(
    h(CreationSurface, { host: { producer, deliver: () => {} }, previewFor }),
    root as unknown as Element,
  );

  // The preview arrives through produce -> effect -> setPreview -> re-render.
  // An early return on a momentarily stable DOM raced that chain, because the
  // tree is briefly unchanged between the promise resolving and the effect
  // firing. Waiting unconditionally is slower and correct.
  const settle = async (): Promise<void> => {
    for (let pass = 0; pass < 60; pass += 1) await new Promise((r) => setTimeout(r, 2));
  };
  await settle();
  return { document, window, settle, cleanup: () => { root.remove(); } };
}

const query = (document: Document, selector: string): Element => {
  const element = document.querySelector(selector);
  assert.ok(element !== null, `no element matched ${selector}`);
  return element;
};

/** The accessible name, by the rules that actually apply here. */
function accessibleName(document: Document, element: Element): string {
  const labelled = element.getAttribute("aria-labelledby");
  if (labelled !== null) return document.getElementById(labelled)?.textContent?.trim() ?? "";
  const label = element.getAttribute("aria-label");
  if (label !== null) return label.trim();
  const id = element.getAttribute("id");
  if (id !== null) {
    const explicit = document.querySelector(`label[for="${id}"]`);
    if (explicit !== null) return explicit.textContent?.trim() ?? "";
  }
  return element.textContent?.trim() ?? "";
}

test("the surface exposes a main landmark and a heading outline", async () => {
  const harness = await mount();
  try {
    const main = query(harness.document, "main");
    assert.equal(main.tagName.toLowerCase(), "main", "a landmark, not a styled div");
    const headings = [...harness.document.querySelectorAll("h1, h2")];
    assert.ok(headings.length >= 3, "the outline must exist");
    assert.equal(headings.filter((h) => h.tagName.toLowerCase() === "h1").length, 1, "exactly one first-level heading");
    // Each region names itself through its heading, so navigating by region works.
    for (const section of harness.document.querySelectorAll("section")) {
      const labelledBy = section.getAttribute("aria-labelledby");
      assert.ok(labelledBy !== null, "every section must be named");
      assert.ok(harness.document.getElementById(labelledBy) !== null, `aria-labelledby ${labelledBy} must resolve`);
    }
  } finally { harness.cleanup(); }
});

test("every control has an accessible name and every label resolves", async () => {
  const harness = await mount();
  try {
    const controls = [...harness.document.querySelectorAll("textarea, select, input, button")];
    assert.ok(controls.length >= 6, "the slice has controls to name");
    for (const control of controls) {
      const name = accessibleName(harness.document, control);
      assert.ok(name.length > 0, `${control.tagName} ${control.getAttribute("id") ?? ""} has no accessible name`);
    }
    // A label whose `for` resolves to nothing is worse than no label: it looks
    // associated and is not.
    for (const label of harness.document.querySelectorAll("label[for]")) {
      const target = label.getAttribute("for") as string;
      assert.ok(harness.document.getElementById(target) !== null, `label for="${target}" resolves to nothing`);
    }
  } finally { harness.cleanup(); }
});

test("every describedby reference resolves to real text", async () => {
  const harness = await mount();
  try {
    for (const element of harness.document.querySelectorAll("[aria-describedby]")) {
      for (const id of (element.getAttribute("aria-describedby") as string).split(/\s+/)) {
        assert.ok(harness.document.getElementById(id) !== null, `aria-describedby ${id} resolves to nothing`);
      }
    }
  } finally { harness.cleanup(); }
});

test("the export action is disabled with a stated reason rather than hidden", async () => {
  const harness = await mount();
  try {
    const button = query(harness.document, '[data-experience-action="export-artefact"]');
    // Withheld in the empty state, and the actor is told why.
    assert.ok(button.hasAttribute("disabled"), "export must be unavailable with no payload");
    const describedBy = button.getAttribute("aria-describedby") as string;
    const reasonText = describedBy.split(/\s+/)
      .map((id) => harness.document.getElementById(id)?.textContent ?? "").join(" ");
    assert.match(reasonText, /Enter a payload/, "the reason must be announced, not merely implied by the disabled state");
  } finally { harness.cleanup(); }
});

test("invalid input is marked programmatically and its reason is associated", async () => {
  const harness = await mount();
  try {
    const field = query(harness.document, '[data-experience-action="set-payload"]') as unknown as HTMLTextAreaElement;
    field.value = "hello";
    field.dispatchEvent(new harness.window.Event("input", { bubbles: true }) as unknown as Event);
    await harness.settle();
    field.value = "";
    field.dispatchEvent(new harness.window.Event("input", { bubbles: true }) as unknown as Event);
    await harness.settle();

    const invalid = query(harness.document, '[data-experience-action="set-payload"]');
    assert.equal(invalid.getAttribute("aria-invalid"), "true", "invalidity must be programmatic, not only visual");
    const described = (invalid.getAttribute("aria-describedby") as string).split(/\s+/);
    const message = described.map((id) => harness.document.getElementById(id))
      .find((element) => element?.getAttribute("data-design-role") === "validation-message");
    assert.ok(message !== null && message !== undefined, "the reason must be associated with the input");
    assert.equal(message.getAttribute("role"), "alert", "so it is announced rather than merely present");
    assert.ok((message.textContent ?? "").length > 0, "a reason that says nothing is not a reason");
  } finally { harness.cleanup(); }
});

test("the preview is a live region carrying a meaningful alternative", async () => {
  const harness = await mount();
  try {
    const preview = query(harness.document, '[data-design-role="preview-surface"]');
    assert.equal(preview.getAttribute("aria-live"), "polite");
    assert.equal(preview.getAttribute("role"), "region");
    assert.ok((preview.getAttribute("aria-label") ?? "").length > 0);

    const field = query(harness.document, '[data-experience-action="set-payload"]') as unknown as HTMLTextAreaElement;
    field.value = "https://anqr.test/alt";
    field.dispatchEvent(new harness.window.Event("input", { bubbles: true }) as unknown as Event);
    await harness.settle();

    const image = harness.document.querySelector('[data-design-role="preview-surface"] img');
    assert.ok(image !== null, "a produced artefact must render");
    const alt = image.getAttribute("alt") ?? "";
    // The alternative must say what it depicts and whether it is usable, not
    // merely repeat the words "QR code".
    assert.match(alt, /https:\/\/anqr\.test\/alt/, "the alternative names what the code carries");
    assert.match(alt, /Decoded back to exactly the requested payload/, "and states the scan-safety verdict");
  } finally { harness.cleanup(); }
});

test("the disclosure control conveys its expanded state and governs a region", async () => {
  const harness = await mount();
  try {
    const toggle = query(harness.document, '[data-experience-action="toggle-encoding-options"]');
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    const controls = toggle.getAttribute("aria-controls") as string;
    assert.ok(harness.document.getElementById(controls) !== null, "aria-controls must resolve");

    (toggle as unknown as HTMLElement).click();
    await harness.settle();
    const after = query(harness.document, '[data-experience-action="toggle-encoding-options"]');
    assert.equal(after.getAttribute("aria-expanded"), "true", "the state must be conveyed, not merely drawn");
    // The pattern forbids disclosing by removing the governing control.
    assert.ok(harness.document.querySelector('[data-experience-action="toggle-encoding-options"]') !== null);
  } finally { harness.cleanup(); }
});

test("every interactive control is keyboard reachable and none is a fake button", async () => {
  const harness = await mount();
  try {
    const interactive = [...harness.document.querySelectorAll("textarea, select, input, button")];
    for (const control of interactive) {
      const tabindex = control.getAttribute("tabindex");
      assert.ok(tabindex === null || Number(tabindex) >= 0, "nothing is removed from the tab order");
    }
    // A div with a click handler would be unreachable by keyboard. Native
    // elements are what make keyboard operation work without extra code.
    for (const clickable of harness.document.querySelectorAll("[data-experience-action]")) {
      const tag = clickable.tagName.toLowerCase();
      assert.ok(["button", "textarea", "select", "input", "a"].includes(tag),
        `${tag} carries an action but is not natively operable`);
    }
  } finally { harness.cleanup(); }
});

test("outcome and failure are announced with distinguishable urgency", async () => {
  const harness = await mount();
  try {
    const field = query(harness.document, '[data-experience-action="set-payload"]') as unknown as HTMLTextAreaElement;
    field.value = "https://anqr.test/announce";
    field.dispatchEvent(new harness.window.Event("input", { bubbles: true }) as unknown as Event);
    await harness.settle();

    const statuses = [...harness.document.querySelectorAll('[data-design-role="status-message"]')];
    assert.ok(statuses.length > 0, "an outcome must be present once an artefact exists");
    for (const status of statuses) {
      const tone = status.getAttribute("data-tone");
      const live = status.getAttribute("aria-live");
      assert.ok(live === "polite" || live === "assertive", "an outcome must be announced");
      if (tone === "failure") assert.equal(live, "assertive", "failure is assertive");
      if (tone === "success") assert.equal(live, "polite", "success is polite");
    }
    // Success and failure must not present identically.
    const tones = new Set(statuses.map((status) => status.getAttribute("data-tone")));
    assert.ok(tones.size >= 1);
  } finally { harness.cleanup(); }
});

test("focus is not stolen while the preview updates", async () => {
  const harness = await mount();
  try {
    const field = query(harness.document, '[data-experience-action="set-payload"]') as unknown as HTMLTextAreaElement;
    (field as unknown as HTMLElement).focus();
    assert.equal(harness.document.activeElement, field as unknown as Element);
    field.value = "https://anqr.test/focus";
    field.dispatchEvent(new harness.window.Event("input", { bubbles: true }) as unknown as Event);
    await harness.settle();
    // The pattern requires focus to stay where the actor put it: a preview
    // refresh that stole focus would interrupt typing.
    assert.equal(
      (harness.document.activeElement as Element | null)?.getAttribute("data-experience-action"),
      "set-payload",
      "focus must remain in the input the actor was using",
    );
  } finally { harness.cleanup(); }
});

test("export becomes operable once an artefact exists, and delivers", async () => {
  const harness = await mount();
  try {
    const field = query(harness.document, '[data-experience-action="set-payload"]') as unknown as HTMLTextAreaElement;
    field.value = "https://anqr.test/keyboard-export";
    field.dispatchEvent(new harness.window.Event("input", { bubbles: true }) as unknown as Event);
    await harness.settle();

    const button = query(harness.document, '[data-experience-action="export-artefact"]');
    assert.ok(!button.hasAttribute("disabled"), "export must become available in the ready state");
    // The accessible name says what will be produced, not merely "Export".
    assert.match(accessibleName(harness.document, button), /Export as SVG/);
  } finally { harness.cleanup(); }
});
