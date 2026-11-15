import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import test from "node:test";

import { createPixelSurface } from "../src/adapters/pixel-surface.ts";
import { fixedClock, systemClock } from "../src/adapters/system-clock.ts";
import { svgContainer } from "../src/adapters/svg-container.ts";
import { crc32, pngContainer, pngRasterSurface } from "../src/adapters/png-container.ts";
import { gifContainer, gifRasterSurface } from "../src/adapters/gif-container.ts";
import { pngImageSource } from "../src/adapters/png-image-source.ts";
import type { Frame } from "../src/ports/container-encoder.ts";
import { encodePayload } from "../src/qr/encode.ts";
import { buildSymbol } from "../src/qr/matrix.ts";
import { decodeSymbol } from "../src/qr/decode.ts";

// Behaviour of the five adapters that close the artefact output boundary.
//
// The declared capability distinctions are asserted rather than smoothed over:
// SVG and PNG are single-frame, GIF is the only animated container, GIF is
// palette-limited and refuses rather than quantising, and image-source decodes
// PNG only. No round trip is asserted where the ports do not declare one.

const BLACK = { red: 0, green: 0, blue: 0, alpha: 255 };
const WHITE = { red: 255, green: 255, blue: 255, alpha: 255 };

function frame(width: number, height: number, paint: (x: number, y: number) => typeof BLACK, durationMs = 0): Frame {
  const surface = createPixelSurface(width, height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) surface.fillRect(x, y, 1, 1, paint(x, y));
  return { width, height, pixels: surface.pixels(), durationMs };
}

const checkerboard = (width = 8, height = 8, durationMs = 0): Frame =>
  frame(width, height, (x, y) => ((x + y) % 2 === 0 ? BLACK : WHITE), durationMs);

// ------------------------------------------------------------ pixel surface

test("the pixel surface fills, clips and hands out a copy", () => {
  const surface = createPixelSurface(4, 3);
  assert.equal(surface.width, 4);
  assert.equal(surface.height, 3);
  surface.fill(WHITE);
  assert.equal(surface.pixels().length, 4 * 3 * 4);
  assert.ok([...surface.pixels()].every((byte) => byte === 255));

  // A rectangle running past the edge is clipped, not refused: a quiet zone at
  // the border legitimately describes one.
  surface.fillRect(3, 2, 10, 10, BLACK);
  const pixels = surface.pixels();
  assert.deepEqual([...pixels.subarray((2 * 4 + 3) * 4, (2 * 4 + 3) * 4 + 4)], [0, 0, 0, 255]);

  // The returned buffer must be a copy, or a container could mutate its input.
  const first = surface.pixels();
  first[0] = 7;
  assert.notEqual(surface.pixels()[0], 7);

  assert.throws(() => createPixelSurface(0, 4), /RASTER_SURFACE_DIMENSIONS_INVALID/);
  assert.throws(() => createPixelSurface(4, -1), /RASTER_SURFACE_DIMENSIONS_INVALID/);
});

test("both raster containers supply a working surface for their declared port", () => {
  for (const make of [pngRasterSurface, gifRasterSurface]) {
    const surface = make(2, 2);
    surface.fill(BLACK);
    assert.equal(surface.pixels().length, 16);
    assert.equal(surface.width, 2);
  }
});

// -------------------------------------------------------------------- clock

test("the system clock advances and the fixed clock does not", async () => {
  const first = systemClock.nowMs();
  assert.ok(Number.isFinite(first) && first > 0);
  await new Promise((resolve) => setTimeout(resolve, 2));
  assert.ok(systemClock.nowMs() >= first, "real time must not go backwards");

  const fixed = fixedClock(1_700_000_000_000);
  assert.equal(fixed.nowMs(), 1_700_000_000_000);
  assert.equal(fixed.nowMs(), fixed.nowMs(), "a fixed clock is what makes a use case deterministic");
  assert.throws(() => fixedClock(Number.NaN), /CLOCK_INSTANT_INVALID/);
});

// ---------------------------------------------------------------------- SVG

