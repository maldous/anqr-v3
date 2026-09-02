import assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/creation/qrartefactcreation.ts";

test("qrartefactcreationcontracts", () => {
  const payload = "contracts-check";

  const defaultResult = capability.createArtefact({ payload });
  assert.strictEqual(defaultResult.success, true);
  if (!defaultResult.success) {
    return;
  }
  assert.strictEqual(defaultResult.artefact.payload, payload);
  assert.deepStrictEqual(defaultResult.usedOptions, capability.DEFAULT_USED_OPTIONS);
  assert.deepStrictEqual(defaultResult.artefact.options, defaultResult.usedOptions);

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
  assert.deepStrictEqual(
    coreOnly.usedOptions.qualityAssurance,
    capability.DEFAULT_QUALITY_ASSURANCE_OPTIONS
  );

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
      profile: "guarded",
      blockedPayloads: ["forbidden"],
    },
  });
  assert.strictEqual(safetyOnly.success, true);
  if (!safetyOnly.success) {
    return;
  }
  assert.strictEqual(safetyOnly.usedOptions.safety.profile, "guarded");
  assert.deepStrictEqual(
    [...safetyOnly.usedOptions.safety.blockedPayloads],
    ["forbidden"]
  );
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
  assert.deepStrictEqual(
    [...metadataOnly.usedOptions.metadata.tags],
    ["a", "b"]
  );
  assert.deepStrictEqual(
    metadataOnly.usedOptions.qualityAssurance,
    capability.DEFAULT_QUALITY_ASSURANCE_OPTIONS
  );

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
  assert.deepStrictEqual(resolved, capability.DEFAULT_USED_OPTIONS);

  const resolvedCore = capability.resolveOptions({
    payload,
    core: {
      errorCorrectionLevel: "Q",
      maskPattern: 5,
      moduleShape: "circle",
      moduleSizePx: 12,
    },
  });
  assert.strictEqual(resolvedCore.core.errorCorrectionLevel, "Q");
  assert.deepStrictEqual(resolvedCore.render, capability.DEFAULT_RENDER_OPTIONS);
  assert.deepStrictEqual(resolvedCore.output, capability.DEFAULT_OUTPUT_OPTIONS);
  assert.deepStrictEqual(resolvedCore.overlay, capability.DEFAULT_OVERLAY_OPTIONS);
  assert.deepStrictEqual(resolvedCore.animation, capability.DEFAULT_ANIMATION_OPTIONS);
  assert.deepStrictEqual(resolvedCore.safety, capability.DEFAULT_SAFETY_OPTIONS);
  assert.deepStrictEqual(resolvedCore.metadata, capability.DEFAULT_METADATA_OPTIONS);
  assert.deepStrictEqual(
    resolvedCore.qualityAssurance,
    capability.DEFAULT_QUALITY_ASSURANCE_OPTIONS
  );
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
  if (tooLarge.success) {
    return;
  }
  assert.strictEqual(tooLarge.reason, "capacity-exceeded");
  assert.strictEqual(tooLarge.capacityLimit, 2953);
  assert.ok(tooLarge.message.includes("2954"));
  assert.ok(tooLarge.message.includes("2953"));

  const overAtH = capability.createArtefact({
    payload: "a".repeat(1274),
    core: {
      errorCorrectionLevel: "H",
      maskPattern: 0,
      moduleShape: "square",
      moduleSizePx: 8,
    },
  });
  assert.strictEqual(overAtH.success, false);
  if (overAtH.success) {
    return;
  }
  assert.strictEqual(overAtH.reason, "capacity-exceeded");
  assert.strictEqual(overAtH.capacityLimit, 1273);

  const atH = capability.createArtefact({
    payload: "a".repeat(1273),
    core: {
      errorCorrectionLevel: "H",
      maskPattern: 0,
      moduleShape: "square",
      moduleSizePx: 8,
    },
  });
  assert.strictEqual(atH.success, true);

  const badCore = capability.createArtefact({
    payload: "test",
    core: {
      errorCorrectionLevel: "X" as capability.ErrorCorrectionLevel,
      maskPattern: 0,
      moduleShape: "square",
      moduleSizePx: 8,
    },
  });
  assert.strictEqual(badCore.success, false);
  if (badCore.success) {
    return;
  }
  assert.strictEqual(badCore.reason, "unsupported-option");
  assert.strictEqual(badCore.optionName, "core.errorCorrectionLevel");
  assert.strictEqual(badCore.optionValue, "X");
  assert.ok(!/to a default/i.test(badCore.message));

  const badRender = capability.createArtefact({
    payload: "test",
    render: {
      profile: "mystery" as capability.RenderProfile,
      foregroundColor: "#000000",
      backgroundColor: "#FFFFFF",
      quietZoneModules: 4,
    },
  });
  assert.strictEqual(badRender.success, false);
  if (badRender.success) {
    return;
  }
  assert.strictEqual(badRender.reason, "unsupported-option");
  assert.strictEqual(badRender.optionName, "render.profile");
  assert.strictEqual(badRender.optionValue, "mystery");

  const badOverlayShape = capability.createArtefact({
    payload: "test",
    overlay: {
      shape: "wedge" as capability.OverlayShape,
      caption: "",
      centerFraction: 0,
    },
  });
  assert.strictEqual(badOverlayShape.success, false);
  if (badOverlayShape.success) {
    return;
  }
  assert.strictEqual(badOverlayShape.reason, "unsupported-option");
  assert.strictEqual(badOverlayShape.optionName, "overlay.shape");
  assert.strictEqual(badOverlayShape.optionValue, "wedge");
});

test("qrartefactcreationstatemodel", () => {
  const initial = capability.initialRuntimeState();
  assert.strictEqual(initial.status, "requested");
  assert.ok(capability.isRequestedState(initial));
  assert.ok(!capability.isProducedState(initial));
  assert.strictEqual(initial.requestsProcessed, 0);
  assert.strictEqual(initial.artefactsProduced, 0);
  assert.strictEqual(initial.nextSequence, 1);

  const after = capability.nextStateAfterRequest(initial);
  assert.strictEqual(after.status, "produced");
  assert.ok(capability.isProducedState(after));
  assert.ok(!capability.isRequestedState(after));
  assert.strictEqual(after.requestsProcessed, initial.requestsProcessed + 1);
  assert.strictEqual(after.artefactsProduced, initial.artefactsProduced + 1);
  assert.strictEqual(after.nextSequence, initial.nextSequence + 1);

  const request: capability.CreationRequest = { payload: "statemodel" };

  const first = capability.produceArtefact({ request, before: initial });
  assert.strictEqual(first.result.success, true);
  assert.strictEqual(first.mutation.transitions.length, 1);
  if (first.mutation.transitions.length === 1) {
    assert.strictEqual(first.mutation.transitions[0]!.previous.status, "requested");
    assert.strictEqual(first.mutation.transitions[0]!.next.status, "produced");
  }
  assert.strictEqual(first.mutation.state.status, "produced");

  const second = capability.produceArtefact({ request, before: initial });
  assert.strictEqual(second.result.success, true);
  assert.strictEqual(second.mutation.state.status, "produced");
  assert.strictEqual(second.mutation.transitions.length, 1);
  if (second.mutation.transitions.length === 1) {
    assert.strictEqual(second.mutation.transitions[0]!.previous.status, "requested");
    assert.strictEqual(second.mutation.transitions[0]!.next.status, "produced");
  }

  if (first.result.success && second.result.success) {
    assert.strictEqual(first.result.artefact.id, second.result.artefact.id);
    assert.strictEqual(first.result.artefact.payload, second.result.artefact.payload);
    assert.deepStrictEqual(first.result.artefact.bytes, second.result.artefact.bytes);
    assert.deepStrictEqual(first.result.usedOptions, second.result.usedOptions);
  }

  const rejectedRequest: capability.CreationRequest = {
    payload: "a".repeat(2954),
    core: {
      errorCorrectionLevel: "L",
      maskPattern: 0,
      moduleShape: "square",
      moduleSizePx: 8,
    },
  };
  const rejected = capability.produceArtefact({
    request: rejectedRequest,
    before: initial,
  });
  assert.strictEqual(rejected.result.success, false);
  assert.strictEqual(rejected.mutation.state.status, "requested");
  assert.strictEqual(rejected.mutation.transitions.length, 0);

  const throwing = capability.produceArtefact({
    request,
    before: initial,
    audit: () => {
      throw new Error("nope");
    },
  });
  assert.strictEqual(throwing.result.success, false);
  assert.strictEqual(throwing.mutation.state.status, "requested");
  assert.strictEqual(throwing.mutation.transitions.length, 0);
  if (throwing.result.success) {
    return;
  }
  assert.ok(throwing.result.message.includes("nope"));

  const createA = capability.createArtefact(request);
  const createB = capability.createArtefact(request);
  assert.strictEqual(createA.success, true);
  assert.strictEqual(createB.success, true);
  if (!createA.success || !createB.success) {
    return;
  }
  assert.strictEqual(createA.artefact.id, createB.artefact.id);
  assert.strictEqual(createA.artefact.payload, createB.artefact.payload);
  assert.deepStrictEqual(createA.artefact.bytes, createB.artefact.bytes);
  assert.deepStrictEqual(createA.usedOptions, createB.usedOptions);
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
  assert.strictEqual(capability.previewMatchesExport(basePreview.frame, baseExport), true);
  assert.strictEqual(basePreview.frame.artefact.id, baseExport.artefact.id);
  assert.deepStrictEqual(
    basePreview.frame.artefact.bytes,
    baseExport.artefact.bytes
  );
  assert.strictEqual(basePreview.frame.request.payload, baseExport.artefact.payload);
  assert.deepStrictEqual(basePreview.frame.request.options, baseExport.usedOptions);
  assert.strictEqual(basePreview.frame.request.options.overlay.shape, "none");

  const overlayRequest: capability.CreationRequest = {
    payload,
    overlay: {
      shape: "logo",
      caption: "demo",
      centerFraction: 0.15,
    },
  };

  const logoPreview = capability.previewArtefact(overlayRequest);
  assert.strictEqual(logoPreview.success, true);
  if (!logoPreview.success) {
    return;
  }
  assert.strictEqual(logoPreview.frame.request.options.overlay.shape, "logo");
  assert.strictEqual(logoPreview.frame.request.options.overlay.caption, "demo");
  assert.strictEqual(
    logoPreview.frame.request.options.overlay.centerFraction,
    0.15
  );
  assert.notStrictEqual(basePreview.frame.artefact.id, logoPreview.frame.artefact.id);

  const logoExport = capability.exportArtefact(overlayRequest);
  assert.strictEqual(logoExport.success, true);
  if (!logoExport.success) {
    return;
  }
  assert.strictEqual(capability.previewMatchesExport(logoPreview.frame, logoExport), true);

  const labelRequest: capability.CreationRequest = {
    payload,
    overlay: {
      shape: "label",
      caption: "sticky",
      centerFraction: 0.4,
    },
  };
  const directPreview = capability.buildPreviewArtefact(labelRequest);
  const directExport = capability.buildExportableArtefact(labelRequest);
  assert.strictEqual(directPreview.id, directExport.id);
  assert.deepStrictEqual(directPreview.bytes, directExport.bytes);
  assert.strictEqual(directPreview.contentType, directExport.contentType);

  const capacityRequest: capability.CreationRequest = {
    payload: "a".repeat(2954),
    core: {
      errorCorrectionLevel: "L",
      maskPattern: 0,
      moduleShape: "square",
      moduleSizePx: 8,
    },
  };
  const failingPreview = capability.previewArtefact(capacityRequest);
  assert.strictEqual(failingPreview.success, false);
  if (failingPreview.success) {
    return;
  }
  assert.strictEqual(failingPreview.failure.reason, "capacity-exceeded");
  const failingExport = capability.exportArtefact(capacityRequest);
  assert.strictEqual(failingExport.success, false);
  assert.strictEqual(
    capability.previewMatchesExport(basePreview.frame, failingExport),
    false
  );
});

