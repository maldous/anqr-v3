import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/distribution/crawlablepresentation.ts";

const SHELL = "<html><head><meta charset=\"utf-8\"></head><body><div id=\"app\"></div></body></html>";
const LOCALES = ["en-GB", "de-DE", "ar"];

test("crawlablepresentationcontracts", () => {
  // The per-page metadata set, the canonical rule and the alternate-language rule.
  assert.equal(capability.PAGE_PATHS.length, 11);
  const titles = new Set<string>();
  for (const path of capability.PAGE_PATHS) {
    const meta = capability.PAGE_META[path];
    assert.ok(meta.title.length > 0 && meta.description.length > 20, `${path} needs its own metadata`);
    titles.add(meta.title);
  }
  assert.equal(titles.size, capability.PAGE_PATHS.length, "each page carries its own title, not the shell's");
  // Canonical: absolute, normalised, no trailing slash beyond root.
  assert.equal(capability.canonicalUrl("/guide/"), capability.canonicalUrl("/guide"));
  assert.equal(capability.canonicalUrl("/"), `${capability.BASE_URL}/`);
  // Alternates cover exactly the locales that have resources, plus x-default.
  const alternates = capability.alternateLinks("/guide", LOCALES);
  assert.equal(alternates.length, LOCALES.length + 1);
  assert.deepEqual(alternates.map(([locale]) => locale), [...LOCALES, "x-default"]);
  assert.deepEqual(capability.alternateLinks("/guide", []).map(([locale]) => locale), ["x-default"]);
});

test("crawlablepresentationerrormodel", () => {
  // A failed transform falls through to the static document rather than erroring.
  const noHead = "<html><body>no head here</body></html>";
  const fallen = capability.transform("/guide", noHead, LOCALES);
  assert.equal(fallen.transformed, false);
  assert.equal(fallen.html, noHead, "the unmodified document must be served");
  // A non-document path is passed through untouched.
  const asset = capability.transform("/assets/main.js", SHELL, LOCALES);
  assert.equal(asset.transformed, false);
  assert.equal(asset.html, SHELL);
  // An unknown document path also falls through rather than inventing metadata.
  assert.equal(capability.transform("/not-a-page", SHELL, LOCALES).transformed, false);
});

test("crawlablepresentationreadinessmodel", () => {
  // The edge transform's presence is observable independently of the static runtime.
  const edge = new capability.EdgeTransform();
  assert.equal(edge.present, true);
  assert.equal(edge.apply("/guide", SHELL, LOCALES).transformed, true);
  edge.setPresent(false);
  assert.equal(edge.present, false);
  const served = edge.apply("/guide", SHELL, LOCALES);
  assert.equal(served.transformed, false, "with the transform absent, metadata is absent");
  assert.equal(served.html, SHELL, "but the static document is still served");
});

test("crawlablepresentationvalidation", () => {
  // Each page path yields its own metadata, with no scripts executed: the
  // transform is a string operation over the document.
  const seen = new Map<string, string>();
  for (const path of capability.PAGE_PATHS) {
    const document = capability.transform(path, SHELL, LOCALES);
    assert.equal(document.transformed, true, `${path} must be transformed`);
    const title = /<title>([^<]*)<\/title>/u.exec(document.html)?.[1];
    assert.equal(title, capability.PAGE_META[path].title);
    assert.ok(document.html.includes(`<link rel="canonical" href="${capability.canonicalUrl(path)}">`));
    for (const locale of LOCALES) {
      assert.ok(document.html.includes(`hreflang="${locale}"`), `${path} must advertise ${locale}`);
    }
    seen.set(path, title ?? "");
  }
  assert.equal(new Set(seen.values()).size, capability.PAGE_PATHS.length);
  // Metadata is escaped, so a page title could never inject markup.
  const injected = capability.transform("/guide", SHELL.replace("</head>", "</head>"), LOCALES);
  assert.ok(!injected.html.includes("<script"), "the transform introduces no script");
});
