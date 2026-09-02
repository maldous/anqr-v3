import assert from "node:assert/strict";
import { test } from "node:test";
import * as capability from "../../../src/capabilities/localisation/localisedstaticcontent.ts";

const buildLocaleWithKnownPages = (localeCode: string, titlePrefix: string): capability.LocaleContent => {
  const pages: Record<string, capability.PageDefinition> = {};
  for (const pageType of capability.KNOWN_PAGE_TYPES) {
    const internalTarget =
      pageType === capability.PAGE_TYPE_HOME ? capability.PAGE_TYPE_CONTACT : capability.PAGE_TYPE_HOME;
    const section = capability.createSection(
      `${titlePrefix} ${pageType} section`,
      [`${titlePrefix} paragraph`],
      [`${titlePrefix} bullet`]
    );
    pages[pageType] = capability.createPageDefinition(
      `${titlePrefix} ${pageType} title`,
      `${titlePrefix} ${pageType} description`,
      "2023-10-01",
      [capability.createLink(`${titlePrefix} link`, internalTarget, true)],
      [capability.createLink("External", "https://example.com", false)],
      [section]
    );
  }

  return capability.createLocaleContent(localeCode, pages);
};

test("localisedstaticcontentcontracts", () => {
  const sections = [
    capability.createSection("Intro", ["Paragraph one", "Paragraph two"], ["Bullet one", "Bullet two"]),
    capability.createSection("Details", ["Final paragraph."], ["Point one", "Point two"]),
  ];

  const localePages: Record<string, capability.PageDefinition> = {};
  for (const pageType of capability.KNOWN_PAGE_TYPES) {
    localePages[pageType] = capability.createPageDefinition(
      `${pageType} title`,
      `${pageType} description`,
      "2023-10-01",
      [
        capability.createLink("Next", capability.PAGE_TYPE_ABOUT, true),
        capability.createLink("External", "https://example.com", false),
      ],
      [capability.createLink("Related", capability.PAGE_TYPE_HOME, true)],
      sections
    );
  }
  const locale = capability.createLocaleContent("en", localePages);

  assert.strictEqual(Object.keys(locale.pages).length, capability.KNOWN_PAGE_TYPES.length);
  for (const pageType of capability.KNOWN_PAGE_TYPES) {
    const page = locale.pages[pageType];
    assert.ok(page);
    assert.strictEqual(page.title, `${pageType} title`);
    assert.strictEqual(page.description, `${pageType} description`);
    assert.strictEqual(page.lastUpdated, "2023-10-01");
    assert.strictEqual(page.primaryLinks.length, 2);
    assert.strictEqual(page.relatedLinks.length, 1);
    assert.strictEqual(page.sections.length, 2);
    assert.deepStrictEqual(
      page.sections.map((section) => section.heading),
      ["Intro", "Details"]
    );
    assert.deepStrictEqual(page.sections[0]!.paragraphs, ["Paragraph one", "Paragraph two"]);
    assert.deepStrictEqual(page.sections[0]!.bullets, ["Bullet one", "Bullet two"]);
    assert.deepStrictEqual(page.sections[1]!.paragraphs, ["Final paragraph."]);
    assert.deepStrictEqual(page.sections[1]!.bullets, ["Point one", "Point two"]);
    assert.deepStrictEqual(capability.generateTableOfContents(page), ["Intro", "Details"]);
  }

  assert.throws(
    () => capability.createPageDefinition("Bad", "Bad", "2023-02-30"),
    /ISO date/
  );
});

