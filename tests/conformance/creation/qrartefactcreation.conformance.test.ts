import assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/creation/qrartefactcreation.ts";

function assertDefaultOptions(used: capability.UsedOptions): void {
  assert.deepStrictEqual(used.core, capability.DEFAULT_CORE_OPTIONS);
  assert.deepStrictEqual(used.render, capability.DEFAULT_RENDER_OPTIONS);
  assert.deepStrictEqual(used.output, capability.DEFAULT_OUTPUT_OPTIONS);
  assert.deepStrictEqual(used.overlay, capability.DEFAULT_OVERLAY_OPTIONS);
  assert.deepStrictEqual(used.animation, capability.DEFAULT_ANIMATION_OPTIONS);
  assert.deepStrictEqual(used.safety, capability.DEFAULT_SAFETY_OPTIONS);
  assert.deepStrictEqual(used.metadata, capability.DEFAULT_METADATA_OPTIONS);
  assert.deepStrictEqual(used.qualityAssurance, capability.DEFAULT_QUALITY_ASSURANCE_OPTIONS);
}

test("qrartefactcreationcontracts", () => {
  const payload = "contracts-check";

  const defaultResult = capability.createArtefact({ payload });
  assert.strictEqual(defaultResult.success, true);
  if (!defaultResult.success) {
    return;
  }
  assertDefaultOptions(defaultResult.usedOptions);
  assert.strictEqual(defaultResult.artefact.payload, payload);
  assert.deepStrictEqual(defaultResult.artefact.options.core, capability.DEFAULT_CORE_OPTIONS);
  assert.deepStrictEqual(defaultResult.artefact.options.render, capability.DEFAULT_RENDER_OPTIONS);
  assert.deepStrictEqual(defaultResult.artefact.options.output, capability.DEFAULT_OUTPUT_OPTIONS);
  assert.deepStrictEqual(defaultResult.artefact.options.overlay, capability.DEFAULT_OVERLAY_OPTIONS);
  assert.deepStrictEqual(defaultResult.artefact.options.animation, capability.DEFAULT_ANIMATION_OPTIONS);
  assert.deepStrictEqual(defaultResult.artefact.options.safety, capability.DEFAULT_SAFETY_OPTIONS);
  assert.deepStrictEqual(defaultResult.artefact.options.metadata, capability.DEFAULT_METADATA_OPTIONS);
  assert.deepStrictEqual(defaultResult.artefact.options.qualityAssurance, capability.DEFAULT_QUALITY_ASSURANCE_OPTIONS);

  const coreOnly = capability.createArtefact({
    payload,
    core: {
      errorCorrectionLevel: "H",
      maskPattern: 3,
      moduleShape: "diamond",
      moduleSizePx: 10,
    },
  });
  assert.strictEqual(coreOnly.success, true);
  if (!coreOnly.success) {
    return;
  }
  assert.strictEqual(coreOnly.usedOptions.core.errorCorrectionLevel, "H");
  assert.strictEqual(coreOnly.usedOptions.core.maskPattern, 3);
  assert.strictEqual(coreOnly.usedOptions.core.moduleShape, "diamond");
  assert.strictEqual(coreOnly.usedOptions.core.moduleSizePx, 10);
  assert.deepStrictEqual(coreOnly.usedOptions.render, capability.DEFAULT_RENDER_OPTIONS);
  assert.deepStrictEqual(coreOnly.usedOptions.output, capability.DEFAULT_OUTPUT_OPTIONS);
  assert.deepStrictEqual(coreOnly.usedOptions.overlay, capability.DEFAULT_OVERLAY_OPTIONS);
  assert.deepStrictEqual(coreOnly.usedOptions.animation, capability.DEFAULT_ANIMATION_OPTIONS);
  assert.deepStrictEqual(coreOnly.usedOptions.safety, capability.DEFAULT_SAFETY_OPTIONS);
  assert.deepStrictEqual(coreOnly.usedOptions.metadata, capability.DEFAULT_METADATA_OPTIONS);
  assert.deepStrictEqual(coreOnly.usedOptions.qualityAssurance, capability.DEFAULT_QUALITY_ASSURANCE_OPTIONS);

  const renderOnly = capability.createArtefact({
    payload,
    render: {
      profile: "artistic",
      foregroundColor: "#123456",
      backgroundColor: "#FEDCBA",
      quietZoneModules: 2,
    },
  });
  assert.strictEqual(renderOnly.success, true);
  if (!renderOnly.success) {
    return;
  }
  assert.strictEqual(renderOnly.usedOptions.render.profile, "artistic");
  assert.strictEqual(renderOnly.usedOptions.render.foregroundColor, "#123456");
  assert.strictEqual(renderOnly.usedOptions.render.backgroundColor, "#FEDCBA");
  assert.strictEqual(renderOnly.usedOptions.render.quietZoneModules, 2);
  assert.deepStrictEqual(renderOnly.usedOptions.core, capability.DEFAULT_CORE_OPTIONS);

  const outputOnly = capability.createArtefact({
    payload,
    output: {
      format: "jpeg",
      sizePx: 320,
      marginPx: 8,
    },
  });
  assert.strictEqual(outputOnly.success, true);
  if (!outputOnly.success) {
    return;
  }
  assert.strictEqual(outputOnly.usedOptions.output.format, "jpeg");
  assert.strictEqual(outputOnly.usedOptions.output.sizePx, 320);
  assert.strictEqual(outputOnly.usedOptions.output.marginPx, 8);
  assert.deepStrictEqual(outputOnly.usedOptions.render, capability.DEFAULT_RENDER_OPTIONS);

  const overlayOnly = capability.createArtefact({
    payload,
    overlay: {
      shape: "logo",
      caption: "demo",
      centerFraction: 0.25,
    },
  });
  assert.strictEqual(overlayOnly.success, true);
  if (!overlayOnly.success) {
    return;
  }
  assert.strictEqual(overlayOnly.usedOptions.overlay.shape, "logo");
  assert.strictEqual(overlayOnly.usedOptions.overlay.caption, "demo");
  assert.strictEqual(overlayOnly.usedOptions.overlay.centerFraction, 0.25);
  assert.deepStrictEqual(overlayOnly.usedOptions.output, capability.DEFAULT_OUTPUT_OPTIONS);

  const animationOnly = capability.createArtefact({
    payload,
    animation: {
      style: "reveal",
      durationMs: 450,
    },
  });
  assert.strictEqual(animationOnly.success, true);
  if (!animationOnly.success) {
    return;
  }
  assert.strictEqual(animationOnly.usedOptions.animation.style, "reveal");
  assert.strictEqual(animationOnly.usedOptions.animation.durationMs, 450);
  assert.deepStrictEqual(animationOnly.usedOptions.overlay, capability.DEFAULT_OVERLAY_OPTIONS);

  const safetyOnly = capability.createArtefact({
    payload,
    safety: {
      profile: "restricted",
      blockedPayloads: ["forbidden"],
    },
  });
  assert.strictEqual(safetyOnly.success, true);
  if (!safetyOnly.success) {
    return;
  }
  assert.strictEqual(safetyOnly.usedOptions.safety.profile, "restricted");
  assert.deepStrictEqual([...safetyOnly.usedOptions.safety.blockedPayloads], ["forbidden"]);
  assert.deepStrictEqual(safetyOnly.usedOptions.metadata, capability.DEFAULT_METADATA_OPTIONS);

  const metadataOnly = capability.createArtefact({
    payload,
    metadata: {
      title: "T",
      description: "D",
      tags: ["a", "b"],
    },
  });
  assert.strictEqual(metadataOnly.success, true);
  if (!metadataOnly.success) {
    return;
  }
  assert.strictEqual(metadataOnly.usedOptions.metadata.title, "T");
  assert.strictEqual(metadataOnly.usedOptions.metadata.description, "D");
  assert.deepStrictEqual([...metadataOnly.usedOptions.metadata.tags], ["a", "b"]);
  assert.deepStrictEqual(metadataOnly.usedOptions.qualityAssurance, capability.DEFAULT_QUALITY_ASSURANCE_OPTIONS);

  const qualityOnly = capability.createArtefact({
    payload,
    qualityAssurance: {
      level: "rigorous",
      decodeCheck: false,
      contrastCheck: true,
    },
  });
  assert.strictEqual(qualityOnly.success, true);
  if (!qualityOnly.success) {
    return;
  }
  assert.strictEqual(qualityOnly.usedOptions.qualityAssurance.level, "rigorous");
  assert.strictEqual(qualityOnly.usedOptions.qualityAssurance.decodeCheck, false);
  assert.strictEqual(qualityOnly.usedOptions.qualityAssurance.contrastCheck, true);
  assert.deepStrictEqual(qualityOnly.usedOptions.core, capability.DEFAULT_CORE_OPTIONS);

  const resolved = capability.resolveOptions({ payload });
  assertDefaultOptions(resolved);
});

