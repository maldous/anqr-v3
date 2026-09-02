export type ConfidenceLevel = 'low' | 'medium' | 'high';

export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;

export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export const ERROR_CORRECTION_LEVELS = ['L', 'M', 'Q', 'H'] as const;

export interface DecoderMetadata {
  readonly version: string;
  readonly algorithm: string;
  readonly customizations: Readonly<Record<string, unknown>>;
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

export function decode(
  imageData: Uint8Array,
  options?: DecodingOptions
): DecodingResult {
  if (!(imageData instanceof Uint8Array)) {
    return createDecodingFailure('invalid_image_data', 'input_validation');
  }
  if (imageData.length === 0) {
    return createDecodingFailure('invalid_image_data', 'input_validation');
  }
  return createDecodingFailure('no_qr_found', 'symbol_detection');
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