test("localisedstaticcontenterrormodel", () => {
  const sourceHome = capability.createPageDefinition("Home", "Welcome", "2023-10-01");
  const sourceAbout = capability.createPageDefinition("About", "About us", "2023-10-01");
  const sourceContact = capability.createPageDefinition("Contact", "Contact us", "2023-10-01");
  const sourceNavigation = capability.createPageDefinition(
    "Navigation",
    "Site navigation",
    "2023-10-01",
    [capability.createLink("Home", "home", true), capability.createLink("About", "about", true)],
    [],
    []
  );
  const sourceLocale = capability.createLocaleContent("en", {
    home: sourceHome,
    about: sourceAbout,
    contact: sourceContact,
    navigation: sourceNavigation,
  });

  const initialState = capability.createStaticContentState("en", { en: sourceLocale });
  const state = capability.addLocale(initialState, capability.createLocaleContent("es", {}));

  const fallback = capability.getPage(state, "es", "contact");
  assert.strictEqual(fallback.success, true);
  if (fallback.success) {
    assert.ok(fallback.gap);
    assert.deepStrictEqual(fallback.gap, {
      localeCode: "es",
      pageType: "contact",
      fallbackLocale: "en",
      reported: true,
    });
    assert.strictEqual(fallback.page.title, sourceContact.title);
    assert.strictEqual(fallback.page.description, sourceContact.description);
    assert.strictEqual(capability.isGapReported(fallback.gap), true);
  }

  const renderedFallback = capability.renderPage(state, "es", "contact");
  assert.strictEqual(renderedFallback.success, true);
  if (renderedFallback.success) {
    assert.strictEqual(renderedFallback.localeCode, "en");
    assert.ok(renderedFallback.gap);
    assert.strictEqual(renderedFallback.gap.pageType, "contact");
  }

  const missingInBoth = capability.getPage(state, "es", "not-a-known-page");
  assert.strictEqual(missingInBoth.success, false);
  if (!missingInBoth.success) {
    assert.strictEqual(missingInBoth.error, capability.ERR_PAGE_NOT_FOUND);
  }

  const unknownLocale = capability.getPage(state, "fr", "home");
  assert.strictEqual(unknownLocale.success, false);
  if (!unknownLocale.success) {
    assert.strictEqual(unknownLocale.error, capability.ERR_LOCALE_NOT_FOUND);
  }

  const emptyPage = capability.getPage(state, "es", "contact");
  assert.ok(emptyPage.success);
  if (emptyPage.success) {
    assert.notStrictEqual(emptyPage.page.title, "");
    assert.notStrictEqual(emptyPage.page.description, "");
    assert.notStrictEqual(emptyPage.page.lastUpdated, "");
  }
});

test("localisedstaticcontentstatemodel", () => {
  const sourceLocale = capability.createLocaleContent("en", {
    home: capability.createPageDefinition("Home", "Welcome", "2023-10-01"),
    about: capability.createPageDefinition("About", "About", "2023-10-01"),
  });

  const baselineState = capability.createStaticContentState("en", { en: sourceLocale });

  const baselineRender = capability.renderPage(baselineState, "en", capability.PAGE_TYPE_HOME);
  assert.strictEqual(baselineRender.success, true);

  const localeToAdd = capability.createLocaleContent("es", {
    home: capability.createPageDefinition("Inicio", "Bienvenido", "2023-10-02"),
    about: capability.createPageDefinition("Sobre", "Acerca", "2023-10-02"),
  });
  const stateWithLocale = capability.addLocale(baselineState, localeToAdd);

  assert.notStrictEqual(stateWithLocale, baselineState);
  assert.strictEqual(baselineState.locales["es"], undefined);
  assert.ok(stateWithLocale.locales["es"]);
  assert.deepStrictEqual(stateWithLocale.locales["en"], baselineState.locales["en"]);

  const renderedAfterSource = capability.renderPage(stateWithLocale, "en", capability.PAGE_TYPE_HOME);
  assert.strictEqual(renderedAfterSource.success, true);
  if (renderedAfterSource.success && baselineRender.success) {
    assert.deepStrictEqual(renderedAfterSource.page, baselineRender.page);
  }

  const renderedInAddedLocale = capability.renderPage(stateWithLocale, "es", capability.PAGE_TYPE_HOME);
  assert.strictEqual(renderedInAddedLocale.success, true);
  if (renderedInAddedLocale.success) {
    assert.strictEqual(renderedInAddedLocale.localeCode, "es");
    assert.strictEqual(renderedInAddedLocale.page.title, "Inicio");
  }

  const esLocaleSnapshot = stateWithLocale.locales["es"]!;
  const contactInEs = capability.createPageDefinition("Contacto", "Informacion de contacto", "2023-10-02");
  const updatedEsLocale = capability.addPageToLocale(
    esLocaleSnapshot,
    capability.PAGE_TYPE_CONTACT,
    contactInEs
  );
  assert.notStrictEqual(updatedEsLocale, esLocaleSnapshot);
  assert.strictEqual(esLocaleSnapshot.pages[capability.PAGE_TYPE_CONTACT], undefined);
  assert.strictEqual(updatedEsLocale.pages[capability.PAGE_TYPE_CONTACT], contactInEs);

  const contactFromState = capability.renderPage(stateWithLocale, "es", capability.PAGE_TYPE_CONTACT);
  assert.strictEqual(contactFromState.success, false);
  if (!contactFromState.success) {
    assert.strictEqual(contactFromState.error, capability.ERR_PAGE_NOT_FOUND);
  }

  assert.throws(() => capability.removeLocale(stateWithLocale, "en"), /Cannot remove source locale/);
});