test("qrartefactcreationerrormodel", () => {
  const atCapacity = capability.createArtefact({
    payload: "a".repeat(2953),
    core: {
      errorCorrectionLevel: "L",
      maskPattern: 0,
      moduleShape: "square",
      moduleSizePx: 8,
    },
  });
  assert.strictEqual(atCapacity.success, true);

  const tooLarge = capability.createArtefact({
    payload: "a".repeat(2954),
    core: {
      errorCorrectionLevel: "L",
      maskPattern: 0,
      moduleShape: "square",
      moduleSizePx: 8,
    },
  });
  assert.strictEqual(tooLarge.success, false);
  if (!tooLarge.success) {
    assert.strictEqual(tooLarge.reason, "capacity-exceeded");
    assert.strictEqual(tooLarge.capacityLimit, 2953);
    assert.ok(tooLarge.message.includes("2954"));
    assert.ok(tooLarge.message.includes("2953"));
  }

  const badCoreLevel = "X" as capability.ErrorCorrectionLevel;
  const badCore = capability.createArtefact({
    payload: "test",
    core: {
      errorCorrectionLevel: badCoreLevel,
      maskPattern: 0,
      moduleShape: "square",
      moduleSizePx: 8,
    },
  });
  assert.strictEqual(badCore.success, false);
  if (!badCore.success) {
    assert.strictEqual(badCore.reason, "unsupported-option");
    assert.strictEqual(badCore.optionName, "core.errorCorrectionLevel");
    assert.strictEqual(badCore.optionValue, "X");
  }

  const badRenderProfile = "mystery" as capability.RenderProfile;
  const badRender = capability.createArtefact({
    payload: "test",
    render: {
      profile: badRenderProfile,
      foregroundColor: "#000000",
      backgroundColor: "#FFFFFF",
      quietZoneModules: 4,
    },
  });
  assert.strictEqual(badRender.success, false);
  if (!badRender.success) {
    assert.strictEqual(badRender.reason, "unsupported-option");
    assert.strictEqual(badRender.optionName, "render.profile");
    assert.strictEqual(badRender.optionValue, "mystery");
  }

  const badAtLWithHCapacity = capability.createArtefact({
    payload: "a".repeat(1274),
    core: {
      errorCorrectionLevel: "H",
      maskPattern: 0,
      moduleShape: "square",
      moduleSizePx: 8,
    },
  });
  assert.strictEqual(badAtLWithHCapacity.success, false);
  if (!badAtLWithHCapacity.success) {
    assert.strictEqual(badAtLWithHCapacity.reason, "capacity-exceeded");
    assert.strictEqual(badAtLWithHCapacity.capacityLimit, 1273);
  }
});

