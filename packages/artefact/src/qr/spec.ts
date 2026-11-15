// ISO/IEC 18004 structural constants and derived geometry.
//
// The two tables below are specification data: error-correction codewords per
// block and block count, indexed by error-correction level and version. Every
// other capacity figure in this file is derived from them arithmetically rather
// than transcribed, so there is one place to be wrong instead of forty.

export type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";

export const ERROR_CORRECTION_LEVELS: readonly ErrorCorrectionLevel[] = ["L", "M", "Q", "H"];

/** Format-information bit pattern per level; deliberately not the array order. */
const FORMAT_BITS: Record<ErrorCorrectionLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

const ECC_CODEWORDS_PER_BLOCK: Record<ErrorCorrectionLevel, readonly number[]> = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};

const NUM_ERROR_CORRECTION_BLOCKS: Record<ErrorCorrectionLevel, readonly number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

export const MIN_VERSION = 1;
export const MAX_VERSION = 40;

export function symbolSize(version: number): number {
  return version * 4 + 17;
}

/** Total modules available to data and EC codewords, before remainder bits. */
export function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alignmentCount = Math.floor(version / 7) + 2;
    result -= (25 * alignmentCount - 10) * alignmentCount - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

export function totalCodewords(version: number): number {
  return Math.floor(rawDataModules(version) / 8);
}

export function eccCodewordsPerBlock(version: number, level: ErrorCorrectionLevel): number {
  return ECC_CODEWORDS_PER_BLOCK[level][version] as number;
}

export function blockCount(version: number, level: ErrorCorrectionLevel): number {
  return NUM_ERROR_CORRECTION_BLOCKS[level][version] as number;
}

/** Data codewords available at a version and level, after EC is reserved. */
export function dataCodewords(version: number, level: ErrorCorrectionLevel): number {
  return totalCodewords(version) - eccCodewordsPerBlock(version, level) * blockCount(version, level);
}

export function dataCapacityBits(version: number, level: ErrorCorrectionLevel): number {
  return dataCodewords(version, level) * 8;
}

export interface BlockLayout {
  readonly blocks: number;
  readonly ecPerBlock: number;
  readonly shortBlockDataLength: number;
  readonly shortBlockCount: number;
}

/**
 * Split the data codewords across blocks. The specification uses at most two
 * block sizes differing by one codeword; the short blocks come first.
 */
export function blockLayout(version: number, level: ErrorCorrectionLevel): BlockLayout {
  const blocks = blockCount(version, level);
  const ecPerBlock = eccCodewordsPerBlock(version, level);
  const data = dataCodewords(version, level);
  const shortBlockDataLength = Math.floor(data / blocks);
  const shortBlockCount = blocks - (data % blocks);
  return { blocks, ecPerBlock, shortBlockDataLength, shortBlockCount };
}

/** Alignment-pattern centre coordinates, ascending. Empty for version 1. */
export function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const size = symbolSize(version);
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const positions = [6];
  for (let position = size - 7; positions.length < count; position -= step) {
    positions.splice(1, 0, position);
  }
  return positions;
}

/** 15-bit format information: 5 data bits, BCH(15,5) remainder, then masked. */
export function formatInformation(level: ErrorCorrectionLevel, mask: number): number {
  const data = (FORMAT_BITS[level] << 3) | mask;
  let remainder = data;
  for (let index = 0; index < 10; index += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }
  return ((data << 10) | remainder) ^ 0x5412;
}

/** Recover level and mask from a 15-bit format field, correcting up to 3 bits. */
export function decodeFormatInformation(bits: number): { level: ErrorCorrectionLevel; mask: number } | undefined {
  let bestData = -1;
  let bestDistance = 32;
  for (let data = 0; data < 32; data += 1) {
    const candidate = formatInformation(levelForFormatBits(data >> 3), data & 7);
    const distance = popcount(candidate ^ bits);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestData = data;
    }
  }
  if (bestDistance > 3 || bestData < 0) return undefined;
  return { level: levelForFormatBits(bestData >> 3), mask: bestData & 7 };
}

function levelForFormatBits(value: number): ErrorCorrectionLevel {
  for (const level of ERROR_CORRECTION_LEVELS) {
    if (FORMAT_BITS[level] === value) return level;
  }
  throw new Error("QR_FORMAT_LEVEL_INVALID");
}

/** 18-bit version information, present only from version 7. */
export function versionInformation(version: number): number {
  let remainder = version;
  for (let index = 0; index < 12; index += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  }
  return (version << 12) | remainder;
}

function popcount(value: number): number {
  let count = 0;
  let remaining = value;
  while (remaining !== 0) {
    remaining &= remaining - 1;
    count += 1;
  }
  return count;
}

/** Character-count indicator width, which changes at versions 10 and 27. */
export function characterCountBits(version: number, mode: "numeric" | "alphanumeric" | "byte"): number {
  const group = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  if (mode === "numeric") return [10, 12, 14][group] as number;
  if (mode === "alphanumeric") return [9, 11, 13][group] as number;
  return [8, 16, 16][group] as number;
}

export const MODE_INDICATOR = { numeric: 1, alphanumeric: 2, byte: 4 } as const;

export const ALPHANUMERIC_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
