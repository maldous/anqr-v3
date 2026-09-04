// crawlablepresentation.ts
// Be readable by something that will not run the application. A client-rendered
// application is invisible to crawlers unless something answers for it, which
// is what the edge transform does.

export type PagePath = "/" | "/analyze" | "/gallery" | "/guide" | "/learn" | "/examples"
  | "/translate" | "/about" | "/privacy" | "/terms" | "/contact";

export const PAGE_PATHS: readonly PagePath[] = [
  "/", "/analyze", "/gallery", "/guide", "/learn", "/examples",
  "/translate", "/about", "/privacy", "/terms", "/contact",
];

export interface PageMeta {
  readonly title: string;
  readonly description: string;
  readonly previewImage: string;
}

/** Per-page metadata. Each page carries its own; none inherits the shell's. */
export const PAGE_META: Readonly<Record<PagePath, PageMeta>> = {
  "/": { title: "Create a QR code", description: "Make a QR artefact that scans, from a payload you state.", previewImage: "/og/create.png" },
  "/analyze": { title: "Analyse a QR code", description: "Understand a code that already exists, from an image or a link.", previewImage: "/og/analyze.png" },
  "/gallery": { title: "Gallery", description: "Worked examples of what the artefact surface can produce.", previewImage: "/og/gallery.png" },
  "/guide": { title: "Guide", description: "How to choose encoding, styling and output for a scannable artefact.", previewImage: "/og/guide.png" },
  "/learn": { title: "Learn", description: "How QR artefacts encode, correct errors and stay readable.", previewImage: "/og/learn.png" },
  "/examples": { title: "Examples", description: "Payload kinds and the artefacts they produce.", previewImage: "/og/examples.png" },
  "/translate": { title: "Translate", description: "Improve ANQR in your own language.", previewImage: "/og/translate.png" },
  "/about": { title: "About", description: "What ANQR is and who makes it.", previewImage: "/og/about.png" },
  "/privacy": { title: "Privacy", description: "What ANQR does and does not hold about you.", previewImage: "/og/privacy.png" },
  "/terms": { title: "Terms", description: "The terms under which ANQR is offered.", previewImage: "/og/terms.png" },
  "/contact": { title: "Contact", description: "How to reach the people who make ANQR.", previewImage: "/og/contact.png" },
};

export const BASE_URL = "https://example.invalid";

/** Paths the transform must not touch, because they are not documents. */
const NON_DOCUMENT = [/^\/assets\//u, /^\/api\//u, /^\/\.netlify\//u, /^\/icons\//u, /^\/\.well-known\//u,
  /\.(?:js|css|png|jpe?g|gif|svg|ico|woff2?|json|xml|txt|webp|map|webmanifest)$/iu];

export function isDocumentPath(path: string): boolean {
  return !NON_DOCUMENT.some((pattern) => pattern.test(path));
}

export function normalise(path: string): string {
  let normalised = path;
  while (normalised.length > 1 && normalised.endsWith("/")) normalised = normalised.slice(0, -1);
  return normalised === "" ? "/" : normalised;
}

/** The canonical rule: one absolute URL per page, without query or fragment. */
export function canonicalUrl(path: string): string {
  return `${BASE_URL}${normalise(path)}`;
}

/**
 * The alternate-language rule: alternates cover exactly the locales that have
 * resources. Advertising an alternate with nothing behind it sends a crawler
 * to a page that falls back, which is worse than not advertising it.
 */
export function alternateLinks(path: string, availableLocales: readonly string[]): readonly (readonly [string, string])[] {
  const canonical = normalise(path);
  return [
    ...availableLocales.map((locale) => [locale, `${BASE_URL}/${locale}${canonical === "/" ? "" : canonical}`] as const),
    ["x-default", canonicalUrl(path)] as const,
  ];
}

export interface Document {
  readonly html: string;
  readonly transformed: boolean;
}

function escapeHtml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
}

/**
 * Inject metadata ahead of the static response.
 *
 * A transform failure falls through to the unmodified static document rather
 * than producing an error: a page with generic metadata is a degraded result,
 * and a page that fails to load is not a result at all.
 */
export function transform(path: string, staticHtml: string, availableLocales: readonly string[]): Document {
  try {
    if (!isDocumentPath(path)) return { html: staticHtml, transformed: false };
    const normalised = normalise(path) as PagePath;
    const meta = PAGE_META[normalised];
    if (meta === undefined) return { html: staticHtml, transformed: false };
    const head = [
      `<title>${escapeHtml(meta.title)}</title>`,
      `<meta name="description" content="${escapeHtml(meta.description)}">`,
      `<meta property="og:title" content="${escapeHtml(meta.title)}">`,
      `<meta property="og:description" content="${escapeHtml(meta.description)}">`,
      `<meta property="og:image" content="${BASE_URL}${meta.previewImage}">`,
      `<link rel="canonical" href="${canonicalUrl(path)}">`,
      ...alternateLinks(path, availableLocales).map(([locale, href]) => `<link rel="alternate" hreflang="${locale}" href="${href}">`),
    ].join("");
    if (!staticHtml.includes("</head>")) throw new Error("no head to inject into");
    return { html: staticHtml.replace("</head>", `${head}</head>`), transformed: true };
  } catch {
    return { html: staticHtml, transformed: false };
  }
}

/** Readiness of the edge transform, answerable independently of the shell. */
export class EdgeTransform {
  #present = true;
  setPresent(present: boolean): void { this.#present = present; }
  get present(): boolean { return this.#present; }
  apply(path: string, staticHtml: string, locales: readonly string[]): Document {
    return this.#present ? transform(path, staticHtml, locales) : { html: staticHtml, transformed: false };
  }
}