test("localisedstaticcontentuisemantics", () => {
  const englishHome = capability.createPageDefinition(
    "Home",
    "Welcome",
    "2023-10-01",
    [],
    [],
    [capability.createSection("Introduction", ["Welcome paragraph"])]
  );
  const englishNavigation = capability.createPageDefinition(
    "Navigation",
    "Main navigation",
    "2023-10-01",
    [],
    [],
    [capability.createSection("Navigation", ["Primary links."])]
  );

  const spanishHome = capability.createPageDefinition(
    "Inicio",
    "Bienvenido",
    "2023-10-02",
    [],
    [],
    [capability.createSection("Introduccion", ["Bienvenida del sitio"])]
  );
  const spanishNavigation = capability.createPageDefinition(
    "Navegacion",
    "Menu del sitio",
    "2023-10-02",
    [capability.createLink("Inicio", "home", true)],
    [],
    [capability.createSection("Navegacion", ["Enlaces principales"])]
  );

  const state = capability.createStaticContentState("en", {
    en: capability.createLocaleContent("en", {
      home: englishHome,
      navigation: englishNavigation,
    }),
    es: capability.createLocaleContent("es", {
      home: spanishHome,
      navigation: spanishNavigation,
    }),
  });

  const navigationResult = capability.getLocaleNavigation(state, "es");
  assert.strictEqual(navigationResult.success, true);
  if (navigationResult.success) {
    assert.strictEqual(navigationResult.page.title, "Navegacion");
    assert.deepStrictEqual(capability.generateTableOfContents(navigationResult.page), ["Navegacion"]);
    const navSections = navigationResult.page.sections;
    assert.strictEqual(navSections[0]!.heading, "Navegacion");
  }

  const renderedNavigation = capability.renderPage(state, "es", capability.PAGE_TYPE_NAVIGATION);
  assert.strictEqual(renderedNavigation.success, true);
  if (renderedNavigation.success) {
    assert.strictEqual(renderedNavigation.localeCode, "es");
    assert.strictEqual(renderedNavigation.page.title, "Navegacion");
    assert.strictEqual(renderedNavigation.gap, undefined);
    assert.deepStrictEqual(capability.generateTableOfContents(renderedNavigation.page), ["Navegacion"]);
  }

  const englishNavigationResult = capability.getLocaleNavigation(state, "en");
  assert.strictEqual(englishNavigationResult.success, true);
  if (englishNavigationResult.success) {
    assert.strictEqual(englishNavigationResult.page.title, "Navigation");
    assert.deepStrictEqual(capability.generateTableOfContents(englishNavigationResult.page), ["Navigation"]);
  }

  const spanishHomeResult = capability.renderPage(state, "es", capability.PAGE_TYPE_HOME);
  assert.strictEqual(spanishHomeResult.success, true);
  if (spanishHomeResult.success) {
    assert.strictEqual(spanishHomeResult.localeCode, "es");
    assert.strictEqual(spanishHomeResult.page.title, "Inicio");
    assert.deepStrictEqual(capability.generateTableOfContents(spanishHomeResult.page), ["Introduccion"]);
  }
});

test("localisedstaticcontentvalidation", () => {
  const state = capability.createStaticContentState("en", {
    en: buildLocaleWithKnownPages("en", "EN"),
    es: buildLocaleWithKnownPages("es", "ES"),
    fr: buildLocaleWithKnownPages("fr", "FR"),
  });

  const completeness = capability.validateContentCompleteness(state);
  assert.strictEqual(completeness.success, true);
  if (completeness.success) {
    assert.strictEqual(completeness.localeValidations.length, Object.keys(state.locales).length);
    assert.ok(completeness.localeValidations.every((entry) => entry.success));
    assert.ok(completeness.pageValidations.every((entry) => entry.success));
    assert.strictEqual(completeness.missingPages.length, 0);
    assert.strictEqual(completeness.renderFailures.length, 0);
  }

  for (const localeCode of Object.keys(state.locales)) {
    const locale = state.locales[localeCode];
    assert.ok(locale);
    for (const pageType of capability.KNOWN_PAGE_TYPES) {
      const page = locale.pages[pageType];
      assert.ok(page);
      const resolved = capability.resolveInternalLinks(state, localeCode, page);
      assert.strictEqual(resolved.success, true);
      if (resolved.success) {
        assert.strictEqual(resolved.page.title, page.title);
      }
    }
  }

  const broken = capability.createPageDefinition(
    "Broken",
    "Broken internal link page",
    "2023-10-01",
    [capability.createLink("Missing", "not-found", true)],
    [],
    [capability.createSection("Broken", ["Bad link"])]
  );
  const brokenLinks = capability.resolveInternalLinks(state, "en", broken);
  assert.strictEqual(brokenLinks.success, false);
  if (!brokenLinks.success) {
    assert.strictEqual(brokenLinks.error, capability.ERR_INTERNAL_LINK_UNRESOLVED);
  }
});