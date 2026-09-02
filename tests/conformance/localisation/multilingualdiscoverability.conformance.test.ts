import assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/localisation/multilingualdiscoverability.ts";

test("multilingualdiscoverabilitycontracts", () => {
  const state = capability.createLocalisationState(
    ["en", "fr", "de"] as readonly Locale[],
    "en"
  );
  const content: readonly capabilityPageContent[] = [
    capability.createPageContent("article", "en", "/en/article"),
    capability.createPageContent("article", "fr", "/fr/article"),
    capability.createPageContent("article", "de", "/de/article"),
  ];
  const result = capability.publishAlternates(state, content);
  assert.equal(result.success, true);
  if (!result.success) {
    throw new Error("expected success branch");
  }
  assert.equal(result.alternates.pageType, "article");
  assert.equal(result.alternates.canonical, "/en/article");
  assert.deepEqual(
    [...result.alternates.alternates].sort(),
    ["/de/article", "/fr/article"]
  );
  assert.equal(result.alternates.defaultAlternate, "/en/article");
  assert.equal(
    capability.validateAlternates(result.alternates),
    "valid" as capabilityValidationState
  );
});

test("multilingualdiscoverabilityerrormodel", () => {
  const state = capability.createLocalisationState(
    ["en", "fr", "de"] as readonly Locale[],
    "en"
  );
  const content: readonly capabilityPageContent[] = [
    capability.createPageContent("article", "en", "/en/article"),
    capability.createPageContent("article", "fr", "/fr/article"),
  ];
  const result = capability.publishAlternates(state, content);
  assert.equal(result.success, true);
  if (!result.success) {
    throw new Error("expected success branch");
  }
  const publishedLocales = new Set(
    result.alternates.alternates.map((ref: string) => ref.split("/")[1])
  );
  assert.equal(publishedLocales.has("de"), false);
  assert.equal(publishedLocales.size, 1);
  const invertedState = capability.createLocalisationState(
    ["en", "de"] as readonly Locale[],
    "en"
  );
  const invertedResult = capability.publishAlternates(invertedState, content);
  assert.equal(invertedResult.success, false);
  if (invertedResult.success) {
    throw new Error("expected failure branch");
  }
  assert.equal(
    invertedResult.error.code,
    "UNDECLARED_LOCALE" as capabilityMultilingualErrorCode
  );
});

test("multilingualdiscoverabilitystatemodel", () => {
  const baseState = capability.createLocalisationState(
    ["en", "fr"] as readonly Locale[],
    "en"
  );
  const beforeContent: readonly capabilityPageContent[] = [
    capability.createPageContent("article", "en", "/en/article"),
    capability.createPageContent("article", "fr", "/fr/article"),
  ];
  const before = capability.publishAlternates(baseState, beforeContent);
  assert.equal(before.success, true);
  if (!before.success) {
    throw new Error("expected success branch");
  }
  assert.deepEqual(
    [...before.alternates.alternates],
    ["/fr/article"]
  );

  const extendedState = capability.addLocale(baseState, "de");
  const allContent: readonly capabilityPageContent[] = [
    ...beforeContent,
    capability.createPageContent("article", "de", "/de/article"),
  ];
  const after = capability.publishAlternates(extendedState, allContent);
  assert.equal(after.success, true);
  if (!after.success) {
    throw new Error("expected success branch");
  }
  assert.deepEqual(
    [...after.alternates.alternates].sort(),
    ["/de/article", "/fr/article"]
  );
  assert.equal(after.alternates.canonical, "/en/article");
  assert.equal(after.alternates.defaultAlternate, "/en/article");
});

test("multilingualdiscoverabilityvalidation", () => {
  const state = capability.createLocalisationState(
    ["en", "fr"] as readonly Locale[],
    "en"
  );
  const content: readonly capabilityPageContent[] = [
    capability.createPageContent("article", "en", "/en/article"),
    capability.createPageContent("article", "fr", "/fr/article"),
    capability.createPageContent("landing", "en", "/en/landing"),
    capability.createPageContent("landing", "fr", "/fr/landing"),
  ];
  const enumerated = capability.enumerateAndValidate(state, content);
  assert.equal(enumerated.length, 2);
  for (const item of enumerated) {
    assert.ok(item.defaultAlternate.length > 0);
    assert.equal(item.canonical, item.defaultAlternate);
    for (const ref of item.alternates) {
      assert.ok(ref.length > 0);
    }
  }
  assert.doesNotThrow(() => {
    for (const item of enumerated) {
      capability.assertAlternatesValid(item);
    }
  });

  const brokenAlternates: capabilityPublishedAlternates = {
    pageType: "article",
    canonical: "/en/article",
    alternates: ["/fr/article", ""] as readonly string[],
    defaultAlternate: "",
  };
  assert.throws(() => {
    capability.assertAlternatesValid(brokenAlternates);
  });
  const brokenState = capability.validateAlternates(brokenAlternates);
  assert.equal(brokenState, "missing_default" as capabilityValidationState);
});

type Locale = capability.Locale;
type PageType = capability.PageType;
type Reference = capability.Reference;
type capabilityPageContent = capability.PageContent;
type capabilityPublishedAlternates = capability.PublishedAlternates;
type capabilityMultilingualErrorCode = capability.MultilingualErrorCode;
type capabilityValidationState = capability.ValidationState;