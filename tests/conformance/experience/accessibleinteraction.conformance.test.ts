import assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/experience/accessibleinteraction.ts";

test("accessibleinteractioncontracts", () => {
  const first = capability.createControl("create", "Create artefact", "button", "enabled");
  const second = capability.createControl("customise", "Customise artefact");

  const validated = capability.validateControl(first);
  if (!validated.success) {
    assert.fail("a control created with a name, role and state must validate");
  }
  assert.equal(validated.control.accessibleName, "Create artefact");
  assert.equal(validated.control.role, "button");
  assert.equal(validated.control.currentState, "enabled");

  const ordered = capability.setFocusOrder([first, second]);
  assert.equal(ordered.length, 2);
  assert.equal(ordered[0]?.focusOrder, 0);
  assert.equal(ordered[1]?.focusOrder, 1);

  assert.throws(() => capability.createControl("nameless", ""));
  assert.throws(() => capability.createControl("roleless", "Named", ""));
  assert.throws(() => capability.createControl("stateless", "Named", "button", " "));
});

test("accessibleinteractionerrormodel", () => {
  const unnamed: capability.InteractiveControl = {
    id: "unnamed",
    accessibleName: "",
    role: "button",
    currentState: "enabled",
  };
  const refusal = capability.validateControl(unnamed);
  if (refusal.success) {
    assert.fail("a control without an accessible name must be refused");
  }
  assert.equal(refusal.error.role, capability.ALERT_ROLE);
  assert.equal(refusal.error.liveRegion, capability.LIVE_REGION_ASSERTIVE);
  assert.ok(refusal.error.message.includes("unnamed"));
  assert.ok(refusal.error.message.trim().length > 0);

  const accepted = capability.validateControl(
    capability.createControl("named", "Named control")
  );
  if (!accepted.success) {
    assert.fail("a fully described control must not be refused");
  }
  assert.equal(accepted.control.id, "named");
});

test("accessibleinteractionuisemantics", () => {
  const preview = capability.createControl("preview", "Artefact preview", "img", "rendered");
  const exportButton = capability.createControl("export", "Export artefact");

  const focused = capability.applyVisibleFocus(preview);
  assert.equal(focused.focusVisible, true);
  assert.equal(preview.focusVisible, undefined);

  const readingOrder = [preview, exportButton];
  const ordered = capability.setFocusOrder(readingOrder);
  for (let index = 0; index < ordered.length; index += 1) {
    assert.equal(ordered[index]?.focusOrder, index);
    assert.equal(ordered[index]?.id, readingOrder[index]?.id);
  }

  const described = capability.setPreviewAltText(
    preview,
    "QR code encoding the shared collection link"
  );
  assert.equal(described.previewAltText, "QR code encoding the shared collection link");

  assert.throws(() => capability.setPreviewAltText(preview, ""));
  assert.throws(() => capability.setPreviewAltText(preview, "   "));
});

test("accessibleinteractionvalidation", () => {
  const created = capability.createControl("artefact", "New artefact", "button", "enabled");
  const customise = (control: capability.InteractiveControl): capability.InteractiveControl =>
    capability.ensureKeyboardAccessible({ ...control, currentState: "customised" });

  let exportedName: string | null = null;
  const exportFn = (control: capability.InteractiveControl): string => {
    exportedName = control.accessibleName;
    return control.accessibleName;
  };

  const outcome = capability.exerciseKeyboardPath(created, customise, exportFn);
  if (!outcome.success) {
    assert.fail("a valid keyboard-only path must complete");
  }
  assert.ok(outcome.control.accessibleName.trim().length > 0);
  assert.ok(outcome.control.role.trim().length > 0);
  assert.equal(outcome.control.tabIndex, 0);
  assert.equal(outcome.control.currentState, "customised");
  assert.equal(exportedName, "New artefact");

  exportedName = null;
  const stripName = (control: capability.InteractiveControl): capability.InteractiveControl => ({
    ...control,
    accessibleName: "",
  });
  const refused = capability.exerciseKeyboardPath(created, stripName, exportFn);
  if (refused.success) {
    assert.fail("a customisation that removes the accessible name must be refused");
  }
  assert.equal(refused.error.role, capability.ALERT_ROLE);
  assert.equal(exportedName, null);

  const neverCustomise = (control: capability.InteractiveControl): capability.InteractiveControl =>
    control;
  const invalidStart: capability.InteractiveControl = {
    id: "roleless",
    accessibleName: "Named",
    role: "",
    currentState: "enabled",
  };
  const refusedAtStart = capability.exerciseKeyboardPath(invalidStart, neverCustomise, exportFn);
  if (refusedAtStart.success) {
    assert.fail("a control without a role must not begin the path");
  }
  assert.ok(refusedAtStart.error.message.includes("roleless"));
  assert.equal(exportedName, null);
});

test("architectureaccessibilityconformance", () => {
  const surface = [
    capability.createControl("create", "Create artefact", "button", "enabled"),
    capability.createControl("customise", "Customise artefact", "button", "enabled"),
    capability.createControl("export", "Export artefact", "button", "disabled"),
  ];

  const rendered = capability
    .setFocusOrder(surface)
    .map((control) => capability.applyVisibleFocus(capability.ensureKeyboardAccessible(control)));

  assert.equal(rendered.length, surface.length);
  for (let index = 0; index < rendered.length; index += 1) {
    const control = rendered[index];
    assert.ok(control !== undefined);
    const validated = capability.validateControl(control);
    if (!validated.success) {
      assert.fail(`rendered control "${control.id}" must satisfy its accessibility obligations`);
    }
    assert.ok(validated.control.accessibleName.trim().length > 0);
    assert.ok(validated.control.role.trim().length > 0);
    assert.ok(validated.control.currentState.trim().length > 0);
    assert.equal(validated.control.focusOrder, index);
    assert.equal(validated.control.tabIndex, 0);
    assert.equal(validated.control.focusVisible, true);
  }

  const stateless: capability.InteractiveControl = {
    id: "stateless",
    accessibleName: "Named",
    role: "button",
    currentState: "",
  };
  const refused = capability.validateControl(capability.ensureKeyboardAccessible(stateless));
  if (refused.success) {
    assert.fail("a surface containing a control without a state must be refused");
  }
  assert.equal(refused.error.role, capability.ALERT_ROLE);
  assert.equal(refused.error.liveRegion, capability.LIVE_REGION_ASSERTIVE);
});