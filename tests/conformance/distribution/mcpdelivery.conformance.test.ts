import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/distribution/mcpdelivery.ts";

test("mcpdeliverycontracts", () => {
  const config = capability.createDefaultConfig();
  const caps = config.capabilities;

  assert.equal(capability.BASIC_TOOL_NAME, "basic-generation");
  assert.equal(capability.ADVANCED_TOOL_NAME, "advanced-generation");
  assert.equal(typeof capability.GENERATION_PROMPT, "string");
  assert.ok(capability.GENERATION_PROMPT.length > 0);

  const toolNames = caps.tools.map((t) => t.name);
  assert.ok(toolNames.includes(capability.BASIC_TOOL_NAME));
  assert.ok(toolNames.includes(capability.ADVANCED_TOOL_NAME));

  assert.ok(caps.formats.length > 0);
  assert.ok(caps.errorCorrectionLevels.length > 0);
  assert.ok(caps.sizeRange.min <= caps.sizeRange.max);
  assert.ok(caps.marginRange.min <= caps.marginRange.max);
  assert.equal(typeof caps.overlayFetchPolicy, "string");
  assert.ok(caps.overlayFetchPolicy.length > 0);
  assert.ok(caps.safetyGuarantees.length > 0);
});

test("mcpdeliveryerrormodel", () => {
  const config = capability.createDefaultConfig();

  const auditCalls: capability.ToolValidationResult[] = [];
  const outcome = capability.generateBasicQR(
    { data: "hello", format: 42 },
    config,
    (r) => auditCalls.push(r)
  );

  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].success, false);
  assert.equal(auditCalls[0].field, "format");

  assert.equal(outcome.success, false);
  if (outcome.success === false) {
    assert.equal(outcome.field, "format");
    assert.match(outcome.message, /must be a string/);
  }

  const noArtefact = outcome as { artefact?: string };
  assert.equal(noArtefact.artefact, undefined);
});

test("mcpdeliverypermissions", () => {
  const config = capability.createDefaultConfig();

  assert.equal(capability.isAnonymousByDefault(config), true);

  const perimeter = capability.validatePerimeterControls(config);
  assert.equal(perimeter.success, true);
  if (perimeter.success) {
    assert.equal(perimeter.anonymousByDefault, true);
    assert.equal(perimeter.policyAligned, true);
  }

  assert.equal(capability.overlayPolicyIsAdvertisedAsEnforced(config), true);
  assert.equal(config.capabilities.overlayFetchPolicy, "same-origin");

  const denied = capability.checkOverlayPolicy(
    "https://evil.example.com",
    config
  );
  assert.equal(denied.allowed, false);
  assert.match(denied.reason ?? "", /not in allowed origins/);

  const allowed = capability.checkOverlayPolicy("self", config);
  assert.equal(allowed.allowed, true);
});

test("mcpdeliveryreadinessmodel", () => {
  const config = capability.createDefaultConfig();

  const derived = capability.deriveCapabilitiesFromConfig(config);
  assert.equal(derived, config.capabilities);

  const ok = capability.validateCapabilitiesAgainstConfig(
    config.capabilities,
    config
  );
  assert.equal(ok.success, true);
  if (ok.success) {
    assert.equal(ok.aligned, true);
  }

  const ghostTool: capability.Tool = {
    name: "ghost-tool",
    description: "Not present",
    parameters: [{ name: "data", type: "string", required: true }]
  };
  const ghostCaps: capability.CapabilitiesResource = {
    ...config.capabilities,
    tools: [...config.capabilities.tools, ghostTool]
  };
  const advertFail = capability.validateCapabilitiesAgainstConfig(
    ghostCaps,
    config
  );
  assert.equal(advertFail.success, false);
  if (!advertFail.success) {
    assert.equal(advertFail.aligned, false);
    assert.equal(advertFail.field, "tools");
  }

  const missingFormat: capability.CapabilitiesResource = {
    ...config.capabilities,
    formats: [...config.capabilities.formats, "GIF"]
  };
  const formatFail = capability.validateCapabilitiesAgainstConfig(
    missingFormat,
    config
  );
  assert.equal(formatFail.success, false);
  if (!formatFail.success) {
    assert.equal(formatFail.field, "formats");
  }

  const outcome = capability.generateBasicQR(
    { data: "x", format: "GIF" },
    config,
    () => {}
  );
  assert.equal(outcome.success, false);
  if (outcome.success === false) {
    assert.equal(outcome.field, "format");
  }
});