test("SVG encodes one frame, declares its media type and preserves dimensions", async () => {
  const encoded = await svgContainer.encode([checkerboard(8, 8)]);
  assert.equal(encoded.mediaType, "image/svg+xml");
  assert.equal(svgContainer.mediaType, "image/svg+xml");
  assert.equal(svgContainer.supportsAnimation, false);
  const text = new TextDecoder().decode(encoded.bytes);
  assert.match(text, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="8" height="8"/);
  assert.match(text, /viewBox="0 0 8 8"/);
  assert.match(text, /shape-rendering="crispEdges"/);
  assert.ok(text.endsWith("</svg>"));
});

test("SVG run-length merges a row rather than emitting one rect per pixel", async () => {
  // A solid row must become one rect; per-pixel output would be exact and unusable.
  const solid = frame(16, 1, () => BLACK);
  const text = new TextDecoder().decode((await svgContainer.encode([solid])).bytes);
  const rects = text.match(/<rect /g) ?? [];
  assert.equal(rects.length, 1, "a solid row is one rect");
  assert.match(text, /width="16"/);
});

test("SVG omits fully transparent runs instead of painting them", async () => {
  const transparent = frame(4, 1, () => ({ red: 0, green: 0, blue: 0, alpha: 0 }));
  const text = new TextDecoder().decode((await svgContainer.encode([transparent])).bytes);
  assert.equal((text.match(/<rect /g) ?? []).length, 0);
});

test("SVG refuses animation, emptiness and a malformed frame", async () => {
  await assert.rejects(() => svgContainer.encode([]), /CONTAINER_NO_FRAMES/);
  await assert.rejects(() => svgContainer.encode([checkerboard(), checkerboard()]), /CONTAINER_ANIMATION_UNSUPPORTED/);
  await assert.rejects(
    () => svgContainer.encode([{ width: 4, height: 4, pixels: new Uint8Array(3), durationMs: 0 }]),
    /CONTAINER_FRAME_MALFORMED/,
  );
});

test("SVG encoding is deterministic", async () => {
  const source = checkerboard(12, 12);
  const first = await svgContainer.encode([source]);
  const second = await svgContainer.encode([source]);
  assert.deepEqual(first.bytes, second.bytes);
});

// ---------------------------------------------------------------------- PNG

test("PNG produces a structurally valid single-frame container", async () => {
  const encoded = await pngContainer.encode([checkerboard(8, 8)]);
  assert.equal(encoded.mediaType, "image/png");
  assert.equal(pngContainer.supportsAnimation, false);
  const bytes = encoded.bytes;
  assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR carries the declared dimensions, and every chunk CRC must verify.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(16), 8, "IHDR width");
  assert.equal(view.getUint32(20), 8, "IHDR height");
  assert.equal(bytes[24], 8, "bit depth");
  assert.equal(bytes[25], 6, "colour type RGBA");

  let offset = 8;
  const seen: string[] = [];
  while (offset < bytes.length) {
    const length = view.getUint32(offset);
    const type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
    seen.push(type);
    const payload = bytes.subarray(offset + 4, offset + 8 + length);
    assert.equal(crc32(payload), view.getUint32(offset + 8 + length), `CRC of ${type}`);
    offset += 12 + length;
  }
  assert.deepEqual(seen, ["IHDR", "IDAT", "IEND"]);
});

test("PNG refuses animation, emptiness and malformed dimensions", async () => {
  await assert.rejects(() => pngContainer.encode([]), /CONTAINER_NO_FRAMES/);
  await assert.rejects(() => pngContainer.encode([checkerboard(), checkerboard()]), /CONTAINER_ANIMATION_UNSUPPORTED/);
  await assert.rejects(
    () => pngContainer.encode([{ width: 0, height: 4, pixels: new Uint8Array(0), durationMs: 0 }]),
    /CONTAINER_FRAME_DIMENSIONS_INVALID/,
  );
  await assert.rejects(
    () => pngContainer.encode([{ width: 4, height: 4, pixels: new Uint8Array(5), durationMs: 0 }]),
    /CONTAINER_FRAME_MALFORMED/,
  );
});

test("PNG encoding is deterministic", async () => {
  const source = checkerboard(10, 10);
  assert.deepEqual((await pngContainer.encode([source])).bytes, (await pngContainer.encode([source])).bytes);
});

// ---------------------------------------------------------------------- GIF

test("GIF is the animated container and carries per-frame timing", async () => {
  assert.equal(gifContainer.supportsAnimation, true);
  const frames = [checkerboard(8, 8, 100), checkerboard(8, 8, 250)];
  const encoded = await gifContainer.encode(frames);
  assert.equal(encoded.mediaType, "image/gif");
  const bytes = encoded.bytes;
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 6)), "GIF89a");
  assert.equal(bytes[6]! | (bytes[7]! << 8), 8, "logical screen width");
  assert.equal(bytes[8]! | (bytes[9]! << 8), 8, "logical screen height");
  assert.equal(bytes[bytes.length - 1], 0x3b, "trailer");

  // A multi-frame GIF without the looping extension plays once.
  assert.ok(new TextDecoder().decode(bytes).includes("NETSCAPE2.0"), "looping extension present");
  // Both declared delays appear as centiseconds.
  const text = [...bytes];
  const hasDelay = (centiseconds: number): boolean =>
    text.some((_, index) => text[index] === 0x21 && text[index + 1] === 0xf9
      && (text[index + 4]! | (text[index + 5]! << 8)) === centiseconds);
  assert.ok(hasDelay(10), "100ms became 10 centiseconds");
  assert.ok(hasDelay(25), "250ms became 25 centiseconds");
});

test("a single-frame GIF omits the looping extension", async () => {
  const encoded = await gifContainer.encode([checkerboard(8, 8, 0)]);
  assert.ok(!new TextDecoder().decode(encoded.bytes).includes("NETSCAPE2.0"));
});

test("GIF refuses a palette beyond 256 colours rather than quantising", async () => {
  // Silently altering colours would defeat the scan-safety contract, so the
  // real capability limit is surfaced as a refusal.
  const many = frame(20, 20, (x, y) => ({ red: x * 12 % 256, green: y * 7 % 256, blue: (x * y) % 256, alpha: 255 }));
  await assert.rejects(() => gifContainer.encode([many]), /CONTAINER_PALETTE_EXCEEDED/);
});

test("GIF refuses frames of differing size and malformed frames", async () => {
  await assert.rejects(() => gifContainer.encode([]), /CONTAINER_NO_FRAMES/);
  await assert.rejects(
    () => gifContainer.encode([checkerboard(8, 8), checkerboard(4, 4)]),
    /CONTAINER_FRAME_SIZE_MISMATCH/,
  );
  await assert.rejects(
    () => gifContainer.encode([{ width: 4, height: 4, pixels: new Uint8Array(7), durationMs: 0 }]),
    /CONTAINER_FRAME_MALFORMED/,
  );
});

test("GIF encoding is deterministic", async () => {
  const frames = [checkerboard(8, 8, 50), checkerboard(8, 8, 50)];
  assert.deepEqual((await gifContainer.encode(frames)).bytes, (await gifContainer.encode(frames)).bytes);
});

// ------------------------------------------------------------- image source

test("the image source decodes exactly what the PNG container produced", async () => {
  // Two adapters meeting through their ports. This is not a declared round
  // trip — the container port is encode-only — but where both directions exist
  // the pixels must survive, or one of them is wrong.
  const original = checkerboard(9, 7);
  const encoded = await pngContainer.encode([original]);
  const decoded = await pngImageSource.decode(encoded.bytes, "image/png");
  assert.ok(decoded.ok, `decode refused: ${decoded.ok ? "" : decoded.detail}`);
  assert.equal(decoded.image.width, 9);
  assert.equal(decoded.image.height, 7);
  assert.deepEqual(decoded.image.pixels, original.pixels);
});