test("qrartefactcreationstatemodel", () => {
  const request: capability.CreationRequest = { payload: "statemodel" };

  const first = capability.createArtefact(request);
  const second = capability.createArtefact(request);
  assert.strictEqual(first.success, true);
  assert.strictEqual(second.success, true);
  if (!first.success || !second.success) {
    return;
  }
  assert.strictEqual(first.artefact.id, second.artefact.id);
  assert.strictEqual(first.artefact.payload, second.artefact.payload);
  assert.deepStrictEqual(first.artefact.bytes, second.artefact.bytes);
  assert.deepStrictEqual(first.usedOptions, second.usedOptions);

  const initial = capability.initialRuntimeState();
  assert.ok(capability.isRequestedState(initial));
  assert.ok(!capability.isProducedState(initial));
  assert.strictEqual(initial.status, "requested");

  const expectedNext = capability.nextStateAfterRequest(initial);
  assert.ok(capability.isProducedState(expectedNext));
  assert.strictEqual(expectedNext.status, "produced");
  assert.strictEqual(expectedNext.requestsProcessed, initial.requestsProcessed + 1);
  assert.strictEqual(expectedNext.artefactsProduced, initial.artefactsProduced + 1);
  assert.strictEqual(expectedNext.nextSequence, initial.nextSequence + 1);

  const transitions: capability.CreationTransition[] = [];
  const produced = capability.produceArtefact(request, initial, (transition) => {
    transitions.push(transition);
  });
  assert.strictEqual(produced.result.success, true);
  assert.strictEqual(transitions.length, 1);
  const recorded = transitions[0];
  assert.ok(recorded !== undefined);
  assert.deepStrictEqual(recorded.previous, initial);
  assert.deepStrictEqual(recorded.next, expectedNext);
  assert.deepStrictEqual(produced.mutation.state, expectedNext);
  assert.strictEqual(produced.mutation.transitions.length, 1);

  const afterFirst = produced.mutation.state;
  const again = capability.produceArtefact(request, afterFirst, (transition) => {
    transitions.push(transition);
  });
  assert.strictEqual(again.result.success, true);
  assert.strictEqual(transitions.length, 2);
  const secondTransition = transitions[1];
  assert.ok(secondTransition !== undefined);
  assert.deepStrictEqual(secondTransition.previous, afterFirst);
  assert.notStrictEqual(secondTransition.next.status, afterFirst.status);

  const rejected = capability.produceArtefact(
    {
      payload: "a".repeat(2954),
      core: {
        errorCorrectionLevel: "L",
        maskPattern: 0,
        moduleShape: "square",
        moduleSizePx: 8,
      },
    },
    initial
  );
  assert.strictEqual(rejected.result.success, false);
  assert.deepStrictEqual(rejected.mutation.state, initial);
  assert.strictEqual(rejected.mutation.transitions.length, 0);

  const throwingAudit = capability.produceArtefact(request, initial, () => {
    throw new Error("nope");
  });
  assert.strictEqual(throwingAudit.result.success, false);
  assert.deepStrictEqual(throwingAudit.mutation.state, initial);
  if (!throwingAudit.result.success) {
    assert.ok(throwingAudit.result.message.includes("nope"));
  }
});

