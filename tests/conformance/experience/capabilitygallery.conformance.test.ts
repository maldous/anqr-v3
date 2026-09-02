import assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/experience/capabilitygallery.ts";

test("capabilitygallerycontracts", () => {
  const artefact = capability.createGalleryArtefact("payload");
  const config = capability.createGalleryConfiguration("template", [{ key: "a", value: "b" }]);
  const entry = capability.createGalleryEntry("id1", artefact, config, "gallery");
  assert.ok(entry.artefact);
  assert.ok(entry.configuration);
  assert.ok(entry.capability);
  assert.strictEqual(entry.id, "id1");
  assert.strictEqual(entry.capability, "gallery");
  assert.deepStrictEqual(entry.artefact, artefact);
  assert.deepStrictEqual(entry.configuration, config);
});

test("capabilitygalleryproof", () => {
  const config = capability.createGalleryConfiguration("tmpl", [{ key: "x", value: "y" }]);
  const rendered = capability.renderFromConfiguration(config);
  const entry = capability.createGalleryEntry("e1", rendered, config);
  const result = capability.validateGalleryEntry(entry);
  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.entry, entry);
  } else {
    throw new Error("Expected validation success");
  }

  const wrongArtefact = capability.createGalleryArtefact("wrong");
  const badEntry = capability.createGalleryEntry("e2", wrongArtefact, config);
  const badResult = capability.validateGalleryEntry(badEntry);
  assert.strictEqual(badResult.success, false);
  if (!badResult.success) {
    assert.strictEqual(badResult.code, "REGENERATION_MISMATCH");
  }
});

test("capabilitygalleryuisemantics", () => {
  const config = capability.createGalleryConfiguration("tmpl", [{ key: "k", value: "v" }]);
  const rendered = capability.renderFromConfiguration(config);
  const entry = capability.createGalleryEntry("e3", rendered, config);
  const loaded = capability.loadConfigurationFromEntry(entry);
  assert.deepStrictEqual(loaded, config);
  assert.notStrictEqual(loaded, entry.configuration);
  const wrongArtefact = capability.createGalleryArtefact("wrong");
  const badEntry = capability.createGalleryEntry("e4", wrongArtefact, config);
  assert.throws(() => capability.loadConfigurationFromEntry(badEntry), /Cannot load invalid gallery entry/);
});

test("capabilitygalleryvalidation", () => {
  const config = capability.createGalleryConfiguration("tmpl", [{ key: "a", value: "b" }]);
  const rendered = capability.renderFromConfiguration(config);
  const entry = capability.createGalleryEntry("e6", rendered, config);
  const result = capability.validateGalleryEntry(entry);
  assert.strictEqual(result.success, true);
  if (!result.success) throw new Error("Expected success");

  const wrongArtefact = capability.createGalleryArtefact("different");
  const badEntry = capability.createGalleryEntry("e7", wrongArtefact, config);
  const badResult = capability.validateGalleryEntry(badEntry);
  assert.strictEqual(badResult.success, false);
  if (!badResult.success) {
    assert.strictEqual(badResult.code, "REGENERATION_MISMATCH");
  }
});