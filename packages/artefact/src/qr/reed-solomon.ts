import { gfDivide, gfExp, gfMultiply, polyEvaluate, polyMultiply } from "./galois.ts";

// Reed-Solomon encoding and decoding over GF(256) for QR codewords.
//
// Encoding is remainder-of-division by the generator polynomial. Decoding is
// the full syndrome / Berlekamp-Massey / Chien / Forney chain rather than a
// syndrome check alone, because error correction is exactly what makes a QR
// symbol survive real-world damage. A decoder that only verified undamaged
// input would prove far less than the artefact contract claims.
//
// Encoding works in descending coefficient order because that is the codeword
// order on the wire. Decoding works in ascending order (index === power of x)
// because every published form of Berlekamp-Massey and Forney is written that
// way, and translating them into descending order is how sign and offset
// mistakes get in.

/** Generator polynomial (x - 2^0)(x - 2^1)...(x - 2^(degree-1)), descending. */
export function generatorPolynomial(degree: number): Uint8Array {
  // Annotated rather than inferred: the initialiser narrows to
  // Uint8Array<ArrayBuffer> while polyMultiply returns Uint8Array<ArrayBufferLike>.
  let poly: Uint8Array = new Uint8Array([1]);
  for (let index = 0; index < degree; index += 1) {
    poly = polyMultiply(poly, new Uint8Array([1, gfExp(index)]));
  }
  return poly;
}

/** Compute `ecLength` error-correction codewords for one data block. */
export function encodeBlock(data: Uint8Array, ecLength: number): Uint8Array {
  const generator = generatorPolynomial(ecLength);
  const remainder = new Uint8Array(ecLength);
  for (const byte of data) {
    const factor = byte ^ (remainder[0] as number);
    remainder.copyWithin(0, 1);
    remainder[ecLength - 1] = 0;
    if (factor !== 0) {
      for (let index = 0; index < ecLength; index += 1) {
        remainder[index] ^= gfMultiply(generator[index + 1] as number, factor);
      }
    }
  }
  return remainder;
}

export interface BlockDecodeResult {
  readonly data: Uint8Array;
  readonly errorsCorrected: number;
}

/** Evaluate an ascending-order polynomial at x. */
function evaluateAscending(coefficients: readonly number[], x: number): number {
  let result = 0;
  for (let index = coefficients.length - 1; index >= 0; index -= 1) {
    result = gfMultiply(result, x) ^ (coefficients[index] as number);
  }
  return result;
}

/**
 * Berlekamp-Massey. Returns the error-locator polynomial in ascending order
 * with a constant term of 1, or undefined when no consistent locator exists.
 */
function errorLocator(syndromes: readonly number[], ecLength: number): number[] | undefined {
  let locator = [1];
  let previous = [1];
  let degree = 0;
  let shift = 1;
  let previousDiscrepancy = 1;

  for (let step = 0; step < ecLength; step += 1) {
    let discrepancy = syndromes[step] as number;
    for (let index = 1; index <= degree; index += 1) {
      discrepancy ^= gfMultiply(locator[index] ?? 0, syndromes[step - index] as number);
    }

    if (discrepancy === 0) {
      shift += 1;
      continue;
    }

    const scale = gfDivide(discrepancy, previousDiscrepancy);
    const updated = [...locator];
    for (let index = 0; index < previous.length; index += 1) {
      const target = index + shift;
      while (updated.length <= target) updated.push(0);
      updated[target] = (updated[target] as number) ^ gfMultiply(scale, previous[index] as number);
    }

    if (2 * degree <= step) {
      previous = locator;
      previousDiscrepancy = discrepancy;
      degree = step + 1 - degree;
      shift = 1;
    } else {
      shift += 1;
    }
    locator = updated;
  }

  while (locator.length > 1 && locator[locator.length - 1] === 0) locator.pop();
  if (locator[0] !== 1) return undefined;
  if (locator.length - 1 !== degree) return undefined;
  return locator;
}

/**
 * Decode one interleaved block (data followed by EC codewords), correcting up
 * to `ecLength / 2` symbol errors. Throws `RS_UNCORRECTABLE` when the received
 * word is beyond the code's correction capability, which is the honest outcome:
 * a wrong payload is far worse than a refusal.
 */
export function decodeBlock(received: Uint8Array, ecLength: number): BlockDecodeResult {
  const dataLength = received.length - ecLength;
  if (dataLength <= 0) throw new Error("RS_BLOCK_TOO_SHORT");

  const syndromes: number[] = [];
  let syndromesAreZero = true;
  for (let index = 0; index < ecLength; index += 1) {
    const value = polyEvaluate(received, gfExp(index));
    syndromes.push(value);
    if (value !== 0) syndromesAreZero = false;
  }
  if (syndromesAreZero) {
    return { data: received.slice(0, dataLength), errorsCorrected: 0 };
  }

  const locator = errorLocator(syndromes, ecLength);
  if (!locator) throw new Error("RS_UNCORRECTABLE");
  const errorCount = locator.length - 1;
  if (errorCount === 0 || errorCount * 2 > ecLength) throw new Error("RS_UNCORRECTABLE");

  // Chien search. Position p (power of x) is in error when L(alpha^-p) == 0;
  // the wire index for power p is received.length - 1 - p.
  const positions: number[] = [];
  for (let power = 0; power < received.length; power += 1) {
    if (evaluateAscending(locator, gfExp(-power)) === 0) positions.push(power);
  }
  if (positions.length !== errorCount) throw new Error("RS_UNCORRECTABLE");

  // Error evaluator Omega(x) = S(x) * L(x) mod x^ecLength, ascending.
  const evaluator = new Array<number>(ecLength).fill(0);
  for (let i = 0; i < ecLength; i += 1) {
    const syndrome = syndromes[i] as number;
    if (syndrome === 0) continue;
    for (let k = 0; k < locator.length && i + k < ecLength; k += 1) {
      evaluator[i + k] = (evaluator[i + k] as number) ^ gfMultiply(syndrome, locator[k] as number);
    }
  }

  // Formal derivative in characteristic 2: only odd-degree terms survive.
  const derivative = new Array<number>(Math.max(1, locator.length - 1)).fill(0);
  for (let index = 1; index < locator.length; index += 1) {
    if (index % 2 === 1) derivative[index - 1] = locator[index] as number;
  }

  // Forney. With S_i = sum_j e_j X_j^i and Omega = S*L mod x^2t, the ratio
  // Omega(X^-1) / L'(X^-1) equals e_j / X_j, so the location factor X_j must be
  // multiplied back in. Omitting it yields a plausible but wrong magnitude.
  const corrected = received.slice();
  for (const power of positions) {
    const xInverse = gfExp(-power);
    const denominator = evaluateAscending(derivative, xInverse);
    if (denominator === 0) throw new Error("RS_UNCORRECTABLE");
    const ratio = gfDivide(evaluateAscending(evaluator, xInverse), denominator);
    const magnitude = gfMultiply(gfExp(power), ratio);
    const wireIndex = received.length - 1 - power;
    corrected[wireIndex] = (corrected[wireIndex] as number) ^ magnitude;
  }

  // Re-verify: correction that does not clear every syndrome is a wrong answer.
  for (let index = 0; index < ecLength; index += 1) {
    if (polyEvaluate(corrected, gfExp(index)) !== 0) throw new Error("RS_UNCORRECTABLE");
  }

  return { data: corrected.slice(0, dataLength), errorsCorrected: positions.length };
}
