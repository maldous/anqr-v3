import { inflateSync } from "node:zlib";
import type { DecodeImageResult, ImageSourcePort, ImageSourceRefusalReason } from "../ports/image-source.ts";

// PNG decoding: the honest half of image-source.
//
// PNG only, and that is a real capability boundary rather than laziness. Its
// filters are reversible and its compression is zlib from the standard library,
// so a decode is exact. A lossy format would need a discrete cosine transform
// implementation, so it is refused with UNSUPPORTED_FORMAT rather than
// approximated. Refusing is the behaviour the port's result type already models.
//
// This decodes what the sibling png-container encodes, but the two are not a
// declared round trip: the container is encode-only by its port, and 8-bit
// RGB/RGBA is a narrower input set than PNG as a whole.

const CHANNELS = 4;
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAXIMUM_PIXELS = 64 * 1024 * 1024;

const COLOUR_TYPE_SAMPLES: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

// Uses the port's own exported reason union. A conditional type inferred from
// the result union collapsed to never, which the type checker caught.
const refuse = (reason: ImageSourceRefusalReason, detail: string): DecodeImageResult =>
  ({ ok: false, reason, detail });

function beUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] as number) << 24 | (bytes[offset + 1] as number) << 16
    | (bytes[offset + 2] as number) << 8 | (bytes[offset + 3] as number)) >>> 0;
}

function paeth(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceAbove = Math.abs(estimate - above);
  const distanceUpperLeft = Math.abs(estimate - upperLeft);
  if (distanceLeft <= distanceAbove && distanceLeft <= distanceUpperLeft) return left;
  return distanceAbove <= distanceUpperLeft ? above : upperLeft;
}

/** Reverse the five PNG filter types in place, row by row. */
function unfilter(raw: Uint8Array, width: number, height: number, bytesPerPixel: number): Uint8Array | null {
  const stride = width * bytesPerPixel;
  if (raw.length < (stride + 1) * height) return null;
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] as number;
    const source = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const target = out.subarray(y * stride, (y + 1) * stride);
    const previous = y === 0 ? null : out.subarray((y - 1) * stride, y * stride);
    for (let index = 0; index < stride; index += 1) {
      const left = index >= bytesPerPixel ? (target[index - bytesPerPixel] as number) : 0;
      const above = previous === null ? 0 : (previous[index] as number);
      const upperLeft = previous === null || index < bytesPerPixel ? 0 : (previous[index - bytesPerPixel] as number);
      const value = source[index] as number;
      switch (filter) {
        case 0: target[index] = value; break;
        case 1: target[index] = (value + left) & 0xff; break;
        case 2: target[index] = (value + above) & 0xff; break;
        case 3: target[index] = (value + ((left + above) >> 1)) & 0xff; break;
        case 4: target[index] = (value + paeth(left, above, upperLeft)) & 0xff; break;
        default: return null;
      }
    }
  }
  return out;
}

export const pngImageSource: ImageSourcePort = {
  async decode(bytes: Uint8Array, declaredMediaType: string): Promise<DecodeImageResult> {
    if (declaredMediaType !== "image/png") {
      return refuse("UNSUPPORTED_FORMAT", `only image/png is decoded; "${declaredMediaType}" would require a lossy codec that is not implemented`);
    }
    if (bytes.length < SIGNATURE.length || !SIGNATURE.every((byte, index) => bytes[index] === byte)) {
      return refuse("MALFORMED", "the PNG signature is absent, so the declared media type does not match the content");
    }

    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colourType = -1;
    let interlaced = 0;
    const dataParts: Uint8Array[] = [];
    let offset = SIGNATURE.length;

    while (offset + 8 <= bytes.length) {
      const length = beUint32(bytes, offset);
      const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      const body = bytes.subarray(offset + 8, offset + 8 + length);
      if (offset + 12 + length > bytes.length) return refuse("MALFORMED", `chunk ${type} runs past the end of the input`);
      if (type === "IHDR") {
        if (length !== 13) return refuse("MALFORMED", "IHDR must be thirteen bytes");
        width = beUint32(body, 0);
        height = beUint32(body, 4);
        bitDepth = body[8] as number;
        colourType = body[9] as number;
        interlaced = body[12] as number;
      } else if (type === "IDAT") {
        dataParts.push(body.slice());
      } else if (type === "IEND") {
        break;
      }
      offset += 12 + length;
    }

    if (width <= 0 || height <= 0) return refuse("MALFORMED", "IHDR declares no usable dimensions");
    if (width * height > MAXIMUM_PIXELS) return refuse("TOO_LARGE", `${width}x${height} exceeds the ${MAXIMUM_PIXELS}-pixel bound`);
    if (bitDepth !== 8) return refuse("UNSUPPORTED_FORMAT", `only eight-bit channels are decoded; this declares ${bitDepth}`);
    if (interlaced !== 0) return refuse("UNSUPPORTED_FORMAT", "interlaced PNG is not decoded");
    const samples = COLOUR_TYPE_SAMPLES[colourType];
    if (samples === undefined) return refuse("UNSUPPORTED_FORMAT", `colour type ${colourType} is not decoded; palette and unknown types are excluded`);
    if (dataParts.length === 0) return refuse("MALFORMED", "no IDAT chunk is present");

    let raw: Uint8Array;
    try {
      const joined = new Uint8Array(dataParts.reduce((sum, part) => sum + part.length, 0));
      let cursor = 0;
      for (const part of dataParts) { joined.set(part, cursor); cursor += part.length; }
      raw = new Uint8Array(inflateSync(joined));
    } catch {
      return refuse("MALFORMED", "the compressed image data could not be inflated");
    }

    const unfiltered = unfilter(raw, width, height, samples);
    if (unfiltered === null) return refuse("MALFORMED", "a scanline filter type was invalid or the data was short");

    // Normalise every supported colour type to RGBA, which is what the port
    // promises its callers and what the raster surface consumes.
    const pixels = new Uint8Array(width * height * CHANNELS);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const source = pixel * samples;
      const target = pixel * CHANNELS;
      if (samples === 1 || samples === 2) {
        const grey = unfiltered[source] as number;
        pixels[target] = grey;
        pixels[target + 1] = grey;
        pixels[target + 2] = grey;
        pixels[target + 3] = samples === 2 ? (unfiltered[source + 1] as number) : 255;
      } else {
        pixels[target] = unfiltered[source] as number;
        pixels[target + 1] = unfiltered[source + 1] as number;
        pixels[target + 2] = unfiltered[source + 2] as number;
        pixels[target + 3] = samples === 4 ? (unfiltered[source + 3] as number) : 255;
      }
    }
    return { ok: true, image: { width, height, pixels } };
  },
};
