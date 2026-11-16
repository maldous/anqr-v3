import assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/localisation/multilingualdiscoverability.ts";

test("multilingualdiscoverabilitycontracts", () => {
  const state = capability.createLocalisationState(["en", "fr", "de"], "en");
  const content = [
    capability.createPageContent("article", "en", "/en/article"),
    capability.createPageContent("article", "fr", "/fr/article"),
    capability.createPageContent("article", "de", "/de/article"),
  ];
  const result = capability.publishAlternates(state, "article", content);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.alternates.pageType, "article");
    assert.equal(result.alternates.canonical, "/en/article");
    assert.deepEqual(result.alternates.alternates, ["/fr/article", "/de/article"]);
    assert.equal(result.alternates.defaultAlternate, "/en/article");
    assert.equal(capability.validateAlternates(result.alternates), "valid");
  }
});

test("multilingualdiscoverabilityerrormodel", () => {
  // Declared locale "de" has no content: no alternate should be published for it.
  const state = capability.createLocalisationState(["en", "fr", "de"], "en");
  const content = [
    capability.createPageContent("article", "en", "/en/article"),
    capability.createPageContent("article", "fr", "/fr/article"),
  ];
  const result = capability.publishAlternates(state, "article", content);
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.alternates.alternates, ["/fr/article"]);
  }

  // Content for an undeclared locale must be rejected.
  const invertedState = capability.createLocalisationState(["en", "de"], "en");
  const invertedContent = [
    capability.createPageContent("article", "en", "/en/article"),
    capability.createPageContent("article", "fr", "/fr/article"),
  ];
  const invertedResult = capability.publishAlternates(invertedState, "article", invertedContent);
  assert.equal(invertedResult.success, false);
  if (!invertedResult.success) {
    assert.equal(invertedResult.error.code, "UNDECLARED_LOCALE");
  }
});

test("multilingualdiscoverabilitystatemodel", () => {
  const baseState = capability.createLocalisationState(["en", "fr"], "en");
  const beforeContent = [
    capability.createPageContent("article", "en", "/en/article"),
    capability.createPageContent("article", "fr", "/fr/article"),
  ];
  const before = capability.publishAlternates(baseState, "article", beforeContent);
  assert.equal(before.success, true);
  if (before.success) {
    assert.deepEqual([...before.alternates.alternates], ["/fr/article"]);
  }

  const extendedState = capability.addLocale(baseState, "de");
  const allContent = [
    ...beforeContent,
    capability.createPageContent("article", "de", "/de/article"),
  ];
  const after = capability.publishAlternates(extendedState, "article", allContent);
  assert.equal(after.success, true);
  if (after.success) {
    assert.deepEqual([...after.alternates.alternates].sort(), ["/de/article", "/fr/article"]);
    assert.equal(after.alternates.canonical, "/en/article");
    assert.equal(after.alternates.defaultAlternate, "/en/article");
  }
});

test("multilingualdiscoverabilityvalidation", () => {
  const state = capability.createLocalisationState(["en", "fr"], "en");
  const content = [
    capability.createPageContent("article", "en", "/en/article"),
    capability.createPageContent("article", "fr", "/fr/article"),
    capability.createPageContent("landing", "en", "/en/landing"),
    capability.createPageContent("landing", "fr", "/fr/landing"),
  ];
  const enumerated = capability.enumerateAndValidate(state, content, capability.validateAlternates);
  assert.equal(enumerated.length, 2);
  for (const item of enumerated) {
    assert.ok(item.defaultAlternate.length > 0);
    assert.equal(item.canonical, item.defaultAlternate);
    for (const ref of item.alternates) {
      assert.ok(ref.length > 0);
    }
  }
  for (const item of enumerated) {
    capability.assertAlternatesValid(item);
  }

  // An audit that fails for "article" must exclude that page type.
  const auditFailing = (alternates: capability.PublishedAlternates): capability.ValidationState => {
    if (alternates.pageType === "article") return "missing_default";
    return capability.validateAlternates(alternates);
  };
  const enumeratedFailing = capability.enumerateAndValidate(state, content, auditFailing);
  assert.equal(enumeratedFailing.length, 1);
  assert.equal(enumeratedFailing[0].pageType, "landing");

  // assertAlternatesValid throws on broken alternates.
  const brokenAlternates: capability.PublishedAlternates = {
    pageType: "article",
    canonical: "/en/article",
    alternates: ["/fr/article", ""],
    defaultAlternate: "",
  };
  assert.throws(() => capability.assertAlternatesValid(brokenAlternates));
  const brokenState = capability.validateAlternates(brokenAlternates);
  assert.equal(brokenState, "missing_default");
});

test("multilingualdiscoverability audits no-content results before emission", () => {
  const state = capability.createLocalisationState(["en"], "en");
  const content = [
    capability.createPageContent("article", "fr", "/fr/article"),
    capability.createPageContent("landing", "en", "/en/landing"),
  ];
  const originalContent = content.map(item => ({ ...item }));

  for (const rejection of ["missing_default", "broken_reference", "empty", "throw"] as const) {
    const audited: string[] = [];
    const result = capability.enumerateAndValidate(state, content, alternates => {
      audited.push(alternates.pageType);
      if (alternates.pageType === "article") {
        if (rejection === "throw") throw new Error("audit refused");
        return rejection;
      }
      return capability.validateAlternates(alternates);
    });
    assert.deepEqual(audited, ["article", "landing"]);
    assert.deepEqual(result.map(item => item.pageType), ["landing"]);
    assert.deepEqual(content, originalContent);
    assert.deepEqual(state, { declaredLocales: ["en"], defaultLocale: "en" });
  }
});

test("multilingualdiscoverability preserves an explicitly accepted no-content result", () => {
  const state = capability.createLocalisationState(["en"], "en");
  const content = [capability.createPageContent("article", "fr", "/fr/article")];
  const audited: capability.PublishedAlternates[] = [];
  const result = capability.enumerateAndValidate(state, content, alternates => {
    audited.push(alternates);
    return "valid";
  });

  assert.equal(audited.length, 1);
  assert.equal(result[0], audited[0]);
  assert.deepEqual(result, [{
    pageType: "article", canonical: "", alternates: [], defaultAlternate: "",
  }]);
});
