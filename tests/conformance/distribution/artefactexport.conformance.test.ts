import { test } from "node:test";
import assert from "node:assert/strict";
import * as capability from "../../../src/capabilities/distribution/artefactexport.ts";

test("artefactexportcontracts", () => {
  const artefact: capability.Artefact = {
    id: "art-1",
    payload: "hello world",
    availableFormats: ["json"],
    availableGeometries: ["flat"],
  };

  const outcome = capability.exportArtefact(artefact, "json", "flat");

  assert.equal(outcome.status, "success");
  if (outcome.status === "success") {
    assert.equal(outcome.format, "json");
    assert.equal(outcome.geometry, "flat");
    assert.equal(outcome.decodedPayload, artefact.payload);
    assert.equal(typeof outcome.file, "string");
    assert.ok(outcome.file.length > 0);
  }
});

test("artefactexporterrormodel", () => {
  const artefact: capability.Artefact = {
    id: "art-2",
    payload: "data",
    availableFormats: ["json"],
    availableGeometries: ["flat"],
  };

  const outcome = capability.exportArtefact(artefact, "xml", "flat");

  assert.equal(outcome.status, "failure");
  if (outcome.status === "failure") {
    assert.equal(outcome.reason, "format_incompatible");
    assert.equal(outcome.requestedFormat, "xml");
    assert.equal(outcome.requestedGeometry, "flat");
    assert.ok(outcome.message.includes("format_incompatible"));
    assert.ok(outcome.message.includes("xml"));
  }
  assert.ok(!("file" in outcome));
});

test("artefactexportuisemantics", () => {
  const artefact: capability.Artefact = {
    id: "art-3",
    payload: "content",
    availableFormats: ["json", "csv"],
    availableGeometries: ["flat", "nested"],
  };

  const availableFormats = capability.getAvailableFormats(artefact);
  const availableGeometries = capability.getAvailableGeometries(artefact);

  assert.deepEqual(availableFormats, ["json", "csv"]);
  assert.deepEqual(availableGeometries, ["flat", "nested"]);

  assert.equal(capability.isFormatCompatible(artefact, "xml"), false);
  assert.equal(capability.isGeometryCompatible(artefact, "tabular"), false);
  assert.equal(capability.isFormatCompatible(artefact, "json"), true);
  assert.equal(capability.isGeometryCompatible(artefact, "nested"), true);
});

test("artefactexportvalidation", () => {
  const artefact: capability.Artefact = {
    id: "art-4",
    payload: "round-trip check",
    availableFormats: ["json", "xml", "csv"],
    availableGeometries: ["flat", "nested", "tabular"],
  };

  for (const format of artefact.availableFormats) {
    for (const geometry of artefact.availableGeometries) {
      const valid = capability.validateExportRoundTrip(artefact, format, geometry);
      assert.equal(valid, true, `Round trip failed for ${format}/${geometry}`);
    }
  }
});