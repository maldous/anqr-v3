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

test("MCP finite measurement guard rejects nonfinite declared numeric values", () => {
  const config = capability.createDefaultConfig();
  for (const tool of config.capabilities.tools) {
    for (const field of ['size', 'margin'] as const) {
      for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        const result = capability.validateToolInput({ data: 'payload', format: 'PNG', [field]: value }, tool);
        assert.equal(result.success, false);
        assert.equal(result.field, field);
      }
    }
  }
});

test("MCP finite measurement guard rejects default generation before placeholder success", () => {
  const config = capability.createDefaultConfig();
  for (const generate of [capability.generateBasicQR, capability.generateAdvancedQR]) {
    for (const field of ['size', 'margin'] as const) {
      const audit: capability.ToolValidationResult[] = [];
      const result = generate({ data: 'payload', format: 'PNG', [field]: Number.NaN }, config, value => audit.push(value));
      assert.equal(result.success, false);
      if (!result.success) assert.equal(result.field, field);
      assert.equal((result as { artefact?: string }).artefact, undefined);
      assert.equal(audit.length, 1);
      assert.equal(audit[0].success, false);
      assert.equal(audit[0].field, field);
    }
  }
});

test("MCP finite measurement guard also applies when numeric declarations are omitted", () => {
  const original = capability.createDefaultConfig();
  const config: capability.Config = {
    ...original,
    capabilities: {
      ...original.capabilities,
      tools: original.capabilities.tools.map(tool => ({
        ...tool, parameters: tool.parameters.filter(param => param.name !== 'size' && param.name !== 'margin'),
      })),
    },
  };
  for (const generate of [capability.generateBasicQR, capability.generateAdvancedQR]) {
    for (const field of ['size', 'margin'] as const) {
      const audit: capability.ToolValidationResult[] = [];
      const result = generate({ data: 'payload', format: 'PNG', [field]: Number.NaN }, config, value => audit.push(value));
      assert.equal(result.success, false);
      if (!result.success) assert.equal(result.field, field);
      assert.equal((result as { artefact?: string }).artefact, undefined);
      // Existing callbacks report declared-tool validation, not every generation check.
      assert.equal(audit.length, generate === capability.generateBasicQR ? 1 : 2);
      assert.equal(audit.every(value => value.success), true);
    }
  }
});

test("MCP finite measurement guard covers an unbounded declared numeric parameter", () => {
  const tool = capability.createTool('count-tool', 'Synthetic numeric validation only', [
    { name: 'count', type: 'number', required: true },
  ]);
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const result = capability.validateToolInput({ count: value }, tool);
    assert.equal(result.success, false);
    assert.equal(result.field, 'count');
  }
  assert.deepEqual(capability.validateToolInput({ count: 0.5 }, tool), { success: true });
});

test("MCP finite measurement guard preserves finite fractions and omitted optionals", () => {
  const config = capability.createDefaultConfig();
  for (const generate of [capability.generateBasicQR, capability.generateAdvancedQR]) {
    for (const input of [
      { data: 'payload', format: 'PNG', size: 256.5, margin: 0.5 },
      { data: 'payload', format: 'PNG' },
    ]) {
      const audit: capability.ToolValidationResult[] = [];
      const result = generate(input, config, value => audit.push(value));
      assert.equal(result.success, true);
      assert.equal(audit.length, generate === capability.generateBasicQR ? 1 : 2);
      assert.equal(audit.every(value => value.success), true);
    }
  }
});

test("MCP finite measurement guard preserves earlier type and range refusal details", () => {
  const config = capability.createDefaultConfig();
  const tool = config.capabilities.tools.find(value => value.name === capability.BASIC_TOOL_NAME)!;
  const cases: [unknown, string, string][] = [
    [{ data: 'x', format: 'PNG', size: '512' }, 'size', "Field 'size' must be a number."],
    [{ data: 'x', format: 'PNG', size: Number.POSITIVE_INFINITY }, 'size', "Field 'size' must be at most 4096."],
    [{ data: 'x', format: 'PNG', margin: Number.NEGATIVE_INFINITY }, 'margin', "Field 'margin' must be at least 0."],
    [{ data: 'x', format: 42, size: Number.NaN }, 'format', "Field 'format' must be a string."],
  ];
  for (const [input, field, message] of cases) {
    assert.deepEqual(capability.validateToolInput(input, tool), { success: false, field, message });
  }
});
