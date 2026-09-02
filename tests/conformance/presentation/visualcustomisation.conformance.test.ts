import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/presentation/visualcustomisation.ts";

test("visualcustomisationcontracts", () => {
  const moduleOk = capability.validateModuleStyle("square");
  const moduleBad = capability.validateModuleStyle("triangle");
  const finderOk = capability.validateFinderStyle("circle");
  const finderBad = capability.validateFinderStyle("hexagon");
  const gradientOk = capability.validateGradientKind("conic");
  const gradientBad = capability.validateGradientKind("spiral");
  assert.equal(moduleOk, true);
  assert.equal(moduleBad, false);
  assert.equal(finderOk, true);
  assert.equal(finderBad, false);
  assert.equal(gradientOk, true);
  assert.equal(gradientBad, false);

  const colourRgb = capability.validateColor("rgb(10,20,30)");
  const colourRgba = capability.validateColor("rgba(10,20,30,0.5)");
  const colourHsl = capability.validateColor("hsl(120,50,50)");
  const colourHsla = capability.validateColor("hsla(120,50,50,0.5)");
  assert.equal(colourRgb.success, true);
  assert.equal(colourRgba.success, true);
  assert.equal(colourHsl.success, true);
  assert.equal(colourHsla.success, true);
  if (colourRgb.success && colourRgba.success && colourHsl.success && colourHsla.success) {
    assert.equal(colourRgb.value, "rgb");
    assert.equal(colourRgba.value, "rgba");
    assert.equal(colourHsl.value, "hsl");
    assert.equal(colourHsla.value, "hsla");
  }

  const gradientOkFull: capability.ValidationResult<capability.Gradient> = capability.validateGradient({
    kind: "linear",
    stops: [
      { position: 0, color: "rgb(0,0,0)" },
      { position: 1, color: "rgb(255,255,255)" },
    ],
    angle: 90,
  });
  assert.equal(gradientOkFull.success, true);

  const badKind: capability.GradientKind = "spiral" as capability.GradientKind;
  const gradientBadKind: capability.ValidationResult<capability.Gradient> = capability.validateGradient({
    kind: badKind,
    stops: [],
  });
  assert.equal(gradientBadKind.success, false);
  if (!gradientBadKind.success) {
    assert.equal(gradientBadKind.error.cause, "invalid_gradient_kind");
  }
});

test("visualcustomisationerrormodel", () => {
  const lowContrast: capability.VisualStyle = {
    moduleStyle: "square",
    finderStyle: "square",
    foreground: "rgb(120,120,120)",
    background: "rgb(130,130,130)",
    gradient: { kind: "none", stops: [] },
  };

  const ratio = capability.contrastRatio(lowContrast.foreground, lowContrast.background);
  assert.ok(ratio < capability.CONTRAST_DECODE_THRESHOLD);

  const refused: capability.ValidationResult<capability.VisualStyle> = capability.isStyleAllowed(lowContrast, "strict");
  assert.equal(refused.success, false);
  if (!refused.success) {
    assert.equal(refused.error.cause, "contrast");
  }

  const accepted: capability.ValidationResult<capability.VisualStyle> = capability.isStyleAllowed(lowContrast, "standard");
  assert.equal(accepted.success, true);

  const highContrast: capability.VisualStyle = {
    moduleStyle: "square",
    finderStyle: "square",
    foreground: "rgb(0,0,0)",
    background: "rgb(255,255,255)",
    gradient: { kind: "none", stops: [] },
  };
  const acceptedStrict: capability.ValidationResult<capability.VisualStyle> = capability.isStyleAllowed(highContrast, "strict");
  assert.equal(acceptedStrict.success, true);
});

test("visualcustomisationstatemodel", () => {
  const payload = { bytes: 42 } as const;
  const original: capability.StyledArtefact<typeof payload> = {
    payload,
    outputFormat: "png",
    style: capability.defaultStyle(),
  };

  const nextStyle: capability.VisualStyle = {
    moduleStyle: "rounded",
    finderStyle: "circle",
    foreground: "rgba(10,20,30,1)",
    background: "rgb(255,255,255)",
    gradient: {
      kind: "radial",
      stops: [
        { position: 0, color: "rgb(0,0,0)" },
        { position: 1, color: "rgb(255,255,255)" },
      ],
    },
  };

  const updated: capability.StyledArtefact<typeof payload> = capability.applyStyle(original, nextStyle);
  assert.equal(updated.payload, original.payload);
  assert.equal(updated.outputFormat, original.outputFormat);
  assert.equal(capability.payloadUnchanged(original, updated), true);

  const audited: capability.ValidationResult<capability.StyledArtefact<typeof payload>> = capability.applyStyleWithMode(original, nextStyle, "standard");
  assert.equal(audited.success, true);
  if (audited.success) {
    assert.equal(audited.value.payload, original.payload);
    assert.equal(audited.value.outputFormat, original.outputFormat);
    assert.equal(audited.value.style.moduleStyle, "rounded");
  }
});

test("visualcustomisationuisemantics", () => {
  const lowContrast: capability.VisualStyle = {
    moduleStyle: "square",
    finderStyle: "square",
    foreground: "rgb(120,120,120)",
    background: "rgb(130,130,130)",
    gradient: { kind: "none", stops: [] },
  };

  const previewStrict = capability.previewAvailability(lowContrast, "strict");
  assert.equal(previewStrict.available, false);
  assert.equal(previewStrict.reason, "contrast");

  const previewStandard = capability.previewAvailability(lowContrast, "standard");
  assert.equal(previewStandard.available, true);
  assert.equal(previewStandard.reason, undefined);

  const highContrast: capability.VisualStyle = {
    moduleStyle: "square",
    finderStyle: "square",
    foreground: "rgb(0,0,0)",
    background: "rgb(255,255,255)",
    gradient: { kind: "none", stops: [] },
  };
  const previewHigh = capability.previewAvailability(highContrast, "strict");
  assert.equal(previewHigh.available, true);
});

test("visualcustomisationvalidation", () => {
  const payload = { bytes: 7 } as const;
  const artefact: capability.StyledArtefact<typeof payload> = {
    payload,
    outputFormat: "png",
    style: capability.defaultStyle(),
  };

  const styleA: capability.VisualStyle = {
    moduleStyle: "square",
    finderStyle: "square",
    foreground: "rgb(0,0,0)",
    background: "rgb(255,255,255)",
    gradient: { kind: "none", stops: [] },
  };
  const roundTripA: capability.ValidationResult<typeof payload> = capability.decodeRoundTrip(artefact, styleA);
  assert.equal(roundTripA.success, true);
  if (roundTripA.success) {
    assert.equal(roundTripA.value, payload);
  }

  const styleB: capability.VisualStyle = {
    moduleStyle: "diamond",
    finderStyle: "circle",
    foreground: "hsl(0,100,50)",
    background: "hsla(0,0,100,1)",
    gradient: {
      kind: "linear",
      stops: [
        { position: 0, color: "rgb(0,0,0)" },
        { position: 1, color: "rgb(255,255,255)" },
      ],
      angle: 45,
    },
  };
  const roundTripB: capability.ValidationResult<typeof payload> = capability.decodeRoundTrip(artefact, styleB);
  assert.equal(roundTripB.success, true);
  if (roundTripB.success) {
    assert.equal(roundTripB.value, payload);
  }

  assert.equal(capability.decodeStyled(artefact), payload);
});