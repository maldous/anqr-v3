import {
  alignmentPositions,
  formatInformation,
  symbolSize,
  totalCodewords,
  versionInformation,
  type ErrorCorrectionLevel,
} from "./spec.ts";

// Symbol geometry: function patterns, codeword placement, masking and the
// penalty score that selects a mask. `functionModule` is the single source of
// truth for "is this module reserved", used by both the placer and the decoder
// so the two can never disagree about which modules carry data.

export type ModuleGrid = Uint8Array;

export interface Symbol {
  readonly size: number;
  readonly version: number;
  readonly level: ErrorCorrectionLevel;
  readonly mask: number;
  /** Row-major, one byte per module, 1 = dark. */
  readonly modules: ModuleGrid;
}

export function moduleAt(modules: ModuleGrid, size: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= size || y >= size) return 0;
  return modules[y * size + x] as number;
}

function setModule(modules: ModuleGrid, size: number, x: number, y: number, dark: number): void {
  modules[y * size + x] = dark;
}

/** True when (x, y) is reserved by a function pattern or an info field. */
export function functionModule(version: number, x: number, y: number): boolean {
  const size = symbolSize(version);

  // Finder patterns with their separators: three 8x8 reserved corners.
  if (x < 9 && y < 9) return true;
  if (x >= size - 8 && y < 9) return true;
  if (x < 9 && y >= size - 8) return true;

  // Timing patterns.
  if (y === 6 || x === 6) return true;

  // Version information blocks, present from version 7.
  if (version >= 7) {
    if (x < 6 && y >= size - 11 && y < size - 8) return true;
    if (y < 6 && x >= size - 11 && x < size - 8) return true;
  }

  // Alignment patterns, excluding the centres that collide with finders.
  const positions = alignmentPositions(version);
  const last = positions.length - 1;
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = 0; j < positions.length; j += 1) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      const cx = positions[i] as number;
      const cy = positions[j] as number;
      if (Math.abs(x - cx) <= 2 && Math.abs(y - cy) <= 2) return true;
    }
  }
  return false;
}

function drawFinder(modules: ModuleGrid, size: number, cx: number, cy: number): void {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setModule(modules, size, x, y, distance === 2 || distance === 4 ? 0 : 1);
    }
  }
}

function drawAlignment(modules: ModuleGrid, size: number, cx: number, cy: number): void {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setModule(modules, size, cx + dx, cy + dy, distance === 1 ? 0 : 1);
    }
  }
}

function drawFunctionPatterns(modules: ModuleGrid, version: number): void {
  const size = symbolSize(version);

  for (let index = 0; index < size; index += 1) {
    const dark = index % 2 === 0 ? 1 : 0;
    setModule(modules, size, index, 6, dark);
    setModule(modules, size, 6, index, dark);
  }

  drawFinder(modules, size, 3, 3);
  drawFinder(modules, size, size - 4, 3);
  drawFinder(modules, size, 3, size - 4);

  const positions = alignmentPositions(version);
  const last = positions.length - 1;
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = 0; j < positions.length; j += 1) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      drawAlignment(modules, size, positions[i] as number, positions[j] as number);
    }
  }

  // The dark module is fixed and is not part of any pattern.
  setModule(modules, size, 8, size - 8, 1);
}

function drawFormatInformation(modules: ModuleGrid, version: number, level: ErrorCorrectionLevel, mask: number): void {
  const size = symbolSize(version);
  const bits = formatInformation(level, mask);

  // First copy: around the top-left finder, skipping the timing row and column.
  for (let index = 0; index <= 5; index += 1) setModule(modules, size, 8, index, (bits >>> index) & 1);
  setModule(modules, size, 8, 7, (bits >>> 6) & 1);
  setModule(modules, size, 8, 8, (bits >>> 7) & 1);
  setModule(modules, size, 7, 8, (bits >>> 8) & 1);
  for (let index = 9; index < 15; index += 1) setModule(modules, size, 14 - index, 8, (bits >>> index) & 1);

  // Second copy: split between the other two finders.
  for (let index = 0; index < 8; index += 1) setModule(modules, size, size - 1 - index, 8, (bits >>> index) & 1);
  for (let index = 8; index < 15; index += 1) setModule(modules, size, 8, size - 15 + index, (bits >>> index) & 1);
}

function drawVersionInformation(modules: ModuleGrid, version: number): void {
  if (version < 7) return;
  const size = symbolSize(version);
  const bits = versionInformation(version);
  for (let index = 0; index < 18; index += 1) {
    const bit = (bits >>> index) & 1;
    const a = Math.floor(index / 3);
    const b = (index % 3) + size - 11;
    setModule(modules, size, a, b, bit);
    setModule(modules, size, b, a, bit);
  }
}

/** The eight standard mask conditions. True means invert this module. */
export function maskCondition(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: throw new Error("QR_MASK_INVALID");
  }
}

