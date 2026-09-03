import { h, render } from "preact";
import { CreationSurface } from "./surfaces/creation-surface.ts";
import { createProducer, deliverToBrowser, previewDataUrl } from "./composition.ts";
import type { ExperienceModel } from "./experience/machine.ts";

// The entry point. It composes and mounts; it decides nothing.

const producer = createProducer();

const previewFor = async (model: ExperienceModel): Promise<string | null> =>
  model.artefact === null ? null : previewDataUrl(model.artefact);

const root = document.getElementById("anqr-root");
if (root === null) throw new Error("ANQR_ROOT_ABSENT");
render(h(CreationSurface, { host: { producer, deliver: deliverToBrowser }, previewFor }), root);
