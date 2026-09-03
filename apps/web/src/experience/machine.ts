import type {
  ArtefactProducer, JoinRefusal, OutputFormat, ProducedArtefact, ProduceRefusal,
} from "../../../../packages/artefact/src/application/produce-artefact.ts";

// The experience state machine.
//
// The declared states, permitted actions and transitions live in the semantic
// graph and are projected into packages/architecture/experience.json. This file
// restates them as executable code because the module boundary forbids a
// delivery component from importing assurance tooling, and a test compares the
// two so the restatement cannot drift.
//
// It holds no framework import. That is deliberate: the state semantics must
// survive replacing Preact, so they live outside it and the components read
// from here rather than keeping their own booleans. A component-local boolean
// would become an implicit second UX model that nothing checks.

export type ExperienceStateName =
  | "empty" | "input-invalid" | "generating" | "ready" | "exporting" | "exported" | "failed";

export type ExperienceActionName =
  | "set-payload" | "set-error-correction" | "set-output-format"
  | "set-symbol-version" | "set-foreground-colour"
  | "toggle-encoding-options" | "export-artefact" | "dismiss-failure";

/** Mirrors urn:anqr:experience-state:* permitsAction. */
export const PERMITTED_ACTIONS: Readonly<Record<ExperienceStateName, readonly ExperienceActionName[]>> = {
  empty: ["set-payload", "toggle-encoding-options"],
  "input-invalid": ["set-payload", "set-error-correction", "set-output-format", "set-symbol-version", "set-foreground-colour", "toggle-encoding-options"],
  generating: ["set-payload", "set-error-correction", "set-output-format", "set-symbol-version", "set-foreground-colour", "toggle-encoding-options"],
  ready: ["set-payload", "set-error-correction", "set-output-format", "set-symbol-version", "set-foreground-colour", "toggle-encoding-options", "export-artefact"],
  exporting: ["set-payload"],
  exported: ["set-payload", "set-error-correction", "set-output-format", "set-symbol-version", "set-foreground-colour", "export-artefact"],
  failed: ["set-payload", "set-error-correction", "set-output-format", "set-symbol-version", "set-foreground-colour", "dismiss-failure"],
};

/** Mirrors urn:anqr:state-transition:*, as from -> to pairs. */
export const PERMITTED_TRANSITIONS: readonly (readonly [ExperienceStateName, ExperienceStateName])[] = [
  ["empty", "generating"], ["empty", "input-invalid"],
  ["input-invalid", "generating"],
  ["generating", "ready"], ["generating", "failed"], ["generating", "input-invalid"],
  ["ready", "generating"], ["ready", "input-invalid"], ["ready", "exporting"],
  ["exporting", "exported"], ["exporting", "failed"],
  ["exported", "generating"], ["exported", "exporting"],
  ["failed", "generating"], ["failed", "ready"], ["failed", "input-invalid"],
];

export function actionPermitted(state: ExperienceStateName, action: ExperienceActionName): boolean {
  return PERMITTED_ACTIONS[state].includes(action);
}

export function transitionPermitted(from: ExperienceStateName, to: ExperienceStateName): boolean {
  return PERMITTED_TRANSITIONS.some(([a, b]) => a === from && b === to);
}

export interface ExperienceValues {
  readonly payload: string;
  readonly errorCorrectionLevel: string;
  readonly outputFormat: string;
  readonly symbolVersion: number | "auto";
  readonly foregroundColour: string;
  readonly backgroundColour: string;
}

export interface ExportOutcome {
  readonly mediaType: string;
  readonly byteLength: number;
  readonly bytes: Uint8Array;
}

export interface ExperienceModel {
  readonly state: ExperienceStateName;
  readonly values: ExperienceValues;
  readonly optionsDisclosed: boolean;
  readonly artefact: ProducedArtefact | null;
  readonly refusals: readonly JoinRefusal[];
  readonly failure: string | null;
  readonly exported: ExportOutcome | null;
}

export const INITIAL_VALUES: ExperienceValues = {
  payload: "",
  errorCorrectionLevel: "M",
  outputFormat: "svg",
  symbolVersion: "auto",
  foregroundColour: "#111827",
  backgroundColour: "#ffffff",
};

export const INITIAL_MODEL: ExperienceModel = {
  state: "empty", values: INITIAL_VALUES, optionsDisclosed: false,
  artefact: null, refusals: [], failure: null, exported: null,
};

/** An illegal transition is a programming error, not a user-visible state. */
function moveTo(model: ExperienceModel, next: ExperienceStateName): ExperienceStateName {
  if (model.state === next) return next;
  if (!transitionPermitted(model.state, next)) {
    throw new Error(`EXPERIENCE_TRANSITION_FORBIDDEN:${model.state}->${next}`);
  }
  return next;
}

