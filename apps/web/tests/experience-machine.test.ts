import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  actionPermitted, createExperience, INITIAL_MODEL, PERMITTED_ACTIONS, PERMITTED_TRANSITIONS,
  transitionPermitted, type ExperienceModel, type ExperienceStateName,
} from "../src/experience/machine.ts";
import { createProducer } from "../src/composition.ts";
import type { ProducedArtefact } from "../../../packages/artefact/src/application/produce-artefact.ts";

// The experience state machine, and the proof that it equals authority.
//
// The states, permitted actions and transitions are declared in the semantic
// graph. The machine restates them because a delivery component may not import
// assurance tooling, so the restatement is compared here against the projection
// byte for byte. Without this the two could drift and nothing would notice.

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const experience = JSON.parse(
  readFileSync(resolve(repositoryRoot, "packages/architecture/experience.json"), "utf8"),
) as {
  states: readonly { name: string; permits: readonly string[]; withholds: readonly string[] }[];
  transitions: readonly { from: string; to: string }[];
  actions: readonly { name: string }[];
};

test("the implemented states are exactly the declared states", () => {
  const declared = experience.states.map((state) => state.name).sort();
  const implemented = Object.keys(PERMITTED_ACTIONS).sort();
  assert.deepEqual(implemented, declared);
});

test("the implemented permitted actions are exactly the declared ones, per state", () => {
  for (const state of experience.states) {
    const implemented = [...PERMITTED_ACTIONS[state.name as ExperienceStateName]].sort();
    assert.deepEqual(implemented, [...state.permits].sort(), `state ${state.name}`);
  }
});

test("every action the graph declares withheld is genuinely not permitted", () => {
  for (const state of experience.states) {
    for (const withheld of state.withholds) {
      assert.equal(
        actionPermitted(state.name as ExperienceStateName, withheld as never), false,
        `${state.name} must withhold ${withheld}`,
      );
    }
  }
});

test("the implemented transitions are exactly the declared transitions", () => {
  const declared = experience.transitions.map((entry) => `${entry.from}->${entry.to}`).sort();
  const implemented = PERMITTED_TRANSITIONS.map(([from, to]) => `${from}->${to}`).sort();
  assert.deepEqual(implemented, declared);
});

test("an undeclared transition is not permitted", () => {
  // Chosen because it is plausible and absent: returning to empty once
  // something has been entered is deliberately not a declared transition.
  assert.equal(transitionPermitted("ready", "empty"), false);
  assert.equal(transitionPermitted("exported", "empty"), false);
  assert.equal(transitionPermitted("empty", "ready"), false, "production must pass through generating");
});

// ------------------------------------------------------- behaviour of the model

interface Recorder {
  readonly delivered: { bytes: Uint8Array; mediaType: string; fileName: string }[];
}

function host(): { readonly host: Parameters<typeof createExperience>[0]; readonly recorder: Recorder } {
  const recorder: Recorder = { delivered: [] };
  return {
    recorder,
    host: {
      producer: createProducer(),
      deliver: (bytes, mediaType, fileName) => { recorder.delivered.push({ bytes, mediaType, fileName }); },
    },
  };
}

test("entering a payload moves empty to ready through generating, with a real artefact", async () => {
  const { host: h } = host();
  const machine = createExperience(h);
  const model = await machine.setPayload(INITIAL_MODEL, "https://anqr.link/first");
  assert.equal(model.state, "ready");
  assert.ok(model.artefact !== null);
  const artefact = model.artefact as ProducedArtefact;
  // The preview is a real artefact: production decoded its own output.
  assert.equal(artefact.scanSafety.verdict, "scannable");
  assert.equal(artefact.scanSafety.decodedPayload, "https://anqr.link/first");
  assert.ok(artefact.structure.symbolVersion >= 1);
  assert.equal(artefact.frame.pixels.length, artefact.frame.width * artefact.frame.height * 4);
});

test("an empty payload is invalid input rather than a silent reset", async () => {
  const { host: h } = host();
  const machine = createExperience(h);
  const ready = await machine.setPayload(INITIAL_MODEL, "https://anqr.link/x");
  const cleared = await machine.setPayload(ready, "");
  assert.equal(cleared.state, "input-invalid");
  assert.equal(cleared.refusals[0]?.parameter, "payload");
  assert.equal(cleared.artefact, null);
  // The pattern forbids discarding what the actor entered on failure; the
  // values survive so the correction is one keystroke rather than a retype.
  assert.equal(cleared.values.errorCorrectionLevel, ready.values.errorCorrectionLevel);
});

