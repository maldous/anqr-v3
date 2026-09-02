import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/analysis/unsafecustomisationdiagnosis.ts";

test("unsafecustomisationdiagnosiscontracts", () => {
  const failingMeasurement: capability.Measurement = {
    measurementId: "m-1",
    reading: 1500,
    limit: 1000,
  };
  const configArtefact: capability.Artefact = {
    kind: capability.ARTEFACT_KIND_CONFIGURATION,
    customisations: [
      { name: "torque", value: "1200" },
      { name: "trim", value: "normal" },
    ],
  };
  const failure = capability.buildFailedAcceptance(
    configArtefact,
    failingMeasurement,
  );

  const diagnosis = capability.diagnoseFailure(failure);

  assert.equal(
    diagnosis.outcome,
    capability.DIAGNOSIS_OUTCOME_ATTRIBUTED,
    "diagnosis should be attributed for a configuration artefact",
  );
  if (diagnosis.outcome !== capability.DIAGNOSIS_OUTCOME_ATTRIBUTED) {
    throw new Error("unreachable: outcome was not attributed");
  }

  assert.equal(
    diagnosis.failingMeasurement.measurementId,
    failingMeasurement.measurementId,
    "the failing measurement must be reported on the diagnosis",
  );

  assert.equal(
    diagnosis.contributions.length,
    1,
    "exactly one excessive customisation should contribute",
  );

  for (const contribution of diagnosis.contributions) {
    assert.equal(
      contribution.measurement.measurementId,
      failingMeasurement.measurementId,
      "each contribution must report the measurement it affected",
    );
  }

  const names = capability.attributedCustomisationNames(diagnosis);
  assert.deepEqual(
    names,
    ["torque"],
    "the contracts require reporting which customisation inputs contributed",
  );
});

test("unsafecustomisationdiagnosiserrormodel", () => {
  const failingMeasurement: capability.Measurement = {
    measurementId: "m-image",
    reading: 2000,
    limit: 1000,
  };
  const imageArtefact: capability.Artefact = {
    kind: capability.ARTEFACT_KIND_IMAGE,
    customisations: [],
  };
  const failure = capability.buildFailedAcceptance(
    imageArtefact,
    failingMeasurement,
  );

  const diagnosis = capability.diagnoseFailure(failure);

  assert.equal(
    diagnosis.outcome,
    capability.DIAGNOSIS_OUTCOME_DECLINED,
    "diagnosis must decline for an image artefact with unknown customisations",
  );
  if (diagnosis.outcome !== capability.DIAGNOSIS_OUTCOME_DECLINED) {
    throw new Error("unreachable: outcome was not declined");
  }
  assert.equal(
    diagnosis.reason,
    "image-customisations-unknown",
    "the decline must carry the image-customisations-unknown reason",
  );
  assert.equal(
    diagnosis.failingMeasurement.measurementId,
    failingMeasurement.measurementId,
    "the failing measurement must still be reported on a decline",
  );
  assert.equal(
    diagnosis.failingMeasurement.reading,
    failingMeasurement.reading,
    "the reported failing measurement must be the one supplied",
  );

  const names = capability.attributedCustomisationNames(diagnosis);
  assert.deepEqual(
    names,
    [],
    "a declined diagnosis must not attribute any customisation name",
  );

  const log: readonly capability.DiagnosisRecord[] = [];
  const result = capability.appendDiagnosis(
    log,
    failure,
    () => true,
  );
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(
      result.record.diagnosis.outcome,
      capability.DIAGNOSIS_OUTCOME_DECLINED,
    );
  }
});

test("unsafecustomisationdiagnosisvalidation", () => {
  const failingMeasurement: capability.Measurement = {
    measurementId: "m-val",
    reading: 2500,
    limit: 1000,
  };
  const planted: capability.CustomisationInput = {
    name: "voltage",
    value: "5000",
  };
  const unrelated: capability.CustomisationInput = {
    name: "color",
    value: "blue",
  };
  const configArtefact: capability.Artefact = {
    kind: capability.ARTEFACT_KIND_CONFIGURATION,
    customisations: [planted, unrelated],
  };
  const failure = capability.buildFailedAcceptance(
    configArtefact,
    failingMeasurement,
  );

  assert.equal(
    capability.isExcessiveCustomisation(planted),
    true,
    "the planted customisation must be recognised as excessive",
  );
  assert.equal(
    capability.isExcessiveCustomisation(unrelated),
    false,
    "the unrelated customisation must not be recognised as excessive",
  );

  const diagnosis = capability.diagnoseFailure(failure);
  assert.equal(
    diagnosis.outcome,
    capability.DIAGNOSIS_OUTCOME_ATTRIBUTED,
  );
  if (diagnosis.outcome !== capability.DIAGNOSIS_OUTCOME_ATTRIBUTED) {
    throw new Error("unreachable: outcome was not attributed");
  }

  const names = capability.attributedCustomisationNames(diagnosis);
  assert.ok(
    names.includes(planted.name),
    "the planted excessive customisation must be attributed",
  );
  assert.ok(
    !names.includes(unrelated.name),
    "the unrelated customisation must not be named",
  );
  assert.equal(
    names.length,
    1,
    "only the planted excessive customisation should be attributed",
  );

  for (const contribution of diagnosis.contributions) {
    assert.equal(
      contribution.customisation.name,
      planted.name,
      "attribution must be to the exact planted customisation",
    );
    assert.equal(
      contribution.measurement.measurementId,
      failingMeasurement.measurementId,
      "the contribution must reference the failing measurement",
    );
  }
});