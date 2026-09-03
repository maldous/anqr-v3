import { deflateSync } from "node:zlib";
import type { ContainerEncoderPort, EncodedContainer, Frame } from "../ports/container-encoder.ts";
import type { RasterSurfacePort } from "../ports/raster-surface.ts";
import { createPixelSurface } from "./pixel-surface.ts";

// PNG: encode only, single frame, lossless.
//
// The declared objective is "rasterises and encodes a single-frame PNG", so
// this adapter serves two ports: it supplies the raster surface and it encodes
// the container. supportsAnimation is false and more than one frame is refused;
// APNG exists but is not claimed, and silently dropping frames would be worse
// than refusing them.
//
// Compression is node:zlib, which is the standard library, so the domain's
// zero-third-party-dependency rule is untouched and this stays in the adapter
// layer where host technology belongs.

const CHANNELS = 4;
const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const COLOUR_TYPE_RGBA = 6;
const BIT_DEPTH_EIGHT = 8;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function beUint32(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const payload = new Uint8Array(typeBytes.length + body.length);
  payload.set(typeBytes, 0);
  payload.set(body, typeBytes.length);
  const out = new Uint8Array(4 + payload.length + 4);
  out.set(beUint32(body.length), 0);
  out.set(payload, 4);
  out.set(beUint32(crc32(payload)), 4 + payload.length);
  return out;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Scanlines with filter byte 0. Filtering would compress better and is not
 *  needed: a QR artefact is already highly repetitive and deflate handles it. */
function filteredScanlines(frame: Frame): Uint8Array {
  const stride = frame.width * CHANNELS;
  const out = new Uint8Array((stride + 1) * frame.height);
  for (let y = 0; y < frame.height; y += 1) {
    out[y * (stride + 1)] = 0;
    out.set(frame.pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return out;
}

export const pngContainer: ContainerEncoderPort = {
  mediaType: "image/png",
  supportsAnimation: false,

  async encode(frames: readonly Frame[]): Promise<EncodedContainer> {
    if (frames.length === 0) throw new Error("CONTAINER_NO_FRAMES");
    if (frames.length > 1) throw new Error("CONTAINER_ANIMATION_UNSUPPORTED");
    const frame = frames[0] as Frame;
    if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width <= 0 || frame.height <= 0) {
      throw new Error("CONTAINER_FRAME_DIMENSIONS_INVALID");
    }
    if (frame.pixels.length !== frame.width * frame.height * CHANNELS) throw new Error("CONTAINER_FRAME_MALFORMED");

    const header = concat([
      beUint32(frame.width), beUint32(frame.height),
      new Uint8Array([BIT_DEPTH_EIGHT, COLOUR_TYPE_RGBA, 0, 0, 0]),
    ]);
    // Fixed level, so the same frame always yields the same bytes. A default
    // that varied with the platform would break the determinism claim.
    const compressed = new Uint8Array(deflateSync(filteredScanlines(frame), { level: 9 }));
    const bytes = concat([SIGNATURE, chunk("IHDR", header), chunk("IDAT", compressed), chunk("IEND", new Uint8Array(0))]);
    return { bytes, mediaType: this.mediaType };
  },
};

/** The raster-surface half of this adapter's declared responsibility. */
export function pngRasterSurface(width: number, height: number): RasterSurfacePort {
  return createPixelSurface(width, height);
}
