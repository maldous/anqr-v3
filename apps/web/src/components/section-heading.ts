import { h, type JSX } from "preact";

// Binds design role urn:anqr:design-role:content-heading.
//
// A real heading element, because the role governs the document outline and an
// outline made of styled text is invisible to anyone navigating by structure.
//
// Written with h rather than JSX: Node's type stripping transforms types but
// not JSX, so a .tsx component could not be tested without adding a loader
// hook. The framework is identical either way and the toolchain is smaller.

export interface SectionHeadingProps {
  readonly level: 1 | 2;
  readonly id?: string;
  readonly children: string;
}

export function SectionHeading({ level, id, children }: SectionHeadingProps): JSX.Element {
  return h(level === 1 ? "h1" : "h2", {
    id,
    "data-design-role": "content-heading",
    class: `heading heading-${level}`,
  }, children);
}
