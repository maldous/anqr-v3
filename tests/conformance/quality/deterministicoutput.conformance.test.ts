import assert from "node:assert/strict";
import { test } from "node:test";
import * as capability from "../../../src/capabilities/quality/deterministicoutput.ts";

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

test("byte identity rejects distinct outputs with the same checksum", () => {
  const artwork: capability.ArtworkSpecification = {
    colors: ["#000000"],
    dimensions: [1, 1],
    style: "test",
  };
  // Fixed seeds found once: different 1,024-byte sequences collide under FNV-1a.
  const result = capability.validateByteIdenticalOutput([
    capability.createDeterministicRequest(artwork, 58813),
    capability.createDeterministicRequest(artwork, 130364),
  ]);

  assert.equal(result.outputs.length, 2);
  const [first, second] = result.outputs;
  assert.equal(first.bytes.length, 1024);
  assert.equal(second.bytes.length, 1024);
  assert.equal(first.checksum, "7930afb9");
  assert.equal(second.checksum, first.checksum);
  assert.notDeepEqual(first.bytes, second.bytes);
  assert.equal(result.identical, false);
});

test("byte identity handles empty, equal and ordinarily different outputs", () => {
  const artwork: capability.ArtworkSpecification = {
    colors: ["#000000"],
    dimensions: [1, 1],
    style: "test",
  };
  const first = capability.createDeterministicRequest(artwork, 1);
  const second = capability.createDeterministicRequest(artwork, 2);

  assert.deepEqual(capability.validateByteIdenticalOutput([]), {
    identical: true,
    outputs: [],
  });
  assert.equal(capability.validateByteIdenticalOutput([first]).identical, true);
  const equal = capability.validateByteIdenticalOutput([first, first]);
  assert.equal(equal.identical, true);
  assert.deepEqual(equal.outputs[0].bytes, equal.outputs[1].bytes);

  const different = capability.validateByteIdenticalOutput([first, second, first]);
  assert.equal(different.identical, false);
  assert.equal(different.outputs.length, 3);
  assert.notDeepEqual(different.outputs[0].bytes, different.outputs[1].bytes);
  assert.deepEqual(different.outputs[0].bytes, different.outputs[2].bytes);
});
