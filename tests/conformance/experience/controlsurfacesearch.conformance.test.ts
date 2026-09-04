import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/experience/controlsurfacesearch.ts";

const CONTROLS: readonly capability.Control[] = [
  { id: "ec", label: "Error correction level", panel: "Encoding", synonyms: ["redundancy", "ecc"] },
  { id: "fg", label: "Foreground colour", panel: "Styling", synonyms: ["dark", "module colour"] },
  { id: "bg", label: "Background colour", panel: "Styling", synonyms: ["light", "paper"] },
  { id: "anim", label: "Animation pattern", panel: "Animation", synonyms: ["motion"] },
  { id: "quiet", label: "Quiet zone", panel: "Encoding", synonyms: ["margin", "border"] },
];

test("controlsurfacesearchcontracts", () => {
  // What is searchable, and the rule that results are revealed in place.
  assert.deepEqual([...capability.SEARCHABLE_FIELDS], ["label", "panel", "synonyms"]);
  const byLabel = capability.search(CONTROLS, "Foreground");
  assert.equal(byLabel.matched, true);
  if (!byLabel.matched) return;
  assert.equal(byLabel.matches[0]?.revealedInPlace, true);
  assert.equal(byLabel.matches[0]?.panel, "Styling", "a match carries its panel context");
  // A synonym finds the control, and so does a panel name.
  assert.equal(capability.search(CONTROLS, "ecc").matched, true);
  const byPanel = capability.search(CONTROLS, "Styling");
  assert.equal(byPanel.matched && byPanel.matches.length, 2);
  // An empty term matches nothing rather than everything.
  const empty = capability.search(CONTROLS, "   ");
  assert.equal(empty.matched && empty.matches.length, 0);
});

test("controlsurfacesearcherrormodel", () => {
  // A no-match term is stated, not silent.
  const outcome = capability.search(CONTROLS, "zzzz");
  assert.equal(outcome.matched, false);
  if (outcome.matched) return;
  assert.equal(outcome.term, "zzzz");
  assert.match(outcome.detail, /No control matches/u);
  assert.equal(outcome.surfaceIntact, true, "the surface must be left intact, not emptied");
});

test("controlsurfacesearchuisemantics", () => {
  // A revealed control keeps its panel context and its highlight is announced.
  const outcome = capability.search(CONTROLS, "colour");
  assert.equal(outcome.matched, true);
  if (!outcome.matched) return;
  assert.equal(outcome.matches.length, 2);
  for (const match of outcome.matches) {
    assert.equal(match.panel, match.control.panel);
    assert.equal(match.revealedInPlace, true);
    assert.match(match.announcement, new RegExp(match.control.panel, "u"),
      "the announcement must carry the context, not just the label");
    assert.ok(match.highlights.length > 0, "a label match must be highlightable");
    for (const [start, end] of match.highlights) {
      assert.equal(match.control.label.slice(start, end).toLowerCase(), "colour");
    }
  }
  // A synonym match has no label highlight, and says so by carrying none
  // rather than by highlighting the wrong span.
  const bySynonym = capability.search(CONTROLS, "redundancy");
  assert.equal(bySynonym.matched, true);
  if (bySynonym.matched) assert.deepEqual(bySynonym.matches[0]?.highlights, []);
});

test("controlsurfacesearchvalidation", () => {
  // Every declared control is found by its own label.
  assert.deepEqual(capability.everyControlFindable(CONTROLS), []);
  for (const control of CONTROLS) {
    const outcome = capability.search(CONTROLS, control.label);
    assert.equal(outcome.matched, true, `${control.label} must be findable`);
    if (!outcome.matched) continue;
    assert.ok(outcome.matches.some((match) => match.control.id === control.id));
  }
  // Search is case-insensitive, because a user types what they remember.
  assert.equal(capability.search(CONTROLS, "QUIET ZONE").matched, true);
  // And a control absent from the surface is reported, which is what makes the
  // check above meaningful rather than vacuous.
  const missing: capability.Control = { id: "x", label: "", panel: "P", synonyms: [] };
  assert.deepEqual(capability.everyControlFindable([...CONTROLS, missing]), ["x"]);
});
