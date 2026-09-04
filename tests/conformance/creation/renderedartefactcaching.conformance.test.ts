import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/creation/renderedartefactcaching.ts";

const base = { data: "hello", ec: "M", format: "png", size: "512" } as const;

test("renderedartefactcachingcontracts", () => {
  // Which parameters are cache-significant, which are excluded, and why each
  // exclusion is safe.
  assert.ok(capability.CACHE_SIGNIFICANT.includes("data"));
  assert.ok(capability.CACHE_SIGNIFICANT.includes("ec"));
  const excluded = Object.keys(capability.CACHE_EXCLUDED);
  assert.ok(excluded.length > 0);
  for (const name of excluded) {
    assert.ok(!capability.CACHE_SIGNIFICANT.includes(name),
      `${name} cannot be both significant and excluded`);
    assert.ok((capability.CACHE_EXCLUDED[name] ?? "").length > 30,
      `${name} must say why excluding it is safe, not merely that it is`);
  }
  // The key is derived from the significant parameters only.
  assert.equal(capability.cacheKey({ ...base }), capability.cacheKey({ ...base, fname: "x.png" }));
  assert.notEqual(capability.cacheKey({ ...base }), capability.cacheKey({ ...base, ec: "H" }));
});

test("renderedartefactcachingstatemodel", () => {
  // Cache state is derived and disposable; losing it costs time, never correctness.
  const store = new capability.MemoryStore();
  let renders = 0;
  const render = (): string => { renders += 1; return `bytes-${renders}`; };
  const first = capability.serve(store, base, () => "stable-bytes");
  assert.equal(first.hit, false);
  assert.equal(store.size, 1);
  store.discard();
  assert.equal(store.size, 0);
  const afterDiscard = capability.serve(store, base, () => "stable-bytes");
  assert.equal(afterDiscard.hit, false, "a discarded cache costs a render");
  assert.equal(afterDiscard.bytes, first.bytes, "and never costs correctness");
  void render;
});

test("renderedartefactcachingerrormodel", () => {
  // Store unavailability is degradation, not failure, and is not logged per request.
  const store = new capability.MemoryStore();
  store.setAvailable(false);
  const outcomes = [1, 2, 3].map(() => capability.serve(store, base, () => "bytes"));
  for (const outcome of outcomes) {
    assert.equal(outcome.degraded, true);
    assert.equal(outcome.bytes, "bytes", "rendering proceeds uncached rather than failing");
  }
  assert.deepEqual(outcomes.map((o) => o.degradationLogged), [true, false, false],
    "the degradation is recorded once, not per request");
  // Recovery re-arms the notice, so a second outage is not silent.
  store.setAvailable(true);
  capability.serve(store, base, () => "bytes");
  store.setAvailable(false);
  assert.equal(capability.serve(store, base, () => "bytes").degradationLogged, true);
});

test("renderedartefactcachingvalidation", () => {
  // An excluded parameter provably cannot change the rendered bytes: two
  // requests differing only in excluded parameters share a key and a hit.
  const store = new capability.MemoryStore();
  let renders = 0;
  const render = (): string => { renders += 1; return "identical-bytes"; };
  capability.serve(store, base, render);
  assert.equal(renders, 1);
  for (const name of Object.keys(capability.CACHE_EXCLUDED)) {
    const varied = { ...base, [name]: "something-else" };
    assert.equal(capability.sameArtefact(base, varied), true, `${name} must not change the key`);
    const served = capability.serve(store, varied, render);
    assert.equal(served.hit, true, `${name} must produce a hit`);
    assert.equal(served.rendered, false);
  }
  assert.equal(renders, 1, "no excluded parameter caused a re-render");
  // A significant parameter does cause a miss.
  assert.equal(capability.serve(store, { ...base, ec: "H" }, render).hit, false);
  assert.equal(renders, 2);
});