test("qrartefactcreationuisemantics", () => {
  const payload = "preview-compare";

  const basePreview = capability.previewArtefact({ payload });
  assert.strictEqual(basePreview.success, true);
  if (!basePreview.success) {
    return;
  }

  const baseExport = capability.exportArtefact({ payload });
  assert.strictEqual(baseExport.success, true);
  if (!baseExport.success) {
    return;
  }

  assert.ok(capability.previewMatchesExport(basePreview.frame, baseExport));
  assert.deepStrictEqual(basePreview.frame.request.options, baseExport.usedOptions);
  assert.strictEqual(basePreview.frame.artefact.id, baseExport.artefact.id);
  assert.deepStrictEqual(basePreview.frame.artefact.bytes, baseExport.artefact.bytes);
  assert.strictEqual(basePreview.frame.request.options.overlay.shape, "none");

  const logoPreview = capability.previewArtefact({
    payload,
    overlay: {
      shape: "logo",
      caption: "demo",
      centerFraction: 0.15,
    },
  });
  assert.strictEqual(logoPreview.success, true);
  if (!logoPreview.success) {
    return;
  }

  assert.strictEqual(logoPreview.frame.request.options.overlay.shape, "logo");
  assert.strictEqual(logoPreview.frame.request.options.overlay.caption, "demo");
  assert.strictEqual(logoPreview.frame.request.options.overlay.centerFraction, 0.15);
  assert.notStrictEqual(basePreview.frame.artefact.id, logoPreview.frame.artefact.id);

  const matchingExport = capability.exportArtefact({
    payload,
    overlay: {
      shape: "logo",
      caption: "demo",
      centerFraction: 0.15,
    },
  });
  assert.strictEqual(matchingExport.success, true);
  if (!matchingExport.success) {
    return;
  }

  assert.ok(capability.previewMatchesExport(logoPreview.frame, matchingExport));

  const directPreview = capability.buildPreviewArtefact({
    payload,
    overlay: {
      shape: "label",
      caption: "sticky",
      centerFraction: 0.4,
    },
  });
  const directExport = capability.buildExportableArtefact({
    payload,
    overlay: {
      shape: "label",
      caption: "sticky",
      centerFraction: 0.4,
    },
  });
  assert.strictEqual(directPreview.id, directExport.id);
  assert.deepStrictEqual(directPreview.bytes, directExport.bytes);
  assert.strictEqual(directPreview.contentType, directExport.contentType);

  const failingPreview = capability.previewArtefact({
    payload: "a".repeat(2954),
    core: {
      errorCorrectionLevel: "L",
      maskPattern: 0,
      moduleShape: "square",
      moduleSizePx: 8,
    },
  });
  assert.strictEqual(failingPreview.success, false);
  if (!failingPreview.success) {
    assert.strictEqual(failingPreview.failure.reason, "capacity-exceeded");
  }

  const failingExport = capability.exportArtefact({
    payload: "a".repeat(2954),
    core: {
      errorCorrectionLevel: "L",
      maskPattern: 0,
      moduleShape: "square",
      moduleSizePx: 8,
    },
  });
  assert.strictEqual(failingExport.success, false);
  assert.strictEqual(capability.previewMatchesExport(basePreview.frame, failingExport), false);
});