/** Place codewords along the standard upward/downward two-module columns. */
function placeCodewords(modules: ModuleGrid, version: number, codewords: Uint8Array): void {
  const size = symbolSize(version);
  if (codewords.length !== totalCodewords(version)) throw new Error("QR_CODEWORD_COUNT_MISMATCH");

  let bitIndex = 0;
  // The vertical timing column at x=6 is skipped by moving the cursor itself,
  // not by shifting one pair: computing a local column would revisit x=4 and
  // never reach x=0, corrupting one codeword that error correction then hides.
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step += 1) {
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? size - 1 - step : step;
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        if (functionModule(version, x, y)) continue;
        // Remainder bits beyond the codeword stream stay light.
        const bit = bitIndex < codewords.length * 8
          ? ((codewords[bitIndex >>> 3] as number) >>> (7 - (bitIndex & 7))) & 1
          : 0;
        setModule(modules, size, x, y, bit);
        bitIndex += 1;
      }
    }
  }
}

function applyMask(modules: ModuleGrid, version: number, mask: number): void {
  const size = symbolSize(version);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (functionModule(version, x, y)) continue;
      if (maskCondition(mask, x, y)) modules[y * size + x] ^= 1;
    }
  }
}

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

/** Standard four-rule mask penalty. Lower is better. */
export function penaltyScore(modules: ModuleGrid, size: number): number {
  let score = 0;

  // Rule 1: runs of five or more same-coloured modules in a line.
  for (let y = 0; y < size; y += 1) {
    let runColour = -1;
    let runLength = 0;
    for (let x = 0; x < size; x += 1) {
      const value = moduleAt(modules, size, x, y);
      if (value === runColour) {
        runLength += 1;
        if (runLength === 5) score += PENALTY_N1;
        else if (runLength > 5) score += 1;
      } else {
        runColour = value;
        runLength = 1;
      }
    }
  }
  for (let x = 0; x < size; x += 1) {
    let runColour = -1;
    let runLength = 0;
    for (let y = 0; y < size; y += 1) {
      const value = moduleAt(modules, size, x, y);
      if (value === runColour) {
        runLength += 1;
        if (runLength === 5) score += PENALTY_N1;
        else if (runLength > 5) score += 1;
      } else {
        runColour = value;
        runLength = 1;
      }
    }
  }

  // Rule 2: 2x2 blocks of one colour.
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const value = moduleAt(modules, size, x, y);
      if (
        value === moduleAt(modules, size, x + 1, y) &&
        value === moduleAt(modules, size, x, y + 1) &&
        value === moduleAt(modules, size, x + 1, y + 1)
      ) score += PENALTY_N2;
    }
  }

  // Rule 3: the 1:1:3:1:1 finder-like pattern with four light modules beside it.
  const finderPattern = [1, 0, 1, 1, 1, 0, 1];
  const matches = (get: (index: number) => number, start: number, length: number): boolean => {
    for (let index = 0; index < 7; index += 1) {
      if (get(start + index) !== finderPattern[index]) return false;
    }
    const beforeClear = start - 4 < 0 || [0, 1, 2, 3].every((offset) => get(start - 1 - offset) === 0);
    const afterClear = start + 10 > length || [0, 1, 2, 3].every((offset) => get(start + 7 + offset) === 0);
    return beforeClear || afterClear;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x <= size - 7; x += 1) {
      if (matches((index) => moduleAt(modules, size, index, y), x, size)) score += PENALTY_N3;
    }
  }
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y <= size - 7; y += 1) {
      if (matches((index) => moduleAt(modules, size, x, index), y, size)) score += PENALTY_N3;
    }
  }

  // Rule 4: deviation of dark-module proportion from one half.
  let dark = 0;
  for (let index = 0; index < size * size; index += 1) dark += modules[index] as number;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * PENALTY_N4;

  return score;
}

export interface BuildOptions {
  /** 0-7 to force a mask, or "auto" to select by penalty score. */
  readonly mask?: number | "auto";
}

/** Build the complete masked symbol from interleaved codewords. */
export function buildSymbol(
  codewords: Uint8Array,
  version: number,
  level: ErrorCorrectionLevel,
  options: BuildOptions = {},
): Symbol {
  const size = symbolSize(version);
  const requested = options.mask ?? "auto";

  const render = (mask: number): ModuleGrid => {
    const modules = new Uint8Array(size * size);
    drawFunctionPatterns(modules, version);
    drawVersionInformation(modules, version);
    placeCodewords(modules, version, codewords);
    applyMask(modules, version, mask);
    drawFormatInformation(modules, version, level, mask);
    return modules;
  };

  if (requested !== "auto") {
    if (!Number.isInteger(requested) || requested < 0 || requested > 7) throw new Error("QR_MASK_INVALID");
    return { size, version, level, mask: requested, modules: render(requested) };
  }

  let bestMask = 0;
  let bestModules = render(0);
  let bestScore = penaltyScore(bestModules, size);
  for (let mask = 1; mask < 8; mask += 1) {
    const modules = render(mask);
    const score = penaltyScore(modules, size);
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
      bestModules = modules;
    }
  }
  return { size, version, level, mask: bestMask, modules: bestModules };
}