function refusalState(refusal: ProduceRefusal): ExperienceStateName {
  return refusal.kind === "inadmissible" ? "input-invalid" : "failed";
}

export interface ExperienceHost {
  readonly producer: ArtefactProducer;
  /** Hands bytes to the actor. Injected so tests observe delivery. */
  deliver(bytes: Uint8Array, mediaType: string, fileName: string): void;
}

/**
 * Transitions in one place, so no component invents its own. Each returns the
 * next model; the caller renders it.
 */
export function createExperience(host: ExperienceHost) {
  const producing = { token: 0 };

  const produce = async (model: ExperienceModel, values: ExperienceValues): Promise<ExperienceModel> => {
    if (values.payload.length === 0) {
      // Returning to empty from a later state is not a declared transition, so
      // an emptied field is reported as invalid input rather than pretending
      // nothing was ever entered.
      const next = model.state === "empty" ? "empty" : moveTo(model, "input-invalid");
      return {
        ...model, values, state: next, artefact: null, exported: null, failure: null,
        refusals: [{ code: "PAYLOAD_EMPTY", parameter: "payload", detail: "Enter what the code should carry." }],
      };
    }
    const generating: ExperienceModel = {
      ...model, values, state: moveTo(model, "generating"), refusals: [], failure: null, exported: null,
    };
    const token = (producing.token += 1);
    const result = await host.producer.produce({
      payload: values.payload,
      errorCorrectionLevel: values.errorCorrectionLevel,
      outputFormat: values.outputFormat,
      symbolVersion: values.symbolVersion,
      foregroundColour: values.foregroundColour,
      backgroundColour: values.backgroundColour,
    });
    // A superseded production must not overwrite a newer one.
    if (token !== producing.token) return generating;
    if (result.ok) {
      return { ...generating, state: moveTo(generating, "ready"), artefact: result.artefact, refusals: [], failure: null };
    }
    const next = refusalState(result.refusal);
    return {
      ...generating,
      state: moveTo(generating, next),
      artefact: null,
      refusals: result.refusal.kind === "inadmissible" ? result.refusal.refusals : [],
      failure: result.refusal.kind === "inadmissible" ? null : result.refusal.detail,
    };
  };

  return {
    setPayload: (model: ExperienceModel, payload: string): Promise<ExperienceModel> =>
      produce(model, { ...model.values, payload }),

    setErrorCorrection: (model: ExperienceModel, errorCorrectionLevel: string): Promise<ExperienceModel> =>
      produce(model, { ...model.values, errorCorrectionLevel }),

    setOutputFormat: (model: ExperienceModel, outputFormat: string): Promise<ExperienceModel> =>
      produce(model, { ...model.values, outputFormat }),

    setSymbolVersion: (model: ExperienceModel, symbolVersion: number | "auto"): Promise<ExperienceModel> =>
      produce(model, { ...model.values, symbolVersion }),

    setForegroundColour: (model: ExperienceModel, foregroundColour: string): Promise<ExperienceModel> =>
      produce(model, { ...model.values, foregroundColour }),

    toggleOptions: (model: ExperienceModel): ExperienceModel =>
      ({ ...model, optionsDisclosed: !model.optionsDisclosed }),

    dismissFailure: (model: ExperienceModel): ExperienceModel => {
      const next = model.artefact === null ? "input-invalid" : "ready";
      return { ...model, state: moveTo(model, next), failure: null };
    },

    exportArtefact: async (model: ExperienceModel): Promise<ExperienceModel> => {
      if (!actionPermitted(model.state, "export-artefact") || model.artefact === null) {
        throw new Error(`EXPERIENCE_ACTION_FORBIDDEN:export-artefact@${model.state}`);
      }
      const exporting: ExperienceModel = { ...model, state: moveTo(model, "exporting"), failure: null };
      const result = await host.producer.exportArtefact(model.artefact);
      if (!result.ok) {
        return {
          ...exporting, state: moveTo(exporting, "failed"), exported: null,
          failure: result.refusal.kind === "inadmissible"
            ? result.refusal.refusals.map((entry) => entry.detail).join(" ")
            : result.refusal.detail,
        };
      }
      const format = model.artefact.specification.outputFormat as OutputFormat;
      host.deliver(result.bytes, result.mediaType, `anqr-artefact.${format}`);
      return {
        ...exporting, state: moveTo(exporting, "exported"),
        exported: { mediaType: result.mediaType, byteLength: result.byteLength, bytes: result.bytes },
      };
    },
  };
}