test("qrartefactcreationvalidation", () => {
  const payload = "hello-world";
  const good = capability.createArtefact({ payload });
  assert.strictEqual(good.success, true);
  if (!good.success) {
    return;
  }
  assert.strictEqual(capability.decodeMatchesPayload(good.artefact.bytes, payload), true);
  assert.strictEqual(capability.decodeArtefactBytes(good.artefact.bytes), payload);
  assert.strictEqual(good.artefact.payload, payload);

  const synthetic = capability.buildExportableArtefact({ payload });
  assert.strictEqual(capability.decodeMatchesPayload(synthetic.bytes, payload), true);
  assert.strictEqual(capability.decodeArtefactBytes(synthetic.bytes), payload);

  assert.strictEqual(capability.decodeMatchesPayload(synthetic.bytes, "different"), false);
  assert.strictEqual(capability.decodeMatchesPayload(new Uint8Array(), payload), false);

  // Empty payload is valid and should decode successfully.
  const emptyResult = capability.createArtefact({ payload: "" });
  assert.strictEqual(emptyResult.success, true);
  if (emptyResult.success) {
    assert.strictEqual(capability.decodeMatchesPayload(emptyResult.artefact.bytes, ""), true);
    assert.strictEqual(capability.decodeArtefactBytes(emptyResult.artefact.bytes), "");
  }

  const mutatingAudit = capability.produceArtefact(
    { payload },
    capability.initialRuntimeState(),
    () => {
      throw new Error("decode-stage audit threw");
    },
  );
  assert.strictEqual(mutatingAudit.result.success, false);
  if (!mutatingAudit.result.success) {
    assert.ok(mutatingAudit.result.message.includes("decode-stage audit threw"));
  }
  assert.deepStrictEqual(mutatingAudit.mutation.state, capability.initialRuntimeState());
});