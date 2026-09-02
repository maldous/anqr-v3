import { test } from "node:test";
import assert from "node:assert/strict";
import * as capability from "../../../src/capabilities/localisation/localisedstaticcontent.ts";

test("localisedstaticcontentcontracts", () => {
  const section = capability.createSection(
    "Introduction",
    ["This is the first paragraph."],
    ["First bullet", "Second bullet"]
  );
  const internalLink = capability.createLink("About", "/about", true);
  const externalLink = capability.createLink("External", "https://example.com", false);
  const page = capability.createPageDefinition(
    "Home Page",
    "Welcome",
    "2023-10-01",
    [internalLink],
    [externalLink],
    [section]
  );

  assert.strictEqual(page.title, "Home Page");
  assert.strictEqual(page.description, "Welcome");
  assert.strictEqual(page.lastUpdated, "2023-10-01");
  assert.strictEqual(page.primaryLinks.length, 1);
  assert.strictEqual(page.relatedLinks.length, 1);
  assert.strictEqual(page.sections.length, 1);
  assert.strictEqual(page.sections[0].heading, "Introduction");
  assert.strictEqual(page.sections[0].paragraphs.length, 1);
  assert.strictEqual(page.sections[0].bullets.length, 2);

  // Negative case: invalid date must be rejected.
  assert.throws(
    () => capability.createPageDefinition("Bad", "Bad", "not-a-date"),
    /ISO date/,
    "An invalid lastUpdated must be rejected"
  );

  // Negative case: empty heading must be rejected.
  assert.throws(
    () => capability.createSection(""),
    /non-empty/,
    "An empty section heading must be rejected"
  );
});

test("localisedstaticcontenterrormodel", () => {
  const page = capability.createPageDefinition("Home", "Welcome", "2023-10-01");
  const enLocale = capability.createLocaleContent("en", { home: page });
  const initialState = capability.createStaticContentState();
  const stateWithEn = capability.addLocale(initialState, enLocale);

  const esLocale = capability.createLocaleContent("es", {});
  const stateWithEs = capability.addLocale(stateWithEn, esLocale);

  const result = capability.getPage(stateWithEs, "es", "home");
  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.page.title, "Home");
    assert.ok(result.gap, "Expected a gap report when falling back to source locale");
    if (result.gap !== undefined) {
      assert.strictEqual(result.gap.localeCode, "es");
      assert.strictEqual(result.gap.pageType, "home");
      assert.strictEqual(result.gap.fallbackLocale, "en");
    }
  } else {
    assert.fail("Expected fallback to succeed with gap report");
  }

  const errorResult = capability.getPage(stateWithEs, "es", "nonexistent");
  assert.strictEqual(errorResult.success, false);
  if (!errorResult.success) {
    assert.ok(errorResult.error.includes("not found"));
  } else {
    assert.fail("Expected lookup of missing page to fail");
  }
});

test("localisedstaticcontentstatemodel", () => {
  const initialState = capability.createStaticContentState();
  const originalLocales = initialState.locales;

  const page = capability.createPageDefinition("Title", "Desc", "2023-10-01");
  const locale = capability.createLocaleContent("en", { home: page });
  const newState = capability.addLocale(initialState, locale);

  assert.notStrictEqual(initialState, newState, "Adding a locale must return a new state object");
  assert.strictEqual(initialState.locales, originalLocales, "Original state must not be mutated");
  assert.ok(newState.locales["en"], "New state must contain the added locale");
  assert.strictEqual(newState.sourceLocale, "en");

  // Adding a page to a locale must not mutate the locale either.
  const page2 = capability.createPageDefinition("Title 2", "Desc 2", "2023-10-02");
  const updatedLocale = capability.addPageToLocale(newState.locales["en"]!, "about", page2);
  assert.notStrictEqual(updatedLocale, newState.locales["en"]);
  assert.ok(!newState.locales["en"].pages["about"], "Original locale must not gain the new page");
  assert.ok(updatedLocale.pages["about"], "Returned locale must contain the added page");
});

test("localisedstaticcontentuisemantics", () => {
  const section = capability.createSection("Introducción", ["Texto de introducción."], []);
  const page = capability.createPageDefinition(
    "Página de Inicio",
    "Bienvenido",
    "2023-10-01",
    [],
    [],
    [section]
  );

  const toc = capability.generateTableOfContents(page);
  assert.deepStrictEqual([...toc], ["Introducción"]);

  const navSection = capability.createSection("Navegación", [], []);
  const navPage = capability.createPageDefinition(
    "Navegación",
    "Menú principal",
    "2023-10-01",
    [],
    [],
    [navSection]
  );
  const esLocale = capability.createLocaleContent("es", { navigation: navPage });
  const initialState = capability.createStaticContentState();
  const stateWithEs = capability.addLocale(initialState, esLocale);

  const navResult = capability.getLocaleNavigation(stateWithEs, "es");
  assert.strictEqual(navResult.success, true);
  if (navResult.success) {
    const navToc = capability.generateTableOfContents(navResult.page);
    assert.deepStrictEqual([...navToc], ["Navegación"]);
    assert.strictEqual(navResult.page.title, "Navegación");
  } else {
    assert.fail("Expected navigation lookup to succeed");
  }
});

test("localisedstaticcontentvalidation", () => {
  const page = capability.createPageDefinition("Home", "Welcome", "2023-10-01");
  const pageWithLink = capability.createPageDefinition(
    "About",
    "About us",
    "2023-10-01",
    [capability.createLink("Home", "home", true)],
    [],
    []
  );

  const enLocale = capability.createLocaleContent("en", { home: page, about: pageWithLink });
  const esLocale = capability.createLocaleContent("es", { home: page, about: pageWithLink });
  const frLocale = capability.createLocaleContent("fr", { home: page, about: pageWithLink });
  const deLocale = capability.createLocaleContent("de", { home: page, about: pageWithLink });

  let state = capability.createStaticContentState();
  state = capability.addLocale(state, enLocale);
  state = capability.addLocale(state, esLocale);
  state = capability.addLocale(state, frLocale);
  state = capability.addLocale(state, deLocale);

  const resolved = capability.resolveInternalLinks(state, "en", pageWithLink);
  assert.strictEqual(resolved.success, true);
  if (resolved.success) {
    assert.strictEqual(resolved.page.primaryLinks.length, 1);
  } else {
    assert.fail("Expected internal link resolution to succeed");
  }

  // Negative case: an internal link that does not resolve must fail.
  const brokenLinkPage = capability.createPageDefinition(
    "Broken",
    "Broken",
    "2023-10-01",
    [capability.createLink("Missing", "does-not-exist", true)],
    [],
    []
  );
  const broken = capability.resolveInternalLinks(state, "en", brokenLinkPage);
  assert.strictEqual(broken.success, false);
  if (!broken.success) {
    assert.ok(broken.error.includes("could not be resolved"));
  } else {
    assert.fail("Expected broken internal link to fail resolution");
  }

  const completeness = capability.validateContentCompleteness(state);
  for (const lv of completeness.localeValidations) {
    assert.strictEqual(lv.success, true);
  }
  assert.strictEqual(completeness.missingPages.length, 0, "All declared locales and page types should be loaded");
});