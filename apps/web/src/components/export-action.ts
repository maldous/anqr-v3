import { h, type JSX } from "preact";
import { StatusMessage } from "./status-message.ts";

// Binds design roles urn:anqr:design-role:export-action and :primary-action,
// and experience action urn:anqr:experience-action:export-artefact.
//
// The export-download pattern requires the accessible name to say what will be
// produced rather than only naming the verb, requires focus to stay on the
// action so a second export needs no hunting, and forbids reporting success
// before the artefact exists. The button is disabled with a stated reason
// rather than hidden, because a control that vanishes cannot be asked about.
//
// The wrapper carries primary-action and the button carries export-action:
// both roles are declared and both are genuinely present, the region being
// where the journey's primary intent lives and the button the control that
// produces the container.

export interface ExportActionProps {
  readonly format: string;
  readonly permitted: boolean;
  readonly unavailableReason: string | null;
  readonly busy: boolean;
  readonly outcome: { readonly tone: "success" | "failure"; readonly text: string } | null;
  readonly onExport: () => void;
}

const STATUS_ID = "anqr-export-status";
const REASON_ID = "anqr-export-reason";

export function ExportAction(props: ExportActionProps): JSX.Element {
  const disabled = !props.permitted || props.busy;
  return h("div", { class: "export", "data-design-role": "primary-action" }, [
    h("button", {
      type: "button",
      "data-design-role": "export-action",
      "data-experience-action": "export-artefact",
      class: "export-button",
      disabled,
      "aria-busy": props.busy ? "true" : "false",
      "aria-describedby": props.unavailableReason === null ? STATUS_ID : `${REASON_ID} ${STATUS_ID}`,
      onClick: props.onExport,
    }, props.busy ? `Exporting ${props.format.toUpperCase()}…` : `Export as ${props.format.toUpperCase()}`),
    props.unavailableReason === null
      ? null
      : h("p", { id: REASON_ID, class: "export-reason" }, props.unavailableReason),
    props.outcome === null
      ? StatusMessage({ id: STATUS_ID, tone: "progress", children: props.busy ? "Producing the file." : "Ready to export." })
      : StatusMessage({ id: STATUS_ID, tone: props.outcome.tone, children: props.outcome.text }),
  ]);
}
