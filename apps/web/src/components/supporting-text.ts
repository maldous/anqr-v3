import { h, type JSX } from "preact";

// Binds design role urn:anqr:design-role:supporting-text.
//
// Explanatory, never an error. Associated with its control by id so it is
// announced as a description rather than read as an unrelated paragraph.

export interface SupportingTextProps {
  readonly id: string;
  readonly children: string;
}

export function SupportingText({ id, children }: SupportingTextProps): JSX.Element {
  return h("p", { id, "data-design-role": "supporting-text", class: "supporting-text" }, children);
}
