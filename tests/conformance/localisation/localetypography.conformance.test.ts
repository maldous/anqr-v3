import assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/localisation/localetypography.ts";

test("font audit rejects mismatched success and failure before callbacks", () => {
  for (const outcome of [
    capability.createFontLoadSuccess("FontB"),
    capability.createFontLoadError("FontB", "not found"),
  ]) {
    const state = capability.createTypographyState({ en: "FontA" });
    let calls = 0;
    assert.throws(() => capability.loadFontWithAudit("FontA", outcome, state, () => {
      calls += 1;
    }), /Font load outcome must match the requested font/);
    assert.equal(calls, 0);
    assert.deepEqual([...state.loadedFonts], []);
    assert.deepEqual([...state.failedFonts], []);
    assert.equal(state.localeFontMap.en, "FontA");
  }
});

test("font audit processes the checked getter identity", () => {
  let fontReads = 0;
  // Prototype getters are valid outcome properties, not enumerable own fields.
  class Outcome implements capability.FontLoadResult {
    get success(): true { return true; }
    get font(): string { return ++fontReads === 1 ? "FontA" : "FontB"; }
  }
  const state = capability.createTypographyState({ en: "FontA" });
  const audited: string[] = [];
  const next = capability.loadFontWithAudit("FontA", new Outcome(), state, (font, original) => {
    audited.push(font);
    assert.equal(original, state);
    assert.equal(original.loadedFonts.size, 0);
  });
  assert.equal(fontReads, 1);
  assert.deepEqual(audited, ["FontA"]);
  assert.deepEqual([...next.loadedFonts], ["FontA"]);
  assert.equal(next.loadedFonts.has("FontB"), false);
  assert.equal(state.loadedFonts.size, 0);
});

test("matching font outcomes preserve audit order and default refusals", () => {
  for (const outcome of [
    capability.createFontLoadSuccess("FontA"),
    capability.createFontLoadError("FontA", "unavailable", "custom-fallback"),
  ]) {
    const state = capability.createTypographyState({ en: "FontA" });
    let calls = 0;
    const next = capability.loadFontWithAudit("FontA", outcome, state, (font, original) => {
      calls += 1;
      assert.equal(font, "FontA");
      assert.equal(original, state);
      assert.equal(original.loadedFonts.size, 0);
      assert.equal(original.failedFonts.size, 0);
    });
    assert.equal(calls, 1);
    assert.equal(next.loadedFonts.has("FontA"), outcome.success);
    assert.equal(next.failedFonts.has("FontA"), !outcome.success);
    assert.equal(state.loadedFonts.size, 0);
    assert.equal(state.failedFonts.size, 0);
    assert.throws(() => capability.loadFontWithAudit("FontA", outcome, next),
      outcome.success ? /already loaded/ : /already failed loading/);
  }
});

test("matching font failure leaves unused error metadata lazy", () => {
  let fontReads = 0;
  class Outcome implements capability.FontLoadError {
    get success(): false { return false; }
    get font(): string { return ++fontReads === 1 ? "FontA" : "FontB"; }
    get fallback(): string { throw new Error("unused fallback read"); }
    get reason(): string { throw new Error("unused reason read"); }
  }
  const state = capability.createTypographyState({ en: "FontA" });
  let calls = 0;
  const next = capability.loadFontWithAudit("FontA", new Outcome(), state, () => { calls += 1; });
  assert.equal(calls, 1);
  assert.equal(fontReads, 1);
  assert.deepEqual([...next.failedFonts], ["FontA"]);
  assert.equal(next.loadedFonts.size, 0);
  assert.equal(state.failedFonts.size, 0);
});

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