test("mcpdeliveryvalidation", () => {
  const config = capability.createDefaultConfig();
  const basicTool = config.capabilities.tools.find(
    (t) => t.name === capability.BASIC_TOOL_NAME
  )!;
  const advancedTool = config.capabilities.tools.find(
    (t) => t.name === capability.ADVANCED_TOOL_NAME
  )!;

  const auditCalls: capability.ToolValidationResult[] = [];

  const goodBasic: capability.GenerationInput = {
    data: "payload",
    format: "PNG",
    size: 512,
    margin: 4,
    errorCorrectionLevel: "M"
  };
  const basicOk = capability.generateBasicQR(
    goodBasic,
    config,
    (r) => auditCalls.push(r)
  );
  assert.equal(basicOk.success, true);
  if (basicOk.success) {
    assert.match(basicOk.artefact, /^QR-/);
  }

  const sizeTooLarge: capability.GenerationInput = {
    data: "payload",
    format: "PNG",
    size: 99999
  };
  const basicFail = capability.generateBasicQR(
    sizeTooLarge,
    config,
    (r) => auditCalls.push(r)
  );
  assert.equal(basicFail.success, false);
  if (basicFail.success === false) {
    assert.equal(basicFail.field, "size");
  }

  const goodAdvanced: capability.AdvancedGenerationInput = {
    data: "payload",
    format: "PNG",
    overlay: { url: "self" }
  };
  const advOk = capability.generateAdvancedQR(
    goodAdvanced,
    config,
    (r) => auditCalls.push(r)
  );
  assert.equal(advOk.success, true);
  if (advOk.success) {
    assert.match(advOk.artefact, /^ADVANCED-QR-/);
  }

  const badAdvanced: capability.AdvancedGenerationInput = {
    data: "payload",
    format: "PNG",
    overlay: { url: "https://evil.example.com" }
  };
  const advFail = capability.generateAdvancedQR(
    badAdvanced,
    config,
    (r) => auditCalls.push(r)
  );
  assert.equal(advFail.success, false);
  if (advFail.success === false) {
    assert.equal(advFail.field, "overlay.url");
  }

  for (const tool of [basicTool, advancedTool]) {
    const result = capability.validateToolInput(
      { data: "x", format: "PNG" },
      tool
    );
    assert.equal(result.success, true);
  }

  const badInput = capability.validateToolInput(
    { data: "x", format: 42 },
    basicTool
  );
  assert.equal(badInput.success, false);
  assert.equal(badInput.field, "format");

  const caps = config.capabilities;

  if (caps.sizeRange.min !== caps.sizeRange.max) {
    assert.notEqual(
      capability.validateCapabilitiesAgainstConfig(
        {
          ...caps,
          sizeRange: {
            min: caps.sizeRange.min,
            max: caps.sizeRange.max + 1
          }
        },
        config
      ).success,
      true
    );
  }

  assert.notEqual(
    capability.validateCapabilitiesAgainstConfig(
      {
        ...caps,
        overlayFetchPolicy: "any-origin"
      },
      config
    ).success,
    true
  );

  const finalCheck = capability.validateCapabilitiesAgainstConfig(caps, config);
  assert.equal(finalCheck.success, true);
  if (finalCheck.success) {
    assert.equal(finalCheck.aligned, true);
  }
});