import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/analysis/deviceimagecapture.ts";

const ok: capability.Environment = { secureContext: true, cameraPresent: true, permissionGranted: true };
const frame = (width: number, height: number): capability.Frame => ({ width, height, content: "pixels" });

test("deviceimagecapturecontracts", () => {
  // The capture contract, the downscale bound and the three refusal causes.
  assert.ok(capability.DOWNSCALE_MAX_EDGE > 0);
  assert.deepEqual([...capability.REFUSAL_CAUSES],
    ["permission-denied", "no-device", "insecure-context"]);
  for (const cause of capability.REFUSAL_CAUSES) {
    assert.ok((capability.REFUSAL_DETAIL[cause] ?? "").length > 20, `${cause} must state its detail`);
  }
  assert.ok(capability.ALTERNATIVE_ROUTES.length >= 2, "camera cannot be the only input route");
  // The downscale bound is applied to the longest edge, preserving aspect ratio.
  const reduced = capability.downscale(frame(4_000, 2_000));
  assert.equal(Math.max(reduced.width, reduced.height), capability.DOWNSCALE_MAX_EDGE);
  assert.equal(reduced.width / reduced.height, 2);
  // A frame already inside the bound is untouched.
  assert.deepEqual(capability.downscale(frame(640, 480)), frame(640, 480));
});

test("deviceimagecaptureerrormodel", () => {
  // Permission, device and context refusals are separately identifiable.
  const cases: readonly (readonly [capability.Environment, capability.RefusalCause])[] = [
    [{ ...ok, secureContext: false }, "insecure-context"],
    [{ ...ok, cameraPresent: false }, "no-device"],
    [{ ...ok, permissionGranted: false }, "permission-denied"],
  ];
  const details = new Set<string>();
  for (const [environment, cause] of cases) {
    const outcome = capability.capture(environment, () => frame(100, 100));
    assert.equal(outcome.ok, false);
    if (outcome.ok) continue;
    assert.equal(outcome.cause, cause);
    details.add(outcome.detail);
    assert.deepEqual([...outcome.alternativeRoutes], [...capability.ALTERNATIVE_ROUTES],
      "the other input routes stay available after any camera refusal");
  }
  assert.equal(details.size, 3, "the three causes must read differently");
  // An insecure context is reported even when permission is also missing: the
  // user cannot fix permission from an insecure origin.
  const both = capability.capture({ secureContext: false, cameraPresent: true, permissionGranted: false }, () => frame(1, 1));
  assert.equal(both.ok, false);
  if (!both.ok) assert.equal(both.cause, "insecure-context");
});

test("deviceimagecapturepermissions", () => {
  // A captured frame is not transmitted and is not retained after use.
  const outcome = capability.capture(ok, () => frame(2_000, 1_000));
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.transmitted, false);
  const session = new capability.CaptureSession();
  const decoded = session.use(outcome, (captured) => captured.content);
  assert.equal(decoded, "pixels");
  assert.equal(session.retained, null, "the frame must not survive its use");
  // Even when the consumer throws, nothing is retained.
  assert.throws(() => session.use(outcome, () => { throw new Error("decode failed"); }));
  assert.equal(session.retained, null);
});

test("deviceimagecapturevalidation", () => {
  // Each refusal cause is exercised and reported distinguishably, and a good
  // capture downscales.
  const seen = new Set<capability.RefusalCause>();
  for (const environment of [
    { ...ok, secureContext: false },
    { ...ok, cameraPresent: false },
    { ...ok, permissionGranted: false },
  ]) {
    const outcome = capability.capture(environment, () => frame(100, 100));
    if (!outcome.ok) seen.add(outcome.cause);
  }
  assert.equal(seen.size, capability.REFUSAL_CAUSES.length);
  const captured = capability.capture(ok, () => frame(3_000, 3_000));
  assert.equal(captured.ok, true);
  if (!captured.ok) return;
  assert.equal(captured.downscaled, true);
  assert.equal(captured.frame.width, capability.DOWNSCALE_MAX_EDGE);
  const small = capability.capture(ok, () => frame(320, 240));
  assert.equal(small.ok && small.downscaled, false);
});