test("the image source reverses every PNG scanline filter", async () => {
  // Built by hand so each filter type is actually exercised; the container
  // only ever emits filter 0, so a round trip alone would prove one of five.
  const width = 6;
  const height = 5;
  const raw = new Uint8Array(width * height * 4);
  for (let index = 0; index < raw.length; index += 1) raw[index] = (index * 31 + 7) & 0xff;

  for (const filter of [0, 1, 2, 3, 4]) {
    const stride = width * 4;
    const filtered = new Uint8Array((stride + 1) * height);
    for (let y = 0; y < height; y += 1) {
      filtered[y * (stride + 1)] = filter;
      for (let index = 0; index < stride; index += 1) {
        const value = raw[y * stride + index] as number;
        const left = index >= 4 ? (raw[y * stride + index - 4] as number) : 0;
        const above = y > 0 ? (raw[(y - 1) * stride + index] as number) : 0;
        const upperLeft = y > 0 && index >= 4 ? (raw[(y - 1) * stride + index - 4] as number) : 0;
        let encodedByte = value;
        if (filter === 1) encodedByte = value - left;
        if (filter === 2) encodedByte = value - above;
        if (filter === 3) encodedByte = value - ((left + above) >> 1);
        if (filter === 4) {
          const estimate = left + above - upperLeft;
          const dl = Math.abs(estimate - left);
          const da = Math.abs(estimate - above);
          const du = Math.abs(estimate - upperLeft);
          const predictor = dl <= da && dl <= du ? left : da <= du ? above : upperLeft;
          encodedByte = value - predictor;
        }
        filtered[y * (stride + 1) + 1 + index] = encodedByte & 0xff;
      }
    }
    const png = buildPng(width, height, 6, deflateSync(filtered, { level: 9 }));
    const decoded = await pngImageSource.decode(png, "image/png");
    assert.ok(decoded.ok, `filter ${filter} refused`);
    assert.deepEqual(decoded.image.pixels, raw, `filter ${filter} must reverse exactly`);
  }
});

test("the image source normalises greyscale and RGB to RGBA", async () => {
  const width = 3;
  const height = 2;
  for (const [colourType, samples] of [[0, 1], [2, 3]] as const) {
    const stride = width * samples;
    const filtered = new Uint8Array((stride + 1) * height);
    for (let y = 0; y < height; y += 1) {
      filtered[y * (stride + 1)] = 0;
      for (let index = 0; index < stride; index += 1) filtered[y * (stride + 1) + 1 + index] = 128;
    }
    const decoded = await pngImageSource.decode(
      buildPng(width, height, colourType, deflateSync(filtered, { level: 9 })), "image/png",
    );
    assert.ok(decoded.ok, `colour type ${colourType} refused`);
    assert.equal(decoded.image.pixels.length, width * height * 4);
    assert.deepEqual([...decoded.image.pixels.subarray(0, 4)], [128, 128, 128, 255]);
  }
});

test("the image source refuses what it cannot decode, with distinct reasons", async () => {
  const valid = (await pngContainer.encode([checkerboard(4, 4)])).bytes;

  const wrongType = await pngImageSource.decode(valid, "image/jpeg");
  assert.equal(wrongType.ok, false);
  assert.equal(wrongType.ok === false && wrongType.reason, "UNSUPPORTED_FORMAT");

  const notPng = await pngImageSource.decode(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), "image/png");
  assert.equal(notPng.ok, false);
  assert.equal(notPng.ok === false && notPng.reason, "MALFORMED");

  const truncated = await pngImageSource.decode(valid.subarray(0, 20), "image/png");
  assert.equal(truncated.ok, false);

  // Sixteen-bit and interlaced are real PNG features this adapter does not claim.
  const sixteenBit = buildPng(2, 2, 6, deflateSync(new Uint8Array(2 * (2 * 8 + 1)), { level: 9 }), 16);
  const deep = await pngImageSource.decode(sixteenBit, "image/png");
  assert.equal(deep.ok, false);
  assert.equal(deep.ok === false && deep.reason, "UNSUPPORTED_FORMAT");

  const paletted = buildPng(2, 2, 3, deflateSync(new Uint8Array(2 * (2 + 1)), { level: 9 }));
  const palette = await pngImageSource.decode(paletted, "image/png");
  assert.equal(palette.ok, false);
  assert.equal(palette.ok === false && palette.reason, "UNSUPPORTED_FORMAT");

  const interlaced = buildPng(2, 2, 6, deflateSync(new Uint8Array(2 * (2 * 4 + 1)), { level: 9 }), 8, 1);
  const woven = await pngImageSource.decode(interlaced, "image/png");
  assert.equal(woven.ok, false);
  assert.equal(woven.ok === false && woven.reason, "UNSUPPORTED_FORMAT");

  const huge = buildPng(65536, 65536, 6, deflateSync(new Uint8Array(8), { level: 9 }));
  const big = await pngImageSource.decode(huge, "image/png");
  assert.equal(big.ok, false);
  assert.equal(big.ok === false && big.reason, "TOO_LARGE");
});

