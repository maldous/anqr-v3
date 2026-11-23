import assert from "node:assert/strict";
import test from "node:test";

import { createArtefactProducer } from "../src/application/produce-artefact.ts";

for (const phase of ["surface", "fill", "fillRect", "pixels", "clock"] as const) {
  test(`producer returns a production refusal when the ${phase} port fails`, async () => {
    const fail = (stage: typeof phase): void => {
      if (phase === stage) {
        if (phase === "clock") throw "clock unavailable";
        throw new Error(`${phase} unavailable`);
      }
    };
    const producer = createArtefactProducer({
      containerFor: () => assert.fail("producing a frame must not select an export container"),
      surfaceFor: (width, height) => {
        fail("surface");
        return {
          width,
          height,
          fill: () => fail("fill"),
          fillRect: () => fail("fillRect"),
          pixels: () => {
            fail("pixels");
            return new Uint8Array(width * height * 4);
          },
        };
      },
      clock: {
        nowMs: () => {
          fail("clock");
          return 123;
        },
      },
    });

    assert.deepEqual(
      await producer.produce({ payload: "Synthetic café test", outputFormat: "png", errorCorrectionLevel: "M" }),
      { ok: false, refusal: { kind: "production-failed", detail: `${phase} unavailable` } },
    );
  });
}

for (const [label, reason] of [
  ["a null-prototype object", Object.create(null)],
  ["an Error with a throwing message getter", Object.defineProperty(new Error(), "message", {
    get() { throw new Error("message unavailable"); },
  })],
] as const) {
  test(`producer contains an unprintable renderer exception: ${label}`, async () => {
    const producer = createArtefactProducer({
      containerFor: () => assert.fail("producing a frame must not select an export container"),
      surfaceFor: () => { throw reason; },
      clock: { nowMs: () => assert.fail("a refused render must not read the clock") },
    });

    assert.deepEqual(
      await producer.produce({ payload: "Synthetic café test", outputFormat: "png", errorCorrectionLevel: "M" }),
      { ok: false, refusal: { kind: "production-failed", detail: "Unable to describe production failure" } },
    );
  });
}
