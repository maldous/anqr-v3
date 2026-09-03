import { h, type JSX } from "preact";

// Binds design role urn:anqr:design-role:preview-surface.
//
// The input-and-preview pattern requires the preview to be announced as a live
// region, to carry a text alternative describing what it depicts and whether it
// is usable, and never to present a stale preview as current. So a superseded
// preview is marked busy rather than replaced by a spinner, and the alternative
// states the verdict rather than saying "a code".
//
// The image is produced by the real container adapter and handed here as a data
// URL. Nothing about the artefact is computed in this component.

export interface ArtefactPreviewProps {
  readonly dataUrl: string | null;
  readonly alternativeText: string;
  readonly busy: boolean;
  readonly placeholder: string;
}

export function ArtefactPreview({ dataUrl, alternativeText, busy, placeholder }: ArtefactPreviewProps): JSX.Element {
  return h("div", {
    "data-design-role": "preview-surface",
    class: "preview",
    role: "region",
    "aria-label": "Artefact preview",
    "aria-live": "polite",
    "aria-busy": busy ? "true" : "false",
  }, dataUrl === null
    ? h("p", { class: "preview-placeholder" }, placeholder)
    : h("img", { class: "preview-image", src: dataUrl, alt: alternativeText }));
}
