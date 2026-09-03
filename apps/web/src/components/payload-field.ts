import { h, type JSX } from "preact";
import { SupportingText } from "./supporting-text.ts";
import { ValidationMessage } from "./validation-message.ts";

// Binds design roles urn:anqr:design-role:input-label and :input-surface, and
// experience action urn:anqr:experience-action:set-payload.
//
// The input-and-preview pattern forbids requiring a submit step to see the
// consequence, so every change is reported. The validation-feedback pattern
// requires the reason to be associated with the input and requires focus not to
// move when it becomes invalid, so nothing here touches focus.

export interface PayloadFieldProps {
  readonly value: string;
  readonly invalidReason: string | null;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}

const FIELD_ID = "anqr-payload";
const HINT_ID = "anqr-payload-hint";
const ERROR_ID = "anqr-payload-error";

export function PayloadField({ value, invalidReason, disabled, onChange }: PayloadFieldProps): JSX.Element {
  const invalid = invalidReason !== null;
  return h("div", { class: "field" }, [
    h("label", { for: FIELD_ID, "data-design-role": "input-label", class: "field-label" },
      "What should the code carry?"),
    SupportingText({ id: HINT_ID, children: "A link, some text, or anything else you want scanned back out." }),
    h("textarea", {
      id: FIELD_ID,
      "data-design-role": "input-surface",
      "data-experience-action": "set-payload",
      class: "field-input",
      rows: 3,
      value,
      disabled,
      "aria-invalid": invalid ? "true" : "false",
      "aria-describedby": invalid ? `${HINT_ID} ${ERROR_ID}` : HINT_ID,
      onInput: (event: Event) => onChange((event.currentTarget as HTMLTextAreaElement).value),
    }),
    invalid ? ValidationMessage({ id: ERROR_ID, parameter: "payload", children: invalidReason }) : null,
  ]);
}
