import { decodeBlock } from "./reed-solomon.ts";
import {
  ALPHANUMERIC_CHARSET,
  blockLayout,
  characterCountBits,
  decodeFormatInformation,
  symbolSize,
  totalCodewords,
  type ErrorCorrectionLevel,
} from "./spec.ts";
import { functionModule, maskCondition, moduleAt, type ModuleGrid } from "./matrix.ts";

// Independent decoder. It shares only geometry and specification constants with
// the encoder, and re-derives version, format, mask, block layout and payload
// from the module grid alone. That independence is what makes a round-trip test
// evidence rather than a tautology.

export interface DecodedSymbol {
  readonly text: string;
  readonly version: number;
  readonly level: ErrorCorrectionLevel;
  readonly mask: number;
  readonly mode: "numeric" | "alphanumeric" | "byte";
  readonly errorsCorrected: number;
}

function readFormatBits(modules: ModuleGrid, size: number): number {
  let bits = 0;
  for (let index = 0; index <= 5; index += 1) bits |= moduleAt(modules, size, 8, index) << index;
  bits |= moduleAt(modules, size, 8, 7) << 6;
  bits |= moduleAt(modules, size, 8, 8) << 7;
  bits |= moduleAt(modules, size, 7, 8) << 8;
  for (let index = 9; index < 15; index += 1) bits |= moduleAt(modules, size, 14 - index, 8) << index;
  return bits;
}

function readSecondFormatBits(modules: ModuleGrid, size: number): number {
  let bits = 0;
  for (let index = 0; index < 8; index += 1) bits |= moduleAt(modules, size, size - 1 - index, 8) << index;
  for (let index = 8; index < 15; index += 1) bits |= moduleAt(modules, size, 8, size - 15 + index) << index;
  return bits;
}

/** Read data modules in placement order, undoing the mask. */
function readCodewords(modules: ModuleGrid, version: number, mask: number): Uint8Array {
  const size = symbolSize(version);
  const expected = totalCodewords(version);
  const codewords = new Uint8Array(expected);
  let bitIndex = 0;

  // Must mirror placeCodewords exactly, including the x=6 cursor skip.
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step += 1) {
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? size - 1 - step : step;
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        if (functionModule(version, x, y)) continue;
        if (bitIndex < expected * 8) {
          const raw = moduleAt(modules, size, x, y);
          const bit = maskCondition(mask, x, y) ? raw ^ 1 : raw;
          if (bit) codewords[bitIndex >>> 3] |= 1 << (7 - (bitIndex & 7));
        }
        bitIndex += 1;
      }
    }
  }
  return codewords;
}

/** Undo interleaving, then RS-decode each block back to data codewords. */
function deinterleaveAndCorrect(
  codewords: Uint8Array,
  version: number,
  level: ErrorCorrectionLevel,
): { data: Uint8Array; errorsCorrected: number } {
  const layout = blockLayout(version, level);
  const lengths: number[] = [];
  for (let index = 0; index < layout.blocks; index += 1) {
    lengths.push(layout.shortBlockDataLength + (index < layout.shortBlockCount ? 0 : 1));
  }

  const dataBlocks: number[][] = lengths.map(() => []);
  let cursor = 0;
  const longestData = layout.shortBlockDataLength + 1;
  for (let position = 0; position < longestData; position += 1) {
    for (let block = 0; block < layout.blocks; block += 1) {
      if (position < (lengths[block] as number)) {
        (dataBlocks[block] as number[]).push(codewords[cursor] as number);
        cursor += 1;
      }
    }
  }

  const ecBlocks: number[][] = lengths.map(() => []);
  for (let position = 0; position < layout.ecPerBlock; position += 1) {
    for (let block = 0; block < layout.blocks; block += 1) {
      (ecBlocks[block] as number[]).push(codewords[cursor] as number);
      cursor += 1;
    }
  }

  const result: number[] = [];
  let errorsCorrected = 0;
  for (let block = 0; block < layout.blocks; block += 1) {
    const received = new Uint8Array([...(dataBlocks[block] as number[]), ...(ecBlocks[block] as number[])]);
    const decoded = decodeBlock(received, layout.ecPerBlock);
    errorsCorrected += decoded.errorsCorrected;
    for (const byte of decoded.data) result.push(byte);
  }
  return { data: new Uint8Array(result), errorsCorrected };
}

class BitReader {
  private position = 0;
  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  read(width: number): number {
    if (this.position + width > this.bytes.length * 8) throw new Error("QR_BITSTREAM_EXHAUSTED");
    let value = 0;
    for (let index = 0; index < width; index += 1) {
      const bitIndex = this.position + index;
      const bit = ((this.bytes[bitIndex >>> 3] as number) >>> (7 - (bitIndex & 7))) & 1;
      value = (value << 1) | bit;
    }
    this.position += width;
    return value;
  }
}

function decodeSegments(data: Uint8Array, version: number): { text: string; mode: DecodedSymbol["mode"] } {
  const reader = new BitReader(data);
  const mode = reader.read(4);

  if (mode === 1) {
    const count = reader.read(characterCountBits(version, "numeric"));
    let text = "";
    let remaining = count;
    while (remaining >= 3) {
      text += String(reader.read(10)).padStart(3, "0");
      remaining -= 3;
    }
    if (remaining === 2) text += String(reader.read(7)).padStart(2, "0");
    else if (remaining === 1) text += String(reader.read(4));
    return { text, mode: "numeric" };
  }

  if (mode === 2) {
    const count = reader.read(characterCountBits(version, "alphanumeric"));
    let text = "";
    let remaining = count;
    while (remaining >= 2) {
      const pair = reader.read(11);
      text += ALPHANUMERIC_CHARSET[Math.floor(pair / 45)];
      text += ALPHANUMERIC_CHARSET[pair % 45];
      remaining -= 2;
    }
    if (remaining === 1) text += ALPHANUMERIC_CHARSET[reader.read(6)];
    return { text, mode: "alphanumeric" };
  }

  if (mode === 4) {
    const count = reader.read(characterCountBits(version, "byte"));
    const bytes = new Uint8Array(count);
    for (let index = 0; index < count; index += 1) bytes[index] = reader.read(8);
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), mode: "byte" };
  }

  throw new Error("QR_MODE_UNSUPPORTED");
}

/**
 * Decode a module grid back to its payload. `size` must match a real version,
 * and the format field must be recoverable; both fail closed rather than
 * guessing, because a confidently wrong decode is the worst possible result.
 */
export function decodeSymbol(modules: ModuleGrid, size: number): DecodedSymbol {
  if ((size - 17) % 4 !== 0) throw new Error("QR_SIZE_INVALID");
  const version = (size - 17) / 4;
  if (version < 1 || version > 40) throw new Error("QR_VERSION_INVALID");
  if (modules.length !== size * size) throw new Error("QR_GRID_LENGTH_MISMATCH");

  const format =
    decodeFormatInformation(readFormatBits(modules, size)) ??
    decodeFormatInformation(readSecondFormatBits(modules, size));
  if (!format) throw new Error("QR_FORMAT_UNRECOVERABLE");

  const codewords = readCodewords(modules, version, format.mask);
  const { data, errorsCorrected } = deinterleaveAndCorrect(codewords, version, format.level);
  const { text, mode } = decodeSegments(data, version);

  return { text, version, level: format.level, mask: format.mask, mode, errorsCorrected };
}