test("qrartefactcreationvalidation", () => {
  const payload = "hello-world";

  const good = capability.createArtefact({ payload });
  assert.strictEqual(good.success, true);
  if (!good.success) {
    return;
  }
  assert.strictEqual(good.artefact.payload, payload);
  assert.strictEqual(
    capability.decodeArtefactBytes(good.artefact.bytes),
    payload
  );
  assert.strictEqual(
    capability.decodeMatchesPayload(good.artefact.bytes, payload),
    true
  );
  assert.strictEqual(
    capability.decodeMatchesPayload(good.artefact.bytes, "different"),
    false
  );

  const empty = capability.createArtefact({ payload: "" });
  assert.strictEqual(empty.success, true);
  if (!empty.success) {
    return;
  }
  assert.strictEqual(empty.artefact.payload, "");
  assert.strictEqual(capability.decodeArtefactBytes(empty.artefact.bytes), "");
  assert.strictEqual(capability.decodeMatchesPayload(empty.artefact.bytes, ""), true);

  const synthetic = capability.buildExportableArtefact({ payload });
  assert.strictEqual(capability.decodeArtefactBytes(synthetic.bytes), payload);
  assert.strictEqual(capability.decodeMatchesPayload(synthetic.bytes, payload), true);
  assert.strictEqual(
    capability.decodeMatchesPayload(new Uint8Array(), payload),
    false
  );

  const decodedFromPreview = capability.decodeArtefactBytes(
    capability.buildPreviewArtefact({ payload }).bytes
  );
  assert.strictEqual(decodedFromPreview, payload);

  const fakeBytes = new TextEncoder().encode("not-a-valid-framed-byte-stream");
  const tampered = new Uint8Array(fakeBytes.length + 4);
  tampered.set(fakeBytes, 0);
  tampered[tampered.length - 4] = 0xfe;
  tampered[tampered.length - 3] = 0xed;
  tampered[tampered.length - 2] = 0xfa;
  tampered[tampered.length - 1] = 0xce;
  assert.strictEqual(capability.decodeMatchesPayload(tampered, "x"), false);

  const previewFrame = capability.previewArtefact({ payload });
  assert.strictEqual(previewFrame.success, true);
  if (!previewFrame.success) {
    return;
  }
  const exportResult = capability.exportArtefact({ payload });
  assert.strictEqual(exportResult.success, true);
  if (!exportResult.success) {
    return;
  }
  assert.strictEqual(
    capability.previewMatchesExport(previewFrame.frame, exportResult),
    true
  );
});