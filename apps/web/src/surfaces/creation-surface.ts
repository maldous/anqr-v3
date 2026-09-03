import { h, type JSX } from "preact";
import { useCallback, useEffect, useState } from "preact/hooks";

import { ArtefactPreview } from "../components/artefact-preview.ts";
import { EncodingOptions } from "../components/encoding-options.ts";
import { ExportAction } from "../components/export-action.ts";
import { PayloadField } from "../components/payload-field.ts";
import { SectionHeading } from "../components/section-heading.ts";
import { StatusMessage } from "../components/status-message.ts";
import {
  actionPermitted, createExperience, INITIAL_MODEL, type ExperienceHost, type ExperienceModel,
} from "../experience/machine.ts";

// Binds journey urn:anqr:product-journey:create-and-export-artefact.
//
// The surface renders the model the machine returns and keeps no state of its
// own beyond that model and the preview it was handed. A component-local
// boolean would become a second UX model that no semantic authority describes
// and no test compares.

export interface CreationSurfaceProps {
  readonly host: ExperienceHost;
  readonly previewFor: (model: ExperienceModel) => Promise<string | null>;
}

export function CreationSurface({ host, previewFor }: CreationSurfaceProps): JSX.Element {
  const [experience] = useState(() => createExperience(host));
  const [model, setModel] = useState<ExperienceModel>(INITIAL_MODEL);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void previewFor(model).then((url) => { if (current) setPreview(url); });
    return () => { current = false; };
  }, [model, previewFor]);

  const refusalFor = useCallback(
    (parameter: string): string | null =>
      model.refusals.find((entry) => entry.parameter === parameter)?.detail ?? null,
    [model.refusals],
  );

  const busy = model.state === "generating";
  const exporting = model.state === "exporting";
  const exportPermitted = actionPermitted(model.state, "export-artefact") && model.artefact !== null;

  const unavailableReason = exportPermitted ? null
    : model.state === "empty" ? "Enter a payload first."
    : model.state === "input-invalid" ? "Correct the highlighted choice first."
    : model.state === "generating" ? "The artefact is still being produced."
    : model.state === "failed" ? "Address the failure above first."
    : null;

  const outcome = model.exported !== null
    ? { tone: "success" as const, text: `Delivered ${model.exported.byteLength} bytes as ${model.exported.mediaType}.` }
    : model.failure !== null
    ? { tone: "failure" as const, text: model.failure }
    : null;

  const verdict = model.artefact?.scanSafety;
  const structure = model.artefact?.structure;
  const alternativeText = verdict === undefined
    ? "No artefact yet."
    : `Machine-readable code carrying ${model.values.payload}. ${verdict.detail}`;

  return h("main", { class: "surface", "data-journey": "create-and-export-artefact" }, [
    SectionHeading({ level: 1, children: "Make a scannable code" }),

    h("section", { class: "surface-column", "aria-labelledby": "anqr-describe" }, [
      SectionHeading({ level: 2, id: "anqr-describe", children: "Describe it" }),
      PayloadField({
        value: model.values.payload,
        invalidReason: refusalFor("payload"),
        disabled: exporting,
        onChange: (value) => { void experience.setPayload(model, value).then(setModel); },
      }),
      EncodingOptions({
        disclosed: model.optionsDisclosed,
        errorCorrectionLevel: model.values.errorCorrectionLevel,
        outputFormat: model.values.outputFormat,
        symbolVersion: model.values.symbolVersion,
        foregroundColour: model.values.foregroundColour,
        refusalFor,
        disabled: exporting,
        onToggle: () => setModel(experience.toggleOptions(model)),
        onErrorCorrection: (value) => { void experience.setErrorCorrection(model, value).then(setModel); },
        onOutputFormat: (value) => { void experience.setOutputFormat(model, value).then(setModel); },
        onSymbolVersion: (value) => { void experience.setSymbolVersion(model, value).then(setModel); },
        onForegroundColour: (value) => { void experience.setForegroundColour(model, value).then(setModel); },
      }),
    ]),

    h("section", { class: "surface-column", "aria-labelledby": "anqr-result" }, [
      SectionHeading({ level: 2, id: "anqr-result", children: "See it" }),
      ArtefactPreview({
        dataUrl: preview,
        alternativeText,
        busy,
        placeholder: "The code appears here as you type.",
      }),
      verdict === undefined ? null : StatusMessage({
        id: "anqr-scan-safety",
        tone: verdict.verdict === "scannable" ? "success" : "failure",
        children: verdict.verdict === "scannable"
          ? `Scan-safe. Version ${structure?.symbolVersion}, level ${structure?.errorCorrectionLevel}, mask ${structure?.maskPattern}, ${structure?.damageMarginCodewords} codewords of damage margin.`
          : verdict.detail,
      }),
      model.failure !== null && actionPermitted(model.state, "dismiss-failure")
        ? h("button", {
            type: "button",
            "data-design-role": "secondary-action",
            "data-experience-action": "dismiss-failure",
            onClick: () => setModel(experience.dismissFailure(model)),
          }, "Dismiss")
        : null,
      ExportAction({
        format: model.values.outputFormat,
        permitted: exportPermitted,
        unavailableReason,
        busy: exporting,
        outcome,
        onExport: () => { void experience.exportArtefact(model).then(setModel); },
      }),
    ]),
  ]);
}
