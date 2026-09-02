import assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/experience/guidedonboarding.ts";

test("guidedonboardingcontracts", () => {
  const artefact = capability.createDefaultArtefact();
  assert.ok(artefact.id, "artefact id should be non-empty");
  assert.ok(artefact.type, "artefact type should be non-empty");
  assert.ok(artefact.content, "artefact content should be non-empty");

  const controls = capability.getMinimalControlSet();
  assert.ok(Array.isArray(controls), "minimal control set should be an array");
  assert.strictEqual(controls.length, 3, "minimal control set should have 3 items");
  assert.ok(controls.includes("type-selector"));
  assert.ok(controls.includes("content-editor"));
  assert.ok(controls.includes("full-options-link"));

  const route = capability.getFullOptionsRoute();
  assert.strictEqual(route, "/onboarding/full-options");
});

test("guidedonboardingstatemodel", () => {
  const userId = "user-123";
  const state = capability.createInitialOnboardingState(userId, "en");
  assert.strictEqual(state.userId, userId);
  assert.strictEqual(state.dismissed, false);
  assert.strictEqual(state.language, "en");

  const audit: capability.AuditFunction = () => ({ ok: true });
  const result = capability.dismissOnboarding(state, audit);
  if (!result.success) {
    assert.fail(`dismissOnboarding failed: ${result.error.message}`);
  }
  assert.strictEqual(result.state.dismissed, true);
  assert.strictEqual(capability.isOnboardingDismissed(result.state), true);
});

test("guidedonboardinguisemantics", () => {
  const state = capability.createInitialOnboardingState("user-456", "en");
  const resultFr = capability.localiseOnboarding(state, "fr");
  if (!resultFr.success) {
    assert.fail(`localiseOnboarding failed: ${resultFr.error.message}`);
  }
  assert.strictEqual(resultFr.state.language, "fr");

  const resultXx = capability.localiseOnboarding(state, "xx");
  assert.ok(!resultXx.success, "unsupported language should fail");
  if (resultXx.success) {
    assert.fail("expected failure for unsupported language");
  } else {
    assert.strictEqual(resultXx.error.code, "INVALID_LANGUAGE");
  }
});

test("guidedonboardingvalidation", () => {
  const userId = "user-789";
  const result = capability.assertFirstSessionArtefact(userId, "en");
  if (!result.success) {
    assert.fail(`assertFirstSessionArtefact failed: ${result.error.message}`);
  }
  const state = result.state;

  const validation = capability.validateOnboardingState(state);
  if (!validation.success) {
    assert.fail(`validateOnboardingState failed: ${validation.error.message}`);
  }

  const audit: capability.AuditFunction = () => ({ ok: true });
  const dismissResult = capability.dismissOnboarding(state, audit);
  if (!dismissResult.success) {
    assert.fail(`dismissOnboarding failed: ${dismissResult.error.message}`);
  }
  assert.strictEqual(dismissResult.state.dismissed, true);
  assert.strictEqual(capability.isOnboardingDismissed(dismissResult.state), true);
});