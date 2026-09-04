import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/creation/asynchronousrendering.ts";

const quick: capability.RenderRequest = { identity: "quick", projectedMs: 100 };
const slow: capability.RenderRequest = { identity: "slow", projectedMs: 30_000 };

test("asynchronousrenderingcontracts", () => {
  // The synchronous bound, the placeholder response, and the retrieval identity.
  assert.ok(capability.SYNCHRONOUS_BOUND_MS > 0);
  assert.ok(capability.JOB_BOUND_MS > capability.SYNCHRONOUS_BOUND_MS);
  assert.equal(capability.exceedsSynchronousBound(quick), false);
  assert.equal(capability.exceedsSynchronousBound(slow), true);
  const runtime = new capability.BackgroundRuntime();
  const response = capability.respond(runtime, slow, () => "never");
  assert.equal(response.kind, "placeholder");
  assert.equal(response.isPlaceholder, true, "a placeholder must be distinguishable by the caller");
  assert.equal(response.identity, slow.identity, "retrieval is by the request's own identity");
});

test("asynchronousrenderingerrormodel", () => {
  // A failed or over-bound job is reported rather than leaving a permanent placeholder.
  const runtime = new capability.BackgroundRuntime();
  capability.respond(runtime, slow, () => "never");
  runtime.run(slow.identity, 1_000, () => { throw new Error("encoder failed"); });
  const failed = runtime.retrieve(slow.identity);
  assert.equal(failed?.kind, "failure");
  if (failed?.kind !== "failure") return;
  assert.equal(failed.state, "failed");
  assert.match(failed.detail, /encoder failed/u);

  const other = new capability.BackgroundRuntime();
  const overBound: capability.RenderRequest = { identity: "over", projectedMs: 30_000 };
  capability.respond(other, overBound, () => "never");
  other.run(overBound.identity, capability.JOB_BOUND_MS + 1, () => "late");
  const abandoned = other.retrieve(overBound.identity);
  assert.equal(abandoned?.kind, "failure");
  if (abandoned?.kind !== "failure") return;
  assert.equal(abandoned.state, "abandoned");
});

test("asynchronousrenderingreadinessmodel", () => {
  // The background runtime's presence is observable independently of the
  // synchronous route: the synchronous route answers either way.
  const runtime = new capability.BackgroundRuntime();
  assert.equal(runtime.present, true);
  runtime.setPresent(false);
  assert.equal(runtime.present, false);
  const response = capability.respond(runtime, slow, () => "never");
  assert.equal(response.kind, "placeholder", "the synchronous route still answers");
  assert.equal(runtime.state(slow.identity), null,
    "but nothing was queued, which is what makes the absence observable");
  // A quick request is unaffected by the background runtime being absent.
  assert.equal(capability.respond(runtime, quick, () => "bytes").kind, "artefact");
});

test("asynchronousrenderingvalidation", () => {
  // A request over the bound is answered promptly, and the artefact appears afterwards.
  const runtime = new capability.BackgroundRuntime();
  let synchronousWork = 0;
  const response = capability.respond(runtime, slow, () => { synchronousWork += 1; return "bytes"; });
  assert.equal(response.isPlaceholder, true);
  assert.equal(synchronousWork, 0, "the synchronous route must not block on the slow render");
  assert.equal(runtime.retrieve(slow.identity), null, "nothing to retrieve yet");
  runtime.run(slow.identity, 5_000, () => "animated-bytes");
  const finished = runtime.retrieve(slow.identity);
  assert.equal(finished?.kind, "artefact");
  if (finished?.kind !== "artefact") return;
  assert.equal(finished.isPlaceholder, false);
  assert.equal(finished.bytes, "animated-bytes");
  // A request under the bound never involves the background runtime at all.
  const immediate = capability.respond(runtime, quick, () => "png");
  assert.equal(immediate.kind, "artefact");
});
