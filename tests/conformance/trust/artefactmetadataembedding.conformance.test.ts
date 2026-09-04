import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/trust/artefactmetadataembedding.ts";

test("artefactmetadataembeddingcontracts", () => {
  // The set of metadata fields, their types and which containers carry each.
  assert.equal(capability.FIELDS.length, 8);
  assert.deepEqual([...capability.CONTAINERS], ["png", "svg", "gif"]);
  for (const field of capability.FIELDS) {
    assert.ok(field.carriedBy.length > 0, `${field.name} must be carried by something`);
    for (const container of field.carriedBy) {
      assert.ok(capability.CONTAINERS.includes(container));
    }
  }
  // The containers genuinely differ, which is why refusal exists at all.
  assert.equal(capability.canCarry("png", "pixelsPerMetre"), true);
  assert.equal(capability.canCarry("svg", "pixelsPerMetre"), false);
  assert.equal(capability.canCarry("gif", "custom"), false);
  assert.deepEqual(capability.droppedBy("png"), []);
  assert.ok(capability.droppedBy("gif").length > 0);
});

test("artefactmetadataembeddingerrormodel", () => {
  // A container that cannot carry a declared field refuses with the field and
  // the container named — rather than silently discarding it.
  const outcome = capability.embed("gif", { title: "t", custom: { a: "b" } });
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.field, "custom");
  assert.equal(outcome.container, "gif");
  assert.match(outcome.detail, /gif/u);
  assert.match(outcome.detail, /custom/u);
  // The same metadata in a container that can carry it succeeds.
  assert.equal(capability.embed("png", { title: "t", custom: { a: "b" } }).ok, true);
});

test("artefactmetadataembeddinguisemantics", () => {
  // Metadata entry is a disclosed section, not a default-visible one, and it
  // states which fields the chosen container will keep.
  assert.equal(capability.UI_SECTION.role, "disclosure");
  assert.equal(capability.UI_SECTION.defaultExpanded, false);
  assert.equal(capability.UI_SECTION.statesKeptFields, true);
  const keptByPng = capability.keptBy("png");
  const keptByGif = capability.keptBy("gif");
  assert.ok(keptByPng.length > keptByGif.length,
    "the kept set must genuinely depend on the container, or stating it is theatre");
  for (const container of capability.CONTAINERS) {
    assert.equal(capability.keptBy(container).length + capability.droppedBy(container).length,
      capability.FIELDS.length, "every field is either kept or dropped, never unaccounted");
  }
});

test("artefactmetadataembeddingvalidation", () => {
  // Produced files are re-read and every declared value is recovered.
  const metadata: capability.Metadata = {
    title: "Venue entrance",
    description: "Scan for directions",
    author: "A Person",
    copyright: "2026",
    licence: "CC-BY-4.0",
    creationTime: 1_700_000_000_000,
    custom: { campaign: "spring", ref: "42" },
    pixelsPerMetre: 11811,
  };
  const outcome = capability.embed("png", metadata);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const read = capability.extract(outcome.records);
  assert.equal(read.title, "Venue entrance");
  assert.equal(read.author, "A Person");
  assert.equal(read.pixelsPerMetre, "11811");
  assert.equal(read.creationTime, new Date(1_700_000_000_000).toISOString());
  // Structured pairs survive as an ordered, recoverable encoding.
  assert.equal(read.custom, "campaign=spring;ref=42");
  assert.equal(capability.verifyRoundTrip("png", metadata), true);
  // And a container that would drop a field never claims a round trip.
  assert.equal(capability.verifyRoundTrip("gif", metadata), false);
});
