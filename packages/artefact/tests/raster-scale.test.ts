import assert from "node:assert/strict";
import test from "node:test";

import { pngContainer, pngRasterSurface } from "../src/adapters/png-container.ts";
import { pngImageSource } from "../src/adapters/png-image-source.ts";
import { createArtefactProducer } from "../src/application/produce-artefact.ts";
import { decodeSymbol } from "../src/qr/decode.ts";
import { symbolSize } from "../src/qr/spec.ts";

test("integer PNG rerender preserves modules and quiet zone for an existing QR fixture", async () => {
  // Known geometry and the package's decoder, not an optical/device scan.
  const payload = "https://anqr.link/output-boundary";
  const quiet = 4;
  const factor = 3;
  const producer = createArtefactProducer({
    containerFor: () => pngContainer,
    surfaceFor: pngRasterSurface,
    clock: { nowMs: () => 0 },
  });

  async function render(moduleSizePx: number) {
    const produced = await producer.produce({
      payload,
      outputFormat: "png",
      errorCorrectionLevel: "H",
      foregroundColour: "#000000",
      backgroundColour: "#ffffff",
      moduleSizePx,
      quietZoneModules: quiet,
    });
    assert.ok(produced.ok);
    const exported = await producer.exportArtefact(produced.artefact);
    assert.ok(exported.ok);
    const decoded = await pngImageSource.decode(exported.bytes, exported.mediaType);
    assert.ok(decoded.ok);
    return { structure: produced.artefact.structure, image: decoded.image };
  }

  const original = await render(2);
  const resized = await render(2 * factor);
  const modules = symbolSize(original.structure.symbolVersion);
  const side = (modules + 2 * quiet) * 2;
  assert.equal(original.image.width, side);
  assert.equal(original.image.height, side);
  assert.equal(resized.image.width, side * factor);
  assert.equal(resized.image.height, side * factor);
  assert.equal(resized.structure.symbolVersion, original.structure.symbolVersion);
  assert.equal(resized.structure.maskPattern, original.structure.maskPattern);
  assert.equal(resized.structure.errorCorrectionLevel, original.structure.errorCorrectionLevel);

  const actual = resized.image.pixels;
  const expected = new Uint8Array(actual.length);
  for (let y = 0; y < resized.image.height; y += 1) {
    for (let x = 0; x < resized.image.width; x += 1) {
      const from = (Math.floor(y / factor) * side + Math.floor(x / factor)) * 4;
      const to = (y * resized.image.width + x) * 4;
      expected.set(original.image.pixels.subarray(from, from + 4), to);
      if (x < quiet * 6 || y < quiet * 6 ||
          x >= resized.image.width - quiet * 6 || y >= resized.image.height - quiet * 6) {
        assert.equal(actual[to], 255);
        assert.equal(actual[to + 1], 255);
        assert.equal(actual[to + 2], 255);
        assert.equal(actual[to + 3], 255);
      }
    }
  }
  assert.deepEqual(actual, expected, "the rerender must preserve every expanded RGBA sample");

  const sampled = new Uint8Array(modules * modules);
  for (let y = 0; y < modules; y += 1) {
    for (let x = 0; x < modules; x += 1) {
      const px = (x + quiet) * 6 + 3;
      const py = (y + quiet) * 6 + 3;
      const offset = (py * resized.image.width + px) * 4;
      sampled[y * modules + x] = actual[offset] === 0 ? 1 : 0;
    }
  }
  const readback = decodeSymbol(sampled, modules);
  assert.equal(readback.text, payload);
  assert.equal(readback.level, "H");
});
