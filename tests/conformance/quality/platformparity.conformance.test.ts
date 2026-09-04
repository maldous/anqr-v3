import assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/quality/platformparity.ts";

test("architecturesurfaceparity", () => {
  // Positive case: one specification, realised on every declared surface,
  // yields byte-identical artefacts, identical refusal reasons and an
  // identical scan verdict.
  const specification: capability.ArtefactSpecification = {
    name: "menu-artefact",
    mediaType: "text/plain",
    payload: "https://paperly.example/menu\r\nline two",
  };

  const realisations = capability.realiseOnAllSurfaces(specification);
  assert.equal(realisations.length, capability.DELIVERY_SURFACES.length);
  const reference = realisations[0];
  assert.ok(reference !== undefined);
  for (const realisation of realisations) {
    assert.deepEqual(realisation.artefactBytes, reference.artefactBytes);
    assert.equal(
      capability.digestOf(realisation.artefactBytes),
      capability.digestOf(reference.artefactBytes),
    );
    assert.deepEqual(realisation.refusalReasons, reference.refusalReasons);
    assert.equal(realisation.scanVerdict, reference.scanVerdict);
  }

  const report = capability.confirmSurfaceParity(specification);
  assert.ok(report.verdict === "parity");
  assert.equal(report.digest, capability.digestOf(capability.artefactBytesFor(specification)));
  assert.deepEqual(report.refusalReasons, []);
  assert.equal(report.scanVerdict, "safe");
  assert.deepEqual([...report.surfaces].sort(), [...capability.DELIVERY_SURFACES].sort());

  // A refused specification must be refused for the same reasons, in the same
  // canonical order, with the same verdict, on every surface.
  const refusedSpecification: capability.ArtefactSpecification = {
    name: "Not Portable",
    mediaType: "undeclared",
    payload: "",
  };
  for (const realisation of capability.realiseOnAllSurfaces(refusedSpecification)) {
    assert.deepEqual(realisation.refusalReasons, [
      "empty-payload",
      "name-not-portable",
      "media-type-undeclared",
    ]);
    assert.equal(realisation.scanVerdict, "unscannable");
  }
  const refusedReport = capability.confirmSurfaceParity(refusedSpecification);
  assert.ok(refusedReport.verdict === "parity");
  assert.deepEqual(refusedReport.refusalReasons, [
    "empty-payload",
    "name-not-portable",
    "media-type-undeclared",
  ]);
  assert.equal(refusedReport.scanVerdict, "unscannable");

  // Negative case, fail closed: a surface that emits different bytes and a
  // different scan verdict must be denied parity by the audit.
  const driftedSpecification: capability.ArtefactSpecification = {
    name: "menu-artefact",
    mediaType: "text/plain",
    payload: "javascript:alert(1)",
  };
  const drifted: readonly capability.SurfaceRealisation[] = realisations.map(
    (realisation): capability.SurfaceRealisation =>
      realisation.surface === "wasm32-edge"
        ? {
            ...realisation,
            artefactBytes: capability.artefactBytesFor(driftedSpecification),
            refusalReasons: [],
            scanVerdict: "unsafe",
          }
        : realisation,
  );
  const driftedReport = capability.auditParity(drifted);
  assert.ok(driftedReport.verdict === "divergent");
  assert.ok(
    driftedReport.divergences.some(
      (divergence) =>
        divergence.kind === "artefact-bytes-differ" && divergence.surface === "wasm32-edge",
    ),
  );
  assert.ok(
    driftedReport.divergences.some(
      (divergence) =>
        divergence.kind === "scan-verdict-differs" && divergence.surface === "wasm32-edge",
    ),
  );

  // Negative case, fail closed: a surface that realised nothing at all must
  // also be denied parity rather than silently ignored.
  const missingReport = capability.auditParity(
    realisations.filter((realisation) => realisation.surface !== "linux-arm64"),
  );
  assert.ok(missingReport.verdict === "divergent");
  assert.ok(
    missingReport.divergences.some(
      (divergence) =>
        divergence.kind === "surface-unrealised" && divergence.surface === "linux-arm64",
    ),
  );
});