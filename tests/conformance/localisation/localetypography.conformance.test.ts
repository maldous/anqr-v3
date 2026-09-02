import assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/localisation/localetypography.ts";

test("localetypographycontracts", () => {
  const state = capability.createTypographyState({
    en: "Inter",
    // fr is not declared
  });

  // resolveLocaleFont returns the declared font resource
  assert.strictEqual(capability.resolveLocaleFont("en", state), "Inter");
  assert.strictEqual(capability.resolveLocaleFont("fr", state), null);

  // shouldRequestFont reflects the declaration
  assert.strictEqual(capability.shouldRequestFont("en", state), true);
  assert.strictEqual(capability.shouldRequestFont("fr", state), false);

  // Loading is driven from the map – process a successful outcome
  const successOutcome = capability.createFontLoadSuccess("Inter");
  const newState = capability.processFontLoadOutcome(successOutcome, state);
  assert.deepStrictEqual(newState.loadedFonts, new Set(["Inter"]));
  assert.strictEqual(newState.failedFonts.size, 0);
});

test("localetypographyerrormodel", () => {
  const state = capability.createTypographyState({
    de: "NotoSans",
  });

  // Create a failure outcome
  const errorOutcome = capability.createFontLoadError("NotoSans", "network failure");
  assert.strictEqual(errorOutcome.success, false);
  assert.strictEqual(errorOutcome.font, "NotoSans");
  assert.strictEqual(errorOutcome.fallback, capability.FALLBACK_FONT);
  assert.strictEqual(errorOutcome.reason, "network failure");

  // Process the failure – font added to failedFonts
  const newState = capability.processFontLoadOutcome(errorOutcome, state);
  assert.strictEqual(newState.failedFonts.size, 1);
  assert.ok(newState.failedFonts.has("NotoSans"));

  // Effective font is the fallback system font
  const effectiveFont = capability.getEffectiveFont("de", newState);
  assert.strictEqual(effectiveFont, capability.FALLBACK_FONT);

  // Render reflects fallback
  const render = capability.createTypographyRender("Hallo", "de", newState);
  assert.strictEqual(render.isFallback, true);
  assert.strictEqual(render.font, capability.FALLBACK_FONT);
});

test("localetypographyreadinessmodel", () => {
  const state = capability.createTypographyState({
    es: "OpenSans",
  });

  // Before load, effective font is the system default and render is a fallback
  const effectiveInitial = capability.getEffectiveFont("es", state);
  assert.strictEqual(effectiveInitial, capability.DEFAULT_SYSTEM_FONT);
  const renderInitial = capability.createTypographyRender("Hola", "es", state);
  assert.strictEqual(renderInitial.isFallback, true);
  assert.strictEqual(renderInitial.font, capability.DEFAULT_SYSTEM_FONT);

  // Simulate successful load
  const successOutcome = capability.createFontLoadSuccess("OpenSans");
  const loadedState = capability.processFontLoadOutcome(successOutcome, state);

  // After load, effective font is the declared resource and no fallback
  const effectiveLoaded = capability.getEffectiveFont("es", loadedState);
  assert.strictEqual(effectiveLoaded, "OpenSans");
  const renderLoaded = capability.createTypographyRender("Hola", "es", loadedState);
  assert.strictEqual(renderLoaded.isFallback, false);
  assert.strictEqual(renderLoaded.font, "OpenSans");
});

test("localetypographyvalidation", () => {
  // Locale with declared font, not yet loaded/failed
  const state1 = capability.createTypographyState({ it: "Lora" });
  assert.strictEqual(capability.validateLocaleResolution("it", state1), true);

  // Same locale after font is loaded
  const state2 = capability.createTypographyState({ fr: "Roboto" });
  const loadedState = capability.processFontLoadOutcome(
    capability.createFontLoadSuccess("Roboto"),
    state2,
  );
  assert.strictEqual(capability.validateLocaleResolution("fr", loadedState), false);

  // Same locale after font has failed
  const state3 = capability.createTypographyState({ ja: "Arial" });
  const failedState = capability.processFontLoadOutcome(
    capability.createFontLoadError("Arial", "not found"),
    state3,
  );
  assert.strictEqual(capability.validateLocaleResolution("ja", failedState), false);

  // Locale without a declared font
  assert.strictEqual(capability.validateLocaleResolution("xx", state1), true);
});