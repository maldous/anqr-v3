import type { ContainerEncoderPort, EncodedContainer, Frame } from "../ports/container-encoder.ts";
import type { RasterSurfacePort } from "../ports/raster-surface.ts";
import { createPixelSurface } from "./pixel-surface.ts";

// GIF: encode only, animated, palette-limited.
//
// This is the one declared container whose supportsAnimation is true, and the
// capability distinction is real rather than cosmetic: GIF is indexed colour,
// so it carries at most 256 distinct colours per frame set and cannot represent
// an arbitrary RGBA frame exactly. An artefact whose palette exceeds 256
// colours is refused rather than quietly quantised, because a silently altered
// QR artefact is precisely the failure the scan-safety contract exists to stop.
//
// LZW is implemented here rather than taken from a dependency, for the same
// reason the codec is: the standard library has no LZW and the domain forbids
// third-party runtime imports.

const CHANNELS = 4;
const MAX_PALETTE = 256;
const TRAILER = 0x3b;

interface Indexed {
  readonly indices: Uint8Array;
  readonly palette: readonly number[];
}

/** Exact indexing. Refuses rather than quantising, so no colour is invented. */
function indexFrames(frames: readonly Frame[]): Indexed[] {
  const palette: number[] = [];
  const lookup = new Map<number, number>();
  const indexed: Indexed[] = [];
  for (const frame of frames) {
    const indices = new Uint8Array(frame.width * frame.height);
    for (let pixel = 0; pixel < indices.length; pixel += 1) {
      const offset = pixel * CHANNELS;
      const red = frame.pixels[offset] as number;
      const green = frame.pixels[offset + 1] as number;
      const blue = frame.pixels[offset + 2] as number;
      const key = (red << 16) | (green << 8) | blue;
      let index = lookup.get(key);
      if (index === undefined) {
        if (palette.length >= MAX_PALETTE) throw new Error("CONTAINER_PALETTE_EXCEEDED");
        index = palette.length;
        palette.push(key);
        lookup.set(key, index);
      }
      indices[pixel] = index;
    }
    indexed.push({ indices, palette });
  }
  return indexed;
}

function paletteDepth(size: number): number {
  let depth = 1;
  while (1 << depth < size) depth += 1;
  return Math.max(2, depth);
}

/** Variable-code-width LZW as GIF specifies, emitted least-significant bit first. */
function lzwCompress(indices: Uint8Array, minimumCodeSize: number): Uint8Array {
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minimumCodeSize + 1;
  let nextCode = endCode + 1;
  let dictionary = new Map<string, number>();

  const output: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  const emit = (code: number): void => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      output.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  emit(clearCode);
  let previous = "";
  for (const index of indices) {
    const candidate = previous === "" ? String(index) : `${previous},${index}`;
    if (dictionary.has(candidate) || previous === "") {
      previous = candidate;
      continue;
    }
    const code = dictionary.get(previous);
    emit(code === undefined ? Number(previous) : code);
    if (nextCode < 4096) {
      dictionary.set(candidate, nextCode);
      nextCode += 1;
      if (nextCode - 1 === (1 << codeSize) && codeSize < 12) codeSize += 1;
    } else {
      emit(clearCode);
      dictionary = new Map();
      codeSize = minimumCodeSize + 1;
      nextCode = endCode + 1;
    }
    previous = String(index);
  }
  if (previous !== "") {
    const code = dictionary.get(previous);
    emit(code === undefined ? Number(previous) : code);
  }
  emit(endCode);
  if (bitCount > 0) output.push(bitBuffer & 0xff);

  // Sub-blocks of at most 255 bytes, each length-prefixed, terminated by zero.
  const blocked: number[] = [];
  for (let offset = 0; offset < output.length; offset += 255) {
    const slice = output.slice(offset, offset + 255);
    blocked.push(slice.length, ...slice);
  }
  blocked.push(0);
  return new Uint8Array(blocked);
}

const leUint16 = (value: number): number[] => [value & 0xff, (value >>> 8) & 0xff];

export const gifContainer: ContainerEncoderPort = {
  mediaType: "image/gif",
  supportsAnimation: true,

  async encode(frames: readonly Frame[]): Promise<EncodedContainer> {
    if (frames.length === 0) throw new Error("CONTAINER_NO_FRAMES");
    const first = frames[0] as Frame;
    for (const frame of frames) {
      if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width <= 0 || frame.height <= 0) {
        throw new Error("CONTAINER_FRAME_DIMENSIONS_INVALID");
      }
      if (frame.pixels.length !== frame.width * frame.height * CHANNELS) throw new Error("CONTAINER_FRAME_MALFORMED");
      // One logical screen, so every frame must agree on size.
      if (frame.width !== first.width || frame.height !== first.height) throw new Error("CONTAINER_FRAME_SIZE_MISMATCH");
    }

    const indexed = indexFrames(frames);
    const palette = (indexed[0] as Indexed).palette;
    const depth = paletteDepth(palette.length);
    const tableSize = 1 << depth;

    const bytes: number[] = [];
    bytes.push(...new TextEncoder().encode("GIF89a"));
    bytes.push(...leUint16(first.width), ...leUint16(first.height));
    bytes.push(0x80 | (depth - 1), 0, 0);
    for (let entry = 0; entry < tableSize; entry += 1) {
      const colour = palette[entry] ?? 0;
      bytes.push((colour >>> 16) & 0xff, (colour >>> 8) & 0xff, colour & 0xff);
    }
    if (frames.length > 1) {
      // Netscape looping extension; without it an animation plays once.
      bytes.push(0x21, 0xff, 0x0b, ...new TextEncoder().encode("NETSCAPE2.0"), 0x03, 0x01, 0x00, 0x00, 0x00);
    }

    for (let index = 0; index < frames.length; index += 1) {
      const frame = frames[index] as Frame;
      const centiseconds = Math.max(0, Math.round(frame.durationMs / 10));
      bytes.push(0x21, 0xf9, 0x04, 0x04, ...leUint16(centiseconds), 0x00, 0x00);
      bytes.push(0x2c, ...leUint16(0), ...leUint16(0), ...leUint16(frame.width), ...leUint16(frame.height), 0x00);
      bytes.push(depth);
      bytes.push(...lzwCompress((indexed[index] as Indexed).indices, depth));
    }
    bytes.push(TRAILER);
    return { bytes: new Uint8Array(bytes), mediaType: this.mediaType };
  },
};

/** The raster-surface half of this adapter's declared responsibility. */
export function gifRasterSurface(width: number, height: number): RasterSurfacePort {
  return createPixelSurface(width, height);
}
