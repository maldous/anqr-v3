import { h, type JSX } from "preact";
import { ValidationMessage } from "./validation-message.ts";

// Binds design roles urn:anqr:design-role:option-control and :secondary-action,
// and experience actions set-error-correction, set-output-format,
// set-symbol-version, set-foreground-colour and toggle-encoding-options.
//
// The progressive-disclosure pattern requires the primary path to be complete
// with no secondary choice made, the disclosure state to be conveyed rather
// than drawn, and the governing control never to be removed by disclosing. So
// the button stays put and carries aria-expanded, and every option has a
// working default.

export interface EncodingOptionsProps {
  readonly disclosed: boolean;
  readonly errorCorrectionLevel: string;
  readonly outputFormat: string;
  readonly symbolVersion: number | "auto";
  readonly foregroundColour: string;
  readonly refusalFor: (parameter: string) => string | null;
  readonly disabled: boolean;
  readonly onToggle: () => void;
  readonly onErrorCorrection: (value: string) => void;
  readonly onOutputFormat: (value: string) => void;
  readonly onSymbolVersion: (value: number | "auto") => void;
  readonly onForegroundColour: (value: string) => void;
}

const REGION_ID = "anqr-encoding-options";
const LEVELS = ["L", "M", "Q", "H"];
const FORMATS = ["svg", "png", "gif"];
const VERSIONS = [1, 2, 3, 4, 5, 10, 20, 40];

function field(labelText: string, controlId: string, control: JSX.Element, message: JSX.Element | null): JSX.Element {
  return h("div", { class: "field" }, [
    h("label", { for: controlId, "data-design-role": "input-label", class: "field-label" }, labelText),
    control,
    message,
  ]);
}

export function EncodingOptions(props: EncodingOptionsProps): JSX.Element {
  const versionRefusal = props.refusalFor("symbolVersion");
  const colourRefusal = props.refusalFor("foregroundColour");

  return h("div", { class: "options" }, [
    h("button", {
      type: "button",
      "data-design-role": "secondary-action",
      "data-experience-action": "toggle-encoding-options",
      class: "options-toggle",
      "aria-expanded": props.disclosed ? "true" : "false",
      "aria-controls": REGION_ID,
      onClick: props.onToggle,
    }, props.disclosed ? "Hide encoding options" : "Show encoding options"),

    h("div", { id: REGION_ID, class: "options-region", hidden: !props.disclosed }, [
      field("Error correction", "anqr-ec", h("select", {
        id: "anqr-ec",
        "data-design-role": "option-control",
        "data-experience-action": "set-error-correction",
        value: props.errorCorrectionLevel,
        disabled: props.disabled,
        onChange: (event: Event) => props.onErrorCorrection((event.currentTarget as HTMLSelectElement).value),
      }, LEVELS.map((level) => h("option", { value: level, key: level }, level))), null),

      field("Output format", "anqr-format", h("select", {
        id: "anqr-format",
        "data-design-role": "option-control",
        "data-experience-action": "set-output-format",
        value: props.outputFormat,
        disabled: props.disabled,
        onChange: (event: Event) => props.onOutputFormat((event.currentTarget as HTMLSelectElement).value),
      }, FORMATS.map((format) => h("option", { value: format, key: format }, format.toUpperCase()))), null),

      field("Symbol version", "anqr-version", h("select", {
        id: "anqr-version",
        "data-design-role": "option-control",
        "data-experience-action": "set-symbol-version",
        value: String(props.symbolVersion),
        disabled: props.disabled,
        "aria-invalid": versionRefusal === null ? "false" : "true",
        "aria-describedby": versionRefusal === null ? undefined : "anqr-version-error",
        onChange: (event: Event) => {
          const raw = (event.currentTarget as HTMLSelectElement).value;
          props.onSymbolVersion(raw === "auto" ? "auto" : Number(raw));
        },
      }, [
        h("option", { value: "auto", key: "auto" }, "Automatic"),
        ...VERSIONS.map((version) => h("option", { value: String(version), key: version }, String(version))),
      ]), versionRefusal === null
        ? null
        : ValidationMessage({ id: "anqr-version-error", parameter: "symbolVersion", children: versionRefusal })),

      field("Foreground colour", "anqr-fg", h("input", {
        id: "anqr-fg",
        type: "text",
        "data-design-role": "option-control",
        "data-experience-action": "set-foreground-colour",
        value: props.foregroundColour,
        disabled: props.disabled,
        "aria-invalid": colourRefusal === null ? "false" : "true",
        "aria-describedby": colourRefusal === null ? undefined : "anqr-colour-error",
        onInput: (event: Event) => props.onForegroundColour((event.currentTarget as HTMLInputElement).value),
      }), colourRefusal === null
        ? null
        : ValidationMessage({ id: "anqr-colour-error", parameter: "foregroundColour", children: colourRefusal })),
    ]),
  ]);
}