test("export is refused by the machine in every state that withholds it", async () => {
  const { host: h } = host();
  const machine = createExperience(h);
  for (const state of ["empty", "input-invalid", "generating", "failed"] as const) {
    const model: ExperienceModel = { ...INITIAL_MODEL, state };
    await assert.rejects(() => machine.exportArtefact(model), /EXPERIENCE_ACTION_FORBIDDEN:export-artefact/);
  }
});

test("exporting from ready delivers real container bytes and reaches exported", async () => {
  const { host: h, recorder } = host();
  const machine = createExperience(h);
  const ready = await machine.setPayload(INITIAL_MODEL, "https://anqr.link/export");
  const exported = await machine.exportArtefact(ready);
  assert.equal(exported.state, "exported");
  assert.equal(recorder.delivered.length, 1);
  const delivered = recorder.delivered[0];
  assert.equal(delivered?.mediaType, "image/svg+xml");
  assert.equal(delivered?.fileName, "anqr-artefact.svg");
  assert.ok((delivered?.bytes.length ?? 0) > 0);
  assert.equal(exported.exported?.byteLength, delivered?.bytes.length);
  // The bytes are a real container, not a placeholder.
  assert.match(new TextDecoder().decode(delivered?.bytes as Uint8Array), /^<svg xmlns=/);
});

test("changing the format changes the container the export delivers", async () => {
  const { host: h, recorder } = host();
  const machine = createExperience(h);
  let model = await machine.setPayload(INITIAL_MODEL, "https://anqr.link/format");
  model = await machine.setOutputFormat(model, "png");
  assert.equal(model.state, "ready");
  model = await machine.exportArtefact(model);
  assert.equal(recorder.delivered[0]?.mediaType, "image/png");
  assert.deepEqual([...(recorder.delivered[0]?.bytes.subarray(0, 4) ?? [])], [0x89, 0x50, 0x4e, 0x47]);
});

test("an inadmissible option lands in input-invalid and names the parameter to change", async () => {
  const { host: h } = host();
  const machine = createExperience(h);
  let model = await machine.setPayload(INITIAL_MODEL, "x".repeat(200));
  assert.equal(model.state, "ready");
  // Version 1 cannot hold two hundred characters at any level.
  model = await machine.setSymbolVersion(model, 1);
  assert.equal(model.state, "input-invalid");
  assert.equal(model.refusals[0]?.parameter, "symbolVersion");
  assert.equal(model.refusals[0]?.code, "SYMBOL_VERSION_TOO_SMALL_FOR_PAYLOAD");
  assert.equal(model.artefact, null, "an inadmissible specification must not leave a stale artefact behind");
});

test("a contrast failure is refused before anything is produced", async () => {
  const { host: h } = host();
  const machine = createExperience(h);
  let model = await machine.setPayload(INITIAL_MODEL, "https://anqr.link/contrast");
  model = await machine.setForegroundColour(model, "#fefefe");
  assert.equal(model.state, "input-invalid");
  assert.equal(model.refusals[0]?.code, "CONTRAST_BELOW_FLOOR");
  assert.equal(model.artefact, null);
});

test("dismissing a failure keeps the actor's input", async () => {
  const { host: h } = host();
  const machine = createExperience(h);
  const invalid = await machine.setPayload(INITIAL_MODEL, "");
  const dismissed = machine.dismissFailure(invalid);
  assert.equal(dismissed.values.payload, "");
  assert.equal(dismissed.state, "input-invalid");
});

test("toggling options changes only disclosure, never the state", async () => {
  const { host: h } = host();
  const machine = createExperience(h);
  const ready = await machine.setPayload(INITIAL_MODEL, "https://anqr.link/toggle");
  const toggled = machine.toggleOptions(ready);
  assert.equal(toggled.optionsDisclosed, true);
  assert.equal(toggled.state, "ready");
  assert.equal(machine.toggleOptions(toggled).optionsDisclosed, false);
});
