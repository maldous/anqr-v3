// GF(256) arithmetic for QR Reed-Solomon coding.
//
// The field is GF(2^8) modulo the QR-specified primitive polynomial
// x^8 + x^4 + x^3 + x^2 + 1 (0x11D), with 2 as the generator. Log and antilog
// tables are built once at module load so multiplication is two lookups and an
// add; that is the only reason this file exists separately from reed-solomon.ts.

const PRIMITIVE = 0x11d;

const EXP = new Uint8Array(256);
const LOG = new Uint8Array(256);

{
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    EXP[index] = value;
    LOG[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= PRIMITIVE;
  }
  EXP[255] = EXP[0];
}

/** Multiply two field elements. Zero is absorbing; everything else adds logs. */
export function gfMultiply(left: number, right: number): number {
  if (left === 0 || right === 0) return 0;
  return EXP[(LOG[left] + LOG[right]) % 255] as number;
}

/** Multiplicative inverse. Refuses zero rather than returning a wrong element. */
export function gfInverse(value: number): number {
  if (value === 0) throw new Error("GF_INVERSE_OF_ZERO");
  return EXP[(255 - (LOG[value] as number)) % 255] as number;
}

export function gfDivide(numerator: number, denominator: number): number {
  if (denominator === 0) throw new Error("GF_DIVIDE_BY_ZERO");
  if (numerator === 0) return 0;
  return EXP[(((LOG[numerator] as number) - (LOG[denominator] as number) + 255) % 255)] as number;
}

/** 2^exponent in the field, for syndrome and Chien evaluation. */
export function gfExp(exponent: number): number {
  return EXP[((exponent % 255) + 255) % 255] as number;
}

export function gfLog(value: number): number {
  if (value === 0) throw new Error("GF_LOG_OF_ZERO");
  return LOG[value] as number;
}

/** Multiply two polynomials, coefficients highest-degree-first. */
export function polyMultiply(left: Uint8Array, right: Uint8Array): Uint8Array {
  const result = new Uint8Array(left.length + right.length - 1);
  for (let i = 0; i < left.length; i += 1) {
    const leftCoefficient = left[i] as number;
    if (leftCoefficient === 0) continue;
    for (let j = 0; j < right.length; j += 1) {
      result[i + j] ^= gfMultiply(leftCoefficient, right[j] as number);
    }
  }
  return result;
}

/** Evaluate a polynomial at x using Horner's method. */
export function polyEvaluate(poly: Uint8Array, x: number): number {
  let result = 0;
  for (const coefficient of poly) result = gfMultiply(result, x) ^ coefficient;
  return result;
}
