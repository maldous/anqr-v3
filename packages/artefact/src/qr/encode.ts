import { encodeBlock } from "./reed-solomon.ts";
import {
  ALPHANUMERIC_CHARSET,
  MAX_VERSION,
  MIN_VERSION,
  MODE_INDICATOR,
  blockLayout,
  characterCountBits,
  dataCapacityBits,
  type ErrorCorrectionLevel,
} from "./spec.ts";

// Data encoding: segment mode selection, bit assembly, padding, block splitting
// and Reed-Solomon interleaving. The output is the final codeword sequence in
// the order the module placer consumes it.

export type SegmentMode = "numeric" | "alphanumeric" | "byte";

export interface Segment {
  readonly mode: SegmentMode;
  readonly characterCount: number;
  readonly bits: readonly number[];
}

class BitBuffer {
  private readonly bits: number[] = [];

  append(value: number, width: number): void {
    if (width < 0 || width > 31 || value >>> width !== 0) throw new Error("QR_BIT_APPEND_INVALID");
    for (let index = width - 1; index >= 0; index -= 1) this.bits.push((value >>> index) & 1);
  }

  appendBits(values: readonly number[]): void {
    for (const bit of values) this.bits.push(bit);
  }

  get length(): number {
    return this.bits.length;
  }

  toBits(): number[] {
    return [...this.bits];
  }
}

const NUMERIC_PATTERN = /^[0-9]*$/;
const ALPHANUMERIC_PATTERN = /^[0-9A-Z $%*+\-./:]*$/;

/** Cheapest single mode that can represent the whole string. */
export function selectMode(text: string): SegmentMode {
  if (NUMERIC_PATTERN.test(text)) return "numeric";
  if (ALPHANUMERIC_PATTERN.test(text)) return "alphanumeric";
  return "byte";
}

export function makeSegment(text: string, mode: SegmentMode = selectMode(text)): Segment {
  const buffer = new BitBuffer();
  if (mode === "numeric") {
    if (!NUMERIC_PATTERN.test(text)) throw new Error("QR_SEGMENT_MODE_MISMATCH");
    for (let index = 0; index < text.length; index += 3) {
      const chunk = text.slice(index, index + 3);
      buffer.append(Number(chunk), chunk.length * 3 + 1);
    }
    return { mode, characterCount: text.length, bits: buffer.toBits() };
  }
  if (mode === "alphanumeric") {
    if (!ALPHANUMERIC_PATTERN.test(text)) throw new Error("QR_SEGMENT_MODE_MISMATCH");
    for (let index = 0; index < text.length; index += 2) {
      const first = ALPHANUMERIC_CHARSET.indexOf(text[index] as string);
      if (index + 1 === text.length) {
        buffer.append(first, 6);
      } else {
        const second = ALPHANUMERIC_CHARSET.indexOf(text[index + 1] as string);
        buffer.append(first * 45 + second, 11);
      }
    }
    return { mode, characterCount: text.length, bits: buffer.toBits() };
  }
  const bytes = new TextEncoder().encode(text);
  for (const byte of bytes) buffer.append(byte, 8);
  return { mode, characterCount: bytes.length, bits: buffer.toBits() };
}

function segmentBitLength(segment: Segment, version: number): number {
  return 4 + characterCountBits(version, segment.mode) + segment.bits.length;
}

/** Smallest version at or above `minimumVersion` that holds the segment. */
export function selectVersion(segment: Segment, level: ErrorCorrectionLevel, minimumVersion = MIN_VERSION): number {
  for (let version = Math.max(MIN_VERSION, minimumVersion); version <= MAX_VERSION; version += 1) {
    if (segmentBitLength(segment, version) <= dataCapacityBits(version, level)) return version;
  }
  throw new Error("QR_PAYLOAD_TOO_LARGE");
}

/** Data codewords with mode header, terminator, byte alignment and pad bytes. */
export function dataCodewordStream(segment: Segment, version: number, level: ErrorCorrectionLevel): Uint8Array {
  const capacityBits = dataCapacityBits(version, level);
  const required = segmentBitLength(segment, version);
  if (required > capacityBits) throw new Error("QR_PAYLOAD_TOO_LARGE");

  const buffer = new BitBuffer();
  buffer.append(MODE_INDICATOR[segment.mode], 4);
  buffer.append(segment.characterCount, characterCountBits(version, segment.mode));
  buffer.appendBits(segment.bits);

  const terminator = Math.min(4, capacityBits - buffer.length);
  buffer.append(0, terminator);
  const alignment = (8 - (buffer.length % 8)) % 8;
  buffer.append(0, alignment);

  const bits = buffer.toBits();
  const codewords = new Uint8Array(capacityBits / 8);
  for (let index = 0; index < bits.length; index += 8) {
    let byte = 0;
    for (let offset = 0; offset < 8; offset += 1) byte = (byte << 1) | (bits[index + offset] as number);
    codewords[index / 8] = byte;
  }
  // Alternating pad bytes fill the remainder, per the specification.
  for (let index = bits.length / 8, alternate = 0; index < codewords.length; index += 1, alternate += 1) {
    codewords[index] = alternate % 2 === 0 ? 0xec : 0x11;
  }
  return codewords;
}

/** Split into blocks, add EC per block, then interleave data and EC. */
export function interleaveCodewords(data: Uint8Array, version: number, level: ErrorCorrectionLevel): Uint8Array {
  const layout = blockLayout(version, level);
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];

  let offset = 0;
  for (let index = 0; index < layout.blocks; index += 1) {
    const length = layout.shortBlockDataLength + (index < layout.shortBlockCount ? 0 : 1);
    const block = data.slice(offset, offset + length);
    offset += length;
    dataBlocks.push(block);
    ecBlocks.push(encodeBlock(block, layout.ecPerBlock));
  }
  if (offset !== data.length) throw new Error("QR_BLOCK_SPLIT_INCONSISTENT");

  const result: number[] = [];
  const longestData = layout.shortBlockDataLength + 1;
  for (let position = 0; position < longestData; position += 1) {
    for (const block of dataBlocks) {
      if (position < block.length) result.push(block[position] as number);
    }
  }
  for (let position = 0; position < layout.ecPerBlock; position += 1) {
    for (const block of ecBlocks) result.push(block[position] as number);
  }
  return new Uint8Array(result);
}

export interface EncodedPayload {
  readonly codewords: Uint8Array;
  readonly version: number;
  readonly level: ErrorCorrectionLevel;
  readonly mode: SegmentMode;
  readonly characterCount: number;
}

export interface EncodeOptions {
  readonly level?: ErrorCorrectionLevel;
  readonly minimumVersion?: number;
  readonly mode?: SegmentMode;
}

/** Encode text to the final interleaved codeword sequence. */
export function encodePayload(text: string, options: EncodeOptions = {}): EncodedPayload {
  const level = options.level ?? "M";
  const segment = makeSegment(text, options.mode ?? selectMode(text));
  const version = selectVersion(segment, level, options.minimumVersion);
  const data = dataCodewordStream(segment, version, level);
  return {
    codewords: interleaveCodewords(data, version, level),
    version,
    level,
    mode: segment.mode,
    characterCount: segment.characterCount,
  };
}
