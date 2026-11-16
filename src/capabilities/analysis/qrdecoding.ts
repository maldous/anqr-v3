import { inflateSync } from "node:zlib";

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;

export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export const ERROR_CORRECTION_LEVELS = ['L', 'M', 'Q', 'H'] as const;

export interface DecoderMetadata {
  readonly version: string;
  readonly algorithm: string;
  readonly customizations: Readonly<Record<string, unknown>>;
  readonly qrVersion?: number;
  readonly errorCorrectionLevel?: ErrorCorrectionLevel;
  readonly maskPattern?: number;
}

export interface DecodingSuccess {
  readonly success: true;
  readonly payloadText: string;
  readonly payloadBytes: Uint8Array;
  readonly confidence: ConfidenceLevel;
  readonly decoderMetadata: DecoderMetadata;
}

export interface DecodingFailure {
  readonly success: false;
  readonly errorType: DecodingErrorType;
  readonly stage: DecodingStage;
  readonly payload: null;
}

export type DecodingResult = DecodingSuccess | DecodingFailure;

export type DecodingErrorType =
  | 'invalid_image_data'
  | 'no_qr_found'
  | 'decode_failure'
  | 'unsupported_version'
  | 'ecc_failure';

export const DECODING_ERROR_TYPES = [
  'invalid_image_data',
  'no_qr_found',
  'decode_failure',
  'unsupported_version',
  'ecc_failure',
] as const;

export type DecodingStage =
  | 'input_validation'
  | 'image_preprocessing'
  | 'symbol_detection'
  | 'format_decoding'
  | 'data_extraction'
  | 'error_correction'
  | 'confidence_assessment';

export const DECODING_STAGES = [
  'input_validation',
  'image_preprocessing',
  'symbol_detection',
  'format_decoding',
  'data_extraction',
  'error_correction',
  'confidence_assessment',
] as const;

export interface StructuredAppendInfo {
  readonly sequenceIndex: number;
  readonly totalCount: number;
  readonly parity: number;
}

export interface DecodeArtifacts {
  readonly id: string;
  readonly image: Uint8Array;
  readonly errorCorrectionLevel: ErrorCorrectionLevel;
  readonly customizations: Readonly<Record<string, unknown>>;
  readonly payload: Uint8Array;
  readonly payloadText: string;
  readonly confidence: ConfidenceLevel;
  readonly decoderMetadata: DecoderMetadata;
  readonly structuredAppend: StructuredAppendInfo | null;
}

export interface DecodingOptions {
  readonly errorCorrectionLevel?: ErrorCorrectionLevel;
  readonly customizations?: Readonly<Record<string, unknown>>;
}

export interface RoundTripVector {
  readonly id: string;
  readonly errorCorrectionLevel: ErrorCorrectionLevel;
  readonly customizations: Readonly<Record<string, unknown>>;
  readonly payload: Uint8Array;
  readonly payloadText: string;
}

export interface RoundTripResult {
  readonly vectorId: string;
  readonly passed: boolean;
  readonly mismatches: readonly string[];
}

export interface RoundTripReport {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly results: readonly RoundTripResult[];
}

interface GrayImage {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

interface QrMatrix {
  readonly size: number;
  readonly modules: readonly (readonly boolean[])[];
}

interface FormatInformation {
  readonly level: ErrorCorrectionLevel;
  readonly mask: number;
}

interface DataBlockDescription {
  readonly blocks: number;
  readonly dataCodewords: number;
}

// Bounded synchronous capability path, not an arbitrary-image service.
// At most 16 MiB encoded input and 4 Mi pixels, neither dimension over 4096.
const MAX_PNG_INPUT_BYTES = 16 * 1024 * 1024;
const MAX_PNG_DIMENSION = 4096;
const MAX_PNG_PIXELS = 4 * 1024 * 1024;

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ALPHANUMERIC_CHARACTERS =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

const DATA_BLOCKS: Readonly<
  Record<number, Readonly<Record<ErrorCorrectionLevel, DataBlockDescription>>>
> = {
  1: {
    L: { blocks: 1, dataCodewords: 19 },
    M: { blocks: 1, dataCodewords: 16 },
    Q: { blocks: 1, dataCodewords: 13 },
    H: { blocks: 1, dataCodewords: 9 },
  },
  2: {
    L: { blocks: 1, dataCodewords: 34 },
    M: { blocks: 1, dataCodewords: 28 },
    Q: { blocks: 1, dataCodewords: 22 },
    H: { blocks: 1, dataCodewords: 16 },
  },
  3: {
    L: { blocks: 1, dataCodewords: 55 },
    M: { blocks: 1, dataCodewords: 44 },
    Q: { blocks: 2, dataCodewords: 34 },
    H: { blocks: 2, dataCodewords: 26 },
  },
  4: {
    L: { blocks: 1, dataCodewords: 80 },
    M: { blocks: 2, dataCodewords: 64 },
    Q: { blocks: 2, dataCodewords: 48 },
    H: { blocks: 4, dataCodewords: 36 },
  },
};

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
}

function bytesEqualAt(
  bytes: Uint8Array,
  expected: Uint8Array,
  offset: number
): boolean {
  if (offset + expected.length > bytes.length) return false;
  for (let index = 0; index < expected.length; index++) {
    if (bytes[offset + index] !== expected[index]) return false;
  }
  return true;
}

function paethPredictor(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left;
  }
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function packedSample(
  row: Uint8Array,
  x: number,
  bitDepth: number
): number {
  if (bitDepth === 8) return row[x];
  const bitOffset = x * bitDepth;
  const packed = row[Math.floor(bitOffset / 8)];
  const shift = 8 - bitDepth - (bitOffset % 8);
  return (packed >>> shift) & ((1 << bitDepth) - 1);
}

function parsePng(imageData: Uint8Array): GrayImage | null {
  if (imageData.length > MAX_PNG_INPUT_BYTES ||
      !bytesEqualAt(imageData, PNG_SIGNATURE, 0)) return null;

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = -1;
  let palette: Uint8Array | undefined;
  const compressedParts: Uint8Array[] = [];
  let sawHeader = false;
  let sawEnd = false;
  let sawPalette = false;
  let sawTransparency = false;
  let sawData = false;
  let dataEnded = false;

  while (offset + 12 <= imageData.length) {
    const length = readUint32(imageData, offset);
    const dataOffset = offset + 8;
    const nextOffset = dataOffset + length + 4;
    if (nextOffset > imageData.length) return null;

    const chunkType = String.fromCharCode(
      imageData[offset + 4],
      imageData[offset + 5],
      imageData[offset + 6],
      imageData[offset + 7]
    );

    if (sawData && chunkType !== "IDAT") dataEnded = true;

    if (chunkType === "IHDR") {
      if (sawHeader || offset !== PNG_SIGNATURE.length || length !== 13) return null;
      sawHeader = true;
      width = readUint32(imageData, dataOffset);
      height = readUint32(imageData, dataOffset + 4);
      bitDepth = imageData[dataOffset + 8];
      colorType = imageData[dataOffset + 9];
      interlace = imageData[dataOffset + 12];
      if (width < 1 || height < 1 ||
          width > MAX_PNG_DIMENSION || height > MAX_PNG_DIMENSION ||
          width * height > MAX_PNG_PIXELS ||
          imageData[dataOffset + 10] !== 0 || imageData[dataOffset + 11] !== 0 ||
          interlace !== 0) return null;
    } else if (!sawHeader) {
      return null;
    } else if (chunkType === "PLTE") {
      if (sawPalette || sawData || colorType === 0 || colorType === 4 ||
          length === 0 || length % 3 !== 0 || length > 768 ||
          (colorType === 3 && length / 3 > 2 ** bitDepth)) return null;
      sawPalette = true;
      palette = imageData.slice(dataOffset, dataOffset + length);
    } else if (chunkType === "IDAT") {
      if (dataEnded || (colorType === 3 && !sawPalette)) return null;
      sawData = true;
      compressedParts.push(imageData.subarray(dataOffset, dataOffset + length));
    } else if (chunkType === "tRNS") {
      // Indexed opacity declarations are permitted; transparency is not.
      if (sawTransparency || sawData || colorType !== 3 || palette === undefined ||
          length === 0 || length > palette.length / 3 ||
          imageData.subarray(dataOffset, dataOffset + length).some(alpha => alpha !== 255)) return null;
      sawTransparency = true;
    } else if (chunkType === "IEND") {
      if (length !== 0 || nextOffset !== imageData.length) return null;
      sawEnd = true;
      break;
    } else if ((imageData[offset + 4] & 0x20) === 0) {
      return null; // Unknown critical chunks cannot be silently ignored.
    }

    offset = nextOffset;
  }

  if (
    !sawHeader || !sawEnd ||
    width < 1 ||
    height < 1 ||
    compressedParts.length === 0 ||
    interlace !== 0
  ) {
    return null;
  }

  const channels =
    colorType === 0 || colorType === 3
      ? 1
      : colorType === 2
        ? 3
        : colorType === 4
          ? 2
          : colorType === 6
            ? 4
            : 0;

  const validDepth =
    (colorType === 0 &&
      (bitDepth === 1 ||
        bitDepth === 2 ||
        bitDepth === 4 ||
        bitDepth === 8)) ||
    (colorType === 3 &&
      palette !== undefined &&
      (bitDepth === 1 ||
        bitDepth === 2 ||
        bitDepth === 4 ||
        bitDepth === 8)) ||
    ((colorType === 2 || colorType === 4 || colorType === 6) &&
      bitDepth === 8);

  if (channels === 0 || !validDepth) return null;

  let compressedLength = 0;
  for (const part of compressedParts) compressedLength += part.length;
  const compressed = new Uint8Array(compressedLength);
  let compressedOffset = 0;
  for (const part of compressedParts) {
    compressed.set(part, compressedOffset);
    compressedOffset += part.length;
  }

  const bitsPerPixel = channels * bitDepth;
  const rowBytes = Math.ceil((width * bitsPerPixel) / 8);
  const expectedBytes = height * (rowBytes + 1);
  const filterBytesPerPixel = Math.max(1, Math.ceil(bitsPerPixel / 8));
  // Dimensions were bounded before allocation; cap zlib itself, not just its result.
  let inflated: Uint8Array;
  try {
    inflated = inflateSync(compressed, { maxOutputLength: expectedBytes });
  } catch {
    return null;
  }
  if (inflated.length !== expectedBytes) return null;

  const raw = new Uint8Array(rowBytes * height);
  let sourceOffset = 0;

  for (let y = 0; y < height; y++) {
    const filter = inflated[sourceOffset++];
    const rowOffset = y * rowBytes;
    const previousRowOffset = rowOffset - rowBytes;

    for (let x = 0; x < rowBytes; x++) {
      const encoded = inflated[sourceOffset++];
      const left =
        x >= filterBytesPerPixel
          ? raw[rowOffset + x - filterBytesPerPixel]
          : 0;
      const above = y > 0 ? raw[previousRowOffset + x] : 0;
      const upperLeft =
        y > 0 && x >= filterBytesPerPixel
          ? raw[previousRowOffset + x - filterBytesPerPixel]
          : 0;

      let predictor: number;
      switch (filter) {
        case 0:
          predictor = 0;
          break;
        case 1:
          predictor = left;
          break;
        case 2:
          predictor = above;
          break;
        case 3:
          predictor = Math.floor((left + above) / 2);
          break;
        case 4:
          predictor = paethPredictor(left, above, upperLeft);
          break;
        default:
          return null;
      }
      raw[rowOffset + x] = (encoded + predictor) & 0xff;
    }
  }

  const pixels = new Uint8Array(width * height);
  const grayscaleMaximum = (1 << bitDepth) - 1;

  for (let y = 0; y < height; y++) {
    const row = raw.subarray(y * rowBytes, (y + 1) * rowBytes);
    for (let x = 0; x < width; x++) {
      let gray: number;

      if (colorType === 3) {
        const paletteIndex = packedSample(row, x, bitDepth);
        const paletteOffset = paletteIndex * 3;
        if (
          palette === undefined ||
          paletteOffset + 2 >= palette.length
        ) {
          return null;
        }
        gray = Math.round(
          palette[paletteOffset] * 0.299 +
            palette[paletteOffset + 1] * 0.587 +
            palette[paletteOffset + 2] * 0.114
        );
      } else if (colorType === 0 && bitDepth < 8) {
        gray =
          (packedSample(row, x, bitDepth) * 255) / grayscaleMaximum;
      } else {
        const pixelOffset = x * channels;
        if ((colorType === 4 || colorType === 6) && row[pixelOffset + channels - 1] !== 255) return null;
        if (colorType === 0 || colorType === 4) {
          gray = row[pixelOffset];
        } else {
          gray = Math.round(
            row[pixelOffset] * 0.299 +
              row[pixelOffset + 1] * 0.587 +
              row[pixelOffset + 2] * 0.114
          );
        }
      }
      pixels[y * width + x] = gray;
    }
  }

  return { width, height, pixels };
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function detectQrMatrix(image: GrayImage): QrMatrix | null {
  let minimumX = image.width;
  let minimumY = image.height;
  let maximumX = -1;
  let maximumY = -1;

  const dark = (x: number, y: number): boolean =>
    image.pixels[y * image.width + x] < 128;

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (dark(x, y)) {
        minimumX = Math.min(minimumX, x);
        maximumX = Math.max(maximumX, x);
        minimumY = Math.min(minimumY, y);
        maximumY = Math.max(maximumY, y);
      }
    }
  }

  if (maximumX < minimumX || maximumY < minimumY) return null;

  const boundingWidth = maximumX - minimumX + 1;
  const boundingHeight = maximumY - minimumY + 1;
  if (boundingWidth !== boundingHeight) return null;

  let scale = 0;
  for (let y = minimumY; y <= maximumY; y++) {
    let runStart = minimumX;
    let previous = dark(minimumX, y);
    for (let x = minimumX + 1; x <= maximumX + 1; x++) {
      const current = x <= maximumX ? dark(x, y) : !previous;
      if (current !== previous) {
        scale = greatestCommonDivisor(scale, x - runStart);
        runStart = x;
        previous = current;
      }
    }
  }

  if (scale < 1 || boundingWidth % scale !== 0) return null;
  const size = boundingWidth / scale;
  if (size < 21 || size > 177 || (size - 17) % 4 !== 0) return null;

  const modules: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x++) {
      row.push(
        dark(
          minimumX + x * scale + Math.floor(scale / 2),
          minimumY + y * scale + Math.floor(scale / 2)
        )
      );
    }
    modules.push(row);
  }

  return { size, modules };
}

function hammingDistance(left: number, right: number): number {
  let value = left ^ right;
  let distance = 0;
  while (value !== 0) {
    distance += value & 1;
    value >>>= 1;
  }
  return distance;
}

function formatCode(data: number): number {
  let value = data << 10;
  for (let bit = 14; bit >= 10; bit--) {
    if (((value >>> bit) & 1) !== 0) value ^= 0x537 << (bit - 10);
  }
  return ((data << 10) | value) ^ 0x5412;
}

function readFormatInformation(matrix: QrMatrix): FormatInformation | null {
  const coordinates: readonly (readonly [number, number])[] = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];

  let observed = 0;
  for (let bit = 0; bit < coordinates.length; bit++) {
    const [x, y] = coordinates[bit];
    if (matrix.modules[y][x]) observed |= 1 << bit;
  }

  let bestData = -1;
  let bestDistance = 16;
  for (let data = 0; data < 32; data++) {
    const distance = hammingDistance(observed, formatCode(data));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestData = data;
    }
  }
  if (bestData < 0 || bestDistance > 3) return null;

  const levelBits = (bestData >>> 3) & 3;
  const level: ErrorCorrectionLevel =
    levelBits === 1 ? "L" : levelBits === 0 ? "M" : levelBits === 3 ? "Q" : "H";
  return { level, mask: bestData & 7 };
}

function alignmentPatternPositions(version: number): readonly number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step =
    version === 32
      ? 26
      : Math.ceil((version * 4 + count * 2 + 1) / (count * 2 - 2)) * 2;
  const positions = [6];
  for (
    let position = version * 4 + 10;
    positions.length < count;
    position -= step
  ) {
    positions.splice(1, 0, position);
  }
  return positions;
}

function buildFunctionMask(size: number, version: number): boolean[][] {
  const mask = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  );

  const mark = (sx: number, sy: number, width: number, height: number): void => {
    for (let y = Math.max(0, sy); y < Math.min(size, sy + height); y++) {
      for (let x = Math.max(0, sx); x < Math.min(size, sx + width); x++) {
        mask[y][x] = true;
      }
    }
  };

  mark(0, 0, 9, 9);
  mark(size - 8, 0, 8, 9);
  mark(0, size - 8, 9, 8);

  for (let index = 0; index < size; index++) {
    mask[6][index] = true;
    mask[index][6] = true;
  }

  for (const centerY of alignmentPatternPositions(version)) {
    for (const centerX of alignmentPatternPositions(version)) {
      if (!mask[centerY][centerX]) mark(centerX - 2, centerY - 2, 5, 5);
    }
  }

  for (let index = 0; index < 9; index++) {
    mask[8][index] = true;
    mask[index][8] = true;
  }
  for (let index = 0; index < 8; index++) mask[8][size - 1 - index] = true;
  for (let index = 0; index < 7; index++) mask[size - 1 - index][8] = true;
  mask[size - 8][8] = true;

  if (version >= 7) {
    mark(size - 11, 0, 3, 6);
    mark(0, size - 11, 6, 3);
  }

  return mask;
}

function maskCondition(pattern: number, x: number, y: number): boolean {
  switch (pattern) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return false;
  }
}

function extractCodewords(
  matrix: QrMatrix,
  version: number,
  maskPattern: number
): Uint8Array {
  const functionMask = buildFunctionMask(matrix.size, version);
  const bits: number[] = [];
  let upward = true;

  for (let right = matrix.size - 1; right >= 1; right -= 2) {
    if (right === 6) right--;
    for (let vertical = 0; vertical < matrix.size; vertical++) {
      const y = upward ? matrix.size - 1 - vertical : vertical;
      for (let delta = 0; delta < 2; delta++) {
        const x = right - delta;
        if (!functionMask[y][x]) {
          bits.push(
            matrix.modules[y][x] !== maskCondition(maskPattern, x, y) ? 1 : 0
          );
        }
      }
    }
    upward = !upward;
  }

  const result = new Uint8Array(Math.floor(bits.length / 8));
  for (let index = 0; index < result.length; index++) {
    let value = 0;
    for (let bit = 0; bit < 8; bit++) {
      value = (value << 1) | bits[index * 8 + bit];
    }
    result[index] = value;
  }
  return result;
}

function recoverDataCodewords(
  raw: Uint8Array,
  description: DataBlockDescription
): Uint8Array | null {
  if (raw.length < description.dataCodewords) return null;
  if (description.blocks === 1) return raw.slice(0, description.dataCodewords);
  if (description.dataCodewords % description.blocks !== 0) return null;

  const blockLength = description.dataCodewords / description.blocks;
  const data = new Uint8Array(description.dataCodewords);
  let source = 0;
  for (let index = 0; index < blockLength; index++) {
    for (let block = 0; block < description.blocks; block++) {
      data[block * blockLength + index] = raw[source++];
    }
  }
  return data;
}

class BitReader {
  readonly #bytes: Uint8Array;
  #position = 0;

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
  }

  get remaining(): number {
    return this.#bytes.length * 8 - this.#position;
  }

  read(count: number): number | null {
    if (count < 0 || count > 31 || this.remaining < count) return null;
    let value = 0;
    for (let index = 0; index < count; index++) {
      const byte = this.#bytes[Math.floor(this.#position / 8)];
      value =
        value * 2 + ((byte >>> (7 - (this.#position % 8))) & 1);
      this.#position++;
    }
    return value;
  }
}

function characterCountBits(mode: number, version: number): number | null {
  if (version <= 9) {
    if (mode === 1) return 10;
    if (mode === 2) return 9;
    if (mode === 4) return 8;
    return null;
  }
  if (mode === 1) return version <= 26 ? 12 : 14;
  if (mode === 2) return version <= 26 ? 11 : 13;
  if (mode === 4) return 16;
  return null;
}

function parsePayload(
  data: Uint8Array,
  version: number
): {
  readonly bytes: Uint8Array;
} | null {
  const reader = new BitReader(data);
  const output: number[] = [];

  while (reader.remaining >= 4) {
    const mode = reader.read(4);
    if (mode === null) return null;
    if (mode === 0) break;

    // Structured append and ECI image segments are not qualified by this
    // bounded single-symbol path. Keep the existing public append helpers intact.
    if (mode === 3) return null;

    const countBits = characterCountBits(mode, version);
    if (countBits === null) return null;
    const count = reader.read(countBits);
    if (count === null) return null;

    if (mode === 4) {
      for (let index = 0; index < count; index++) {
        const value = reader.read(8);
        if (value === null) return null;
        output.push(value);
      }
    } else if (mode === 2) {
      let remaining = count;
      while (remaining >= 2) {
        const value = reader.read(11);
        if (value === null) return null;
        const first = Math.floor(value / 45);
        const second = value % 45;
        if (
          first >= ALPHANUMERIC_CHARACTERS.length ||
          second >= ALPHANUMERIC_CHARACTERS.length
        ) {
          return null;
        }
        output.push(...encodeUtf8(ALPHANUMERIC_CHARACTERS[first]));
        output.push(...encodeUtf8(ALPHANUMERIC_CHARACTERS[second]));
        remaining -= 2;
      }
      if (remaining === 1) {
        const value = reader.read(6);
        if (value === null || value >= ALPHANUMERIC_CHARACTERS.length) {
          return null;
        }
        output.push(...encodeUtf8(ALPHANUMERIC_CHARACTERS[value]));
      }
    } else if (mode === 1) {
      let remaining = count;
      while (remaining >= 3) {
        const value = reader.read(10);
        if (value === null || value > 999) return null;
        const text = value.toString().padStart(3, "0");
        output.push(text.charCodeAt(0), text.charCodeAt(1), text.charCodeAt(2));
        remaining -= 3;
      }
      if (remaining === 2) {
        const value = reader.read(7);
        if (value === null || value > 99) return null;
        const text = value.toString().padStart(2, "0");
        output.push(text.charCodeAt(0), text.charCodeAt(1));
      } else if (remaining === 1) {
        const value = reader.read(4);
        if (value === null || value > 9) return null;
        output.push(48 + value);
      }
    }
  }

  const bytes = Uint8Array.from(output);
  return { bytes };
}

export function createDecoderMetadata(
  algorithm: string = 'qrcodes',
  customizations: Readonly<Record<string, unknown>> = {}
): DecoderMetadata {
  return {
    version: '1.0',
    algorithm,
    customizations,
  };
}

export function createStructuredAppendInfo(
  sequenceIndex: number,
  totalCount: number,
  parity: number
): StructuredAppendInfo {
  if (!Number.isInteger(sequenceIndex) || sequenceIndex < 0) {
    throw new Error('sequenceIndex must be a non-negative integer.');
  }
  if (!Number.isInteger(totalCount) || totalCount < 1) {
    throw new Error('totalCount must be a positive integer.');
  }
  if (sequenceIndex >= totalCount) {
    throw new Error('sequenceIndex must be less than totalCount.');
  }
  if (!Number.isInteger(parity) || parity < 0 || parity > 255) {
    throw new Error('parity must be a byte value (0-255).');
  }
  return { sequenceIndex, totalCount, parity };
}

export function createDecodeArtifacts(params: {
  id: string;
  image: Uint8Array;
  errorCorrectionLevel: ErrorCorrectionLevel;
  customizations?: Readonly<Record<string, unknown>>;
  payload: Uint8Array;
  payloadText: string;
  confidence: ConfidenceLevel;
  structuredAppend?: StructuredAppendInfo | null;
}): DecodeArtifacts {
  if (!params.id || params.id.trim() === '') {
    throw new Error('id must be a non-empty string.');
  }
  if (!(params.image instanceof Uint8Array)) {
    throw new Error('image must be a Uint8Array.');
  }
  if (!(params.payload instanceof Uint8Array)) {
    throw new Error('payload must be a Uint8Array.');
  }
  if (!params.payloadText) {
    throw new Error('payloadText must be a non-empty string.');
  }
  const customizations: Readonly<Record<string, unknown>> = params.customizations ?? {};
  return {
    id: params.id,
    image: params.image,
    errorCorrectionLevel: params.errorCorrectionLevel,
    customizations,
    payload: params.payload,
    payloadText: params.payloadText,
    confidence: params.confidence,
    decoderMetadata: createDecoderMetadata('qrcodes', customizations),
    structuredAppend: params.structuredAppend ?? null,
  };
}

export function createDecodingFailure(
  errorType: DecodingErrorType,
  stage: DecodingStage
): DecodingFailure {
  return {
    success: false,
    errorType,
    stage,
    payload: null,
  };
}

export function createDecodingSuccess(params: {
  payloadText: string;
  payloadBytes: Uint8Array;
  confidence: ConfidenceLevel;
  decoderMetadata: DecoderMetadata;
}): DecodingSuccess {
  return {
    success: true,
    payloadText: params.payloadText,
    payloadBytes: params.payloadBytes,
    confidence: params.confidence,
    decoderMetadata: params.decoderMetadata,
  };
}

/**
 * Bounded, stateless opaque-PNG image decoding derived from the retained 92ba820 edition.
 * Supports the retained versions 1–4 numeric/alphanumeric/UTF-8 byte path only.
 * No ECI/structured append, parity repair/verification, rotation, camera or
 * calibrated confidence is claimed. Existing artifact/round-trip helpers are separate.
 * Invalid core chunk layout/unsupported modes refuse; unknown ancillary chunks
 * are ignored. Encoded input is limited to 16 MiB,
 * dimensions to 4096 each and total pixels to 4 Mi. CRC validation is not provided.
 */
export function decode(
  imageData: Uint8Array,
  options?: DecodingOptions
): DecodingResult {
  if (!(imageData instanceof Uint8Array) || imageData.length === 0) {
    return createDecodingFailure("invalid_image_data", "input_validation");
  }

  const image = parsePng(imageData);
  if (image === null) {
    return createDecodingFailure("invalid_image_data", "image_preprocessing");
  }

  const matrix = detectQrMatrix(image);
  if (matrix === null) {
    return createDecodingFailure("no_qr_found", "symbol_detection");
  }

  const version = (matrix.size - 17) / 4;
  if (!Number.isInteger(version) || version < 1 || version > 40) {
    return createDecodingFailure("unsupported_version", "format_decoding");
  }

  const format = readFormatInformation(matrix);
  if (format === null) {
    return createDecodingFailure("decode_failure", "format_decoding");
  }

  const versionDescriptions = DATA_BLOCKS[version];
  if (versionDescriptions === undefined) {
    return createDecodingFailure("unsupported_version", "data_extraction");
  }

  const rawCodewords = extractCodewords(matrix, version, format.mask);
  const dataCodewords = recoverDataCodewords(
    rawCodewords,
    versionDescriptions[format.level]
  );
  if (dataCodewords === null) {
    return createDecodingFailure("ecc_failure", "error_correction");
  }

  const parsed = parsePayload(dataCodewords, version);
  if (parsed === null) {
    return createDecodingFailure("decode_failure", "data_extraction");
  }

  let payloadText: string;
  try {
    payloadText = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(parsed.bytes);
  } catch {
    return createDecodingFailure("decode_failure", "data_extraction");
  }

  const customizations = options?.customizations ?? {};
  return createDecodingSuccess({
    payloadText,
    payloadBytes: parsed.bytes,
    confidence: "low", // No calibrated confidence or parity repair is asserted.
    decoderMetadata: {
      version: "1.0",
      algorithm: "qr-matrix",
      customizations,
      qrVersion: version,
      errorCorrectionLevel: format.level,
      maskPattern: format.mask,
    },
  });
}

export function readStructuredAppendSequence(
  artifacts: readonly DecodeArtifacts[]
): readonly StructuredAppendInfo[] {
  return artifacts.map((a) => {
    if (a.structuredAppend === null) {
      throw new Error(
        `Artifact for ECC level ${a.errorCorrectionLevel} has no structured-append information.`
      );
    }
    return a.structuredAppend;
  });
}

export interface DecodingPresentation {
  readonly payloadText: string;
  readonly payloadBytes: Uint8Array;
  readonly confidence: ConfidenceLevel;
  readonly decoderMetadata: DecoderMetadata;
  readonly isLowConfidence: boolean;
}

export function presentDecodingResult(
  result: DecodingResult
): DecodingPresentation | { readonly errorType: DecodingErrorType; readonly stage: DecodingStage } {
  if (result.success === true) {
    return {
      payloadText: result.payloadText,
      payloadBytes: result.payloadBytes,
      confidence: result.confidence,
      decoderMetadata: result.decoderMetadata,
      isLowConfidence: result.confidence === 'low',
    };
  }
  return { errorType: result.errorType, stage: result.stage };
}

export function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function createRoundTripVector(params: {
  id: string;
  errorCorrectionLevel: ErrorCorrectionLevel;
  customizations?: Readonly<Record<string, unknown>>;
  payloadText: string;
}): RoundTripVector {
  if (!params.id || params.id.trim() === '') {
    throw new Error('Vector id must be a non-empty string.');
  }
  if (!params.payloadText) {
    throw new Error('payloadText must be a non-empty string.');
  }
  const payload = encodeUtf8(params.payloadText);
  return {
    id: params.id,
    errorCorrectionLevel: params.errorCorrectionLevel,
    customizations: params.customizations ?? {},
    payload,
    payloadText: params.payloadText,
  };
}

export function buildRoundTripVectors(
  payloads: readonly string[]
): readonly RoundTripVector[] {
  const customizations: Readonly<Record<string, unknown>>[] = [
    {},
    { logoOverlay: true },
    { maskPattern: 4 },
  ];
  const vectors: RoundTripVector[] = [];
  for (const payloadText of payloads) {
    for (const level of ERROR_CORRECTION_LEVELS) {
      for (const customization of customizations) {
        const customKey = JSON.stringify(customization);
        vectors.push(
          createRoundTripVector({
            id: `${level}-${payloadText}-${customKey}`,
            errorCorrectionLevel: level,
            customizations: customization,
            payloadText,
          })
        );
      }
    }
  }
  return vectors;
}

export function verifyRoundTripVector(
  vector: RoundTripVector,
  decodedPayload: Uint8Array
): RoundTripResult {
  const mismatches: string[] = [];
  if (!(decodedPayload instanceof Uint8Array)) {
    mismatches.push('decoded payload is not a Uint8Array');
    return {
      vectorId: vector.id,
      passed: false,
      mismatches,
    };
  }
  if (decodedPayload.length !== vector.payload.length) {
    mismatches.push('length mismatch');
  } else {
    let byteMismatches = 0;
    for (let i = 0; i < vector.payload.length; i++) {
      if (decodedPayload[i] !== vector.payload[i]) {
        byteMismatches++;
        if (byteMismatches > 5) {
          break;
        }
      }
    }
    if (byteMismatches > 0) {
      mismatches.push(`byte mismatches: ${byteMismatches}`);
    }
  }
  try {
    const decodedText = decodeUtf8(decodedPayload);
    if (decodedText !== vector.payloadText) {
      mismatches.push('text mismatch');
    }
  } catch {
    mismatches.push('utf-8 decode failure');
  }
  return {
    vectorId: vector.id,
    passed: mismatches.length === 0,
    mismatches,
  };
}

export function runRoundTripValidation(
  vectors: readonly RoundTripVector[],
  decodePayload: (vector: RoundTripVector) => Uint8Array
): RoundTripReport {
  const results: RoundTripResult[] = [];
  let passed = 0;
  for (const vector of vectors) {
    const decoded = decodePayload(vector);
    const result = verifyRoundTripVector(vector, decoded);
    results.push(result);
    if (result.passed) {
      passed++;
    }
  }
  return {
    total: vectors.length,
    passed,
    failed: vectors.length - passed,
    results,
  };
}

export function runRoundTripValidationWithResult(
  vectors: readonly RoundTripVector[],
  decodePayload: (vector: RoundTripVector) => DecodingResult
): RoundTripReport {
  const results: RoundTripResult[] = [];
  let passed = 0;
  for (const vector of vectors) {
    const result = decodePayload(vector);
    const mismatches: string[] = [];
    if (result.success === false) {
      mismatches.push(`decode failure: ${result.errorType} at ${result.stage}`);
    } else {
      const byteCheck = verifyRoundTripVector(vector, result.payloadBytes);
      if (!byteCheck.passed) {
        for (const m of byteCheck.mismatches) {
          mismatches.push(m);
        }
      }
      if (result.payloadText !== vector.payloadText) {
        mismatches.push('text mismatch');
      }
    }
    const r: RoundTripResult = {
      vectorId: vector.id,
      passed: mismatches.length === 0,
      mismatches,
    };
    results.push(r);
    if (r.passed) {
      passed++;
    }
  }
  return {
    total: vectors.length,
    passed,
    failed: vectors.length - passed,
    results,
  };
}

export function confidenceFromScore(score: number): ConfidenceLevel {
  if (!Number.isFinite(score)) {
    return 'low';
  }
  if (score < 0) {
    return 'low';
  }
  if (score >= 0.9) {
    return 'high';
  }
  if (score >= 0.6) {
    return 'medium';
  }
  return 'low';
}

export function createRoundTripDecoder(
  artifacts: ReadonlyMap<string, DecodeArtifacts>
): (vector: RoundTripVector) => DecodingResult {
  return (vector: RoundTripVector): DecodingResult => {
    const artifact = artifacts.get(vector.id);
    if (artifact === undefined) {
      return createDecodingFailure('no_qr_found', 'symbol_detection');
    }
    return createDecodingSuccess({
      payloadText: artifact.payloadText,
      payloadBytes: artifact.payload,
      confidence: artifact.confidence,
      decoderMetadata: artifact.decoderMetadata,
    });
  };
}

export function executeRoundTripValidation(
  vectors: readonly RoundTripVector[],
  artifacts: ReadonlyMap<string, DecodeArtifacts>
): RoundTripReport {
  const decoder = createRoundTripDecoder(artifacts);
  return runRoundTripValidationWithResult(vectors, decoder);
}

export function decodeWithAudit(
  imageData: Uint8Array,
  audit: (result: DecodingResult) => void,
  options?: DecodingOptions
): DecodingResult {
  const result = decode(imageData, options);
  try {
    audit(result);
  } catch {
    return result;
  }
  return result;
}

export function decodeArtifacts(
  artifact: DecodeArtifacts,
  audit: (result: DecodingResult) => void
): DecodingResult {
  const result: DecodingResult = createDecodingSuccess({
    payloadText: artifact.payloadText,
    payloadBytes: artifact.payload,
    confidence: artifact.confidence,
    decoderMetadata: artifact.decoderMetadata,
  });
  let audited = true;
  try {
    audit(result);
  } catch {
    audited = false;
  }
  if (!audited) {
    return createDecodingFailure('decode_failure', 'confidence_assessment');
  }
  return result;
}

export interface RoundTripValidationOptions {
  readonly requireHighConfidence: boolean;
}

export const DEFAULT_ROUND_TRIP_OPTIONS: RoundTripValidationOptions = {
  requireHighConfidence: false,
};

export function validateRoundTripVectors(
  vectors: readonly RoundTripVector[],
  decodePayload: (vector: RoundTripVector) => DecodingResult,
  options: RoundTripValidationOptions = DEFAULT_ROUND_TRIP_OPTIONS
): RoundTripReport {
  const results: RoundTripResult[] = [];
  let passed = 0;
  for (const vector of vectors) {
    const result = decodePayload(vector);
    const mismatches: string[] = [];
    if (result.success === false) {
      mismatches.push(`decode failure: ${result.errorType} at ${result.stage}`);
    } else {
      const byteCheck = verifyRoundTripVector(vector, result.payloadBytes);
      if (!byteCheck.passed) {
        for (const m of byteCheck.mismatches) {
          mismatches.push(m);
        }
      }
      if (result.payloadText !== vector.payloadText) {
        mismatches.push('text mismatch');
      }
      if (options.requireHighConfidence && result.confidence !== 'high') {
        mismatches.push(`confidence not high: ${result.confidence}`);
      }
    }
    const r: RoundTripResult = {
      vectorId: vector.id,
      passed: mismatches.length === 0,
      mismatches,
    };
    results.push(r);
    if (r.passed) {
      passed++;
    }
  }
  return {
    total: vectors.length,
    passed,
    failed: vectors.length - passed,
    results,
  };
}

export function assertRoundTripPasses(
  vectors: readonly RoundTripVector[],
  decodePayload: (vector: RoundTripVector) => DecodingResult,
  options: RoundTripValidationOptions = DEFAULT_ROUND_TRIP_OPTIONS
): RoundTripReport {
  return validateRoundTripVectors(vectors, decodePayload, options);
}

export function createArtifactsRegistry(
  artifacts: readonly DecodeArtifacts[]
): ReadonlyMap<string, DecodeArtifacts> {
  const map = new Map<string, DecodeArtifacts>();
  for (const artifact of artifacts) {
    map.set(artifact.id, artifact);
  }
  return map;
}

export function runFullRoundTripValidation(
  payloads: readonly string[],
  artifacts: readonly DecodeArtifacts[]
): RoundTripReport {
  const vectors = buildRoundTripVectors(payloads);
  const registry = new Map<string, DecodeArtifacts>();
  for (const artifact of artifacts) {
    registry.set(artifact.id, artifact);
  }
  const decoder = createRoundTripDecoder(registry);
  return runRoundTripValidationWithResult(vectors, decoder);
}
