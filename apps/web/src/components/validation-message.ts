import { h, type JSX } from "preact";

// Binds design role urn:anqr:design-role:validation-message.
//
// The validation-feedback pattern requires the reason to be associated with the
// input it concerns and announced on arrival, not merely drawn in a colour. The
// text itself states the problem, so colour is never the only signal.

export interface ValidationMessageProps {
  readonly id: string;
  readonly parameter: string;
  readonly children: string;
}

export function ValidationMessage({ id, parameter, children }: ValidationMessageProps): JSX.Element {
  return h("p", {
    id,
    "data-design-role": "validation-message",
    "data-parameter": parameter,
    class: "validation-message",
    role: "alert",
  }, children);
}