// ------------------------------------------------- the boundary end to end

test("a real QR artefact survives the whole output boundary", async () => {
  // The point of the adapters existing: a decoded-correct symbol reaches every
  // container, and the raster path returns to the exact payload through the
  // image source. Nothing here mocks a codec or a container.
  const payload = "https://anqr.link/output-boundary";
  const encoded = encodePayload(payload, { level: "H" });
  const symbol = buildSymbol(encoded.codewords, encoded.version, encoded.level, { mask: "auto" });

  const scale = 3;
  const quiet = 4;
  const side = (symbol.size + quiet * 2) * scale;
  const surface = pngRasterSurface(side, side);
  surface.fill(WHITE);
  for (let y = 0; y < symbol.size; y += 1) {
    for (let x = 0; x < symbol.size; x += 1) {
      if (symbol.modules[y * symbol.size + x] === 1) {
        surface.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale, BLACK);
      }
    }
  }
  const artefact: Frame = { width: side, height: side, pixels: surface.pixels(), durationMs: 0 };

  const png = await pngContainer.encode([artefact]);
  const svg = await svgContainer.encode([artefact]);
  const gif = await gifContainer.encode([artefact, artefact]);
  assert.ok(png.bytes.length > 0 && svg.bytes.length > 0 && gif.bytes.length > 0);
  assert.equal(new TextDecoder().decode(svg.bytes).includes(`width="${side}"`), true);

  // Back through the image source, then sample the modules and decode.
  const decoded = await pngImageSource.decode(png.bytes, "image/png");
  assert.ok(decoded.ok);
  const grid = new Uint8Array(symbol.size * symbol.size);
  for (let y = 0; y < symbol.size; y += 1) {
    for (let x = 0; x < symbol.size; x += 1) {
      const px = (x + quiet) * scale + Math.floor(scale / 2);
      const py = (y + quiet) * scale + Math.floor(scale / 2);
      grid[y * symbol.size + x] = decoded.image.pixels[(py * side + px) * 4] === 0 ? 1 : 0;
    }
  }
  assert.deepEqual(grid, symbol.modules, "the rasterised and decoded grid must equal the symbol");
  assert.equal(decodeSymbol(grid, symbol.size).text, payload);
});

test("no adapter reaches for a framework or a third-party package", async () => {
  // Framework independence, asserted at the source rather than assumed.
  const { readFileSync, readdirSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const directory = resolve(import.meta.dirname, "../src/adapters");
  for (const entry of readdirSync(directory)) {
    if (!entry.endsWith(".ts")) continue;
    const source = readFileSync(resolve(directory, entry), "utf8");
    for (const match of source.matchAll(/from\s*["']([^"']+)["']/g)) {
      const specifier = match[1] as string;
      const allowed = specifier.startsWith(".") || specifier.startsWith("node:");
      assert.ok(allowed, `${entry} imports "${specifier}", which is neither relative nor standard library`);
    }
  }
});

/** Assemble a PNG around already-filtered, already-deflated scanlines. */
function buildPng(
  width: number, height: number, colourType: number, compressed: Uint8Array | Buffer,
  bitDepth = 8, interlace = 0,
): Uint8Array {
  const be = (value: number): number[] => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
  const chunk = (type: string, body: number[]): number[] => {
    const payload = [...new TextEncoder().encode(type), ...body];
    return [...be(body.length), ...payload, ...be(crc32(new Uint8Array(payload)))];
  };
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk("IHDR", [...be(width), ...be(height), bitDepth, colourType, 0, 0, interlace]),
    ...chunk("IDAT", [...new Uint8Array(compressed)]),
    ...chunk("IEND", []),
  ]);
}
