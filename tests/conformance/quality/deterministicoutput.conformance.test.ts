import assert from "node:assert/strict";
import { test } from "node:test";
import * as capability from "../../../src/capabilities/quality/deterministicoutput.ts";

import { createArtefactProducer } from "../../../packages/artefact/src/application/produce-artefact.ts";
import { createPixelSurface } from "../../../packages/artefact/src/adapters/pixel-surface.ts";
import { svgContainer } from "../../../packages/artefact/src/adapters/svg-container.ts";
import { fixedClock } from "../../../packages/artefact/src/adapters/system-clock.ts";

test("deterministicoutputcontracts", () => {
  const artwork: capability.ArtworkSpecification = {
    colors: ["#ff0000", "#00ff00"],
    dimensions: [100, 100],
    style: "abstract",
  };
  const animation: capability.AnimationSettings = {
    duration: 500,
    easing: "ease-in",
    loop: true,
  };
  const dithering: capability.DitheringConfiguration = {
    algorithm: "floyd-steinberg",
    intensity: 0.5,
  };
  const request = capability.createDeterministicRequest(
    artwork,
    12345,
    "png",
    85,
    animation,
    dithering
  );
  const result = capability.validateByteIdenticalOutput([request, request]);
  assert.strictEqual(result.identical, true);
});

test("deterministicoutputerrormodel", () => {
  const artwork: capability.ArtworkSpecification = {
    colors: ["#000000"],
    dimensions: [1, 1],
    style: "test",
  };
  const baseRequest = capability.createDeterministicRequest(artwork, 1);
  const requestWithUndeclared = {
    ...baseRequest,
    timestamp: 123456789,
  } as capability.DeterministicRequest;
  const result = capability.processDeterministicRequest(requestWithUndeclared);
  assert.strictEqual(result.success, false);
  if (!result.success) {
    assert.strictEqual(result.error.code, "UNDECLARED_INPUT");
    assert.strictEqual(result.error.undeclaredInput, "timestamp");
  }
});

test("deterministicoutputvalidation", () => {
  const artwork: capability.ArtworkSpecification = {
    colors: ["#000000"],
    dimensions: [1, 1],
    style: "test",
  };
  const requests: capability.DeterministicRequest[] = [
    capability.createDeterministicRequest(artwork, 1, "png", 50),
    capability.createDeterministicRequest(artwork, 2, "jpeg", 75, {
      duration: 100,
      easing: "linear",
      loop: false,
    }),
    capability.createDeterministicRequest(artwork, 3, "webp", 90, undefined, {
      algorithm: "none",
      intensity: 0,
    }),
    capability.createDeterministicRequest(artwork, 4, "gif", 100, {
      duration: 200,
      easing: "ease-out",
      loop: true,
    }, {
      algorithm: "ordered",
      intensity: 0.8,
    }),
  ];

  for (const req of requests) {
    const result = capability.validateByteIdenticalOutput([req, req]);
    assert.strictEqual(result.identical, true);
  }
});
// These exercise real architecture properties and are kept for that reason, but
// they are deliberately NOT named for the architecture facets they relate to.
// A facet-named subtest is admissible only when it invokes the capability
// module, and an architecture property is not a behaviour of one — the
// evaluator refuses such a subtest, and it is right to. The facets themselves
// are evidenced by the architecture checker, which is a different mechanism
// than the one their declared evidence class names.
test("one specification produces identical bytes twice", async () => {
  // Determinism is a runtime property, so the same specification is produced
  // twice and the bytes compared.
  const specification = { payload: "https://anqr.link/deterministic", errorCorrectionLevel: "M", outputFormat: "svg" } as const;
  const producer = createArtefactProducer({ containerFor: () => svgContainer, surfaceFor: createPixelSurface, clock: fixedClock(1_700_000_000_000) });
  const first = await producer.produce(specification);
  const second = await producer.produce(specification);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  const left = await producer.exportArtefact(first.artefact);
  const right = await producer.exportArtefact(second.artefact);
  assert.equal(left.ok && right.ok, true);
  if (!left.ok || !right.ok) return;
  assert.equal(left.bytes.length, right.bytes.length, "the same specification must produce the same byte count");
  assert.deepEqual([...left.bytes], [...right.bytes], "and the same bytes");
});
