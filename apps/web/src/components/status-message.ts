import { h, type JSX } from "preact";

// Binds design role urn:anqr:design-role:status-message.
//
// The action-result-feedback pattern requires an outcome to be announced and
// requires success and failure to be distinguishable. Failure is assertive,
// because a failure the actor does not notice is a failure twice; success is
// polite so it does not interrupt.

export interface StatusMessageProps {
  readonly id: string;
  readonly tone: "success" | "failure" | "progress";
  readonly children: string;
}

export function StatusMessage({ id, tone, children }: StatusMessageProps): JSX.Element {
  return h("p", {
    id,
    "data-design-role": "status-message",
    "data-tone": tone,
    class: `status-message status-${tone}`,
    role: tone === "failure" ? "alert" : "status",
    "aria-live": tone === "failure" ? "assertive" : "polite",
  }, children);
}
