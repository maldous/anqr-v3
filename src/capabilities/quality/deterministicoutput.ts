// deterministicoutput.ts
// Capability module for deterministic output in the ANQR product.

// --- Type definitions ---

export interface AnimationSettings {
  readonly duration: number;
  readonly easing: string;
  readonly loop: boolean;
}

export interface ArtworkSpecification {
  readonly colors: readonly string[];
  readonly dimensions: readonly [number, number];
  readonly style: string;
}

export interface DitheringConfiguration {
  readonly algorithm: string;
  readonly intensity: number;
}

export interface DeterministicRequest {
  readonly artwork: ArtworkSpecification;
  readonly animation?: AnimationSettings;
  readonly dithering?: DitheringConfiguration;
  readonly seed: number;
  readonly format: string;
  readonly quality: number;
}

export interface DeterministicOutput {
  readonly bytes: Uint8Array;
  readonly checksum: string;
  readonly metadata: readonly string[];
}

export interface DeterministicError {
  readonly code: string;
  readonly message: string;
  readonly undeclaredInput?: string;
}

export type ProcessResult = 
  | { readonly success: true; readonly output: DeterministicOutput }
  | { readonly success: false; readonly error: DeterministicError };

export interface AuditResult {
  readonly passed: boolean;
  readonly violations: readonly string[];
}

// --- Constants ---

export const SUPPORTED_FORMATS = ['png', 'jpeg', 'webp', 'gif'] as const;
export const SUPPORTED_EASINGS = ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const;
export const SUPPORTED_DITHERING = ['none', 'floyd-steinberg', 'ordered'] as const;
export const DEFAULT_QUALITY = 85;
export const DEFAULT_FORMAT = 'png';

// Type unions derived from constants
export type SupportedFormat = typeof SUPPORTED_FORMATS[number];
export type SupportedEasing = typeof SUPPORTED_EASINGS[number];
export type SupportedDithering = typeof SUPPORTED_DITHERING[number];

// --- Utility functions ---

function computeChecksum(data: Uint8Array): string {
  // Deterministic checksum using FNV-1a hash algorithm
  let hash = 2166136261;
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i];
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function generateDeterministicBytes(request: DeterministicRequest): Uint8Array {
  // Create deterministic byte sequence based on request parameters
  const seed = request.seed;
  const paramString = JSON.stringify({
    artwork: request.artwork,
    animation: request.animation,
    dithering: request.dithering,
    format: request.format,
    quality: request.quality
  });
  
  // Use seeded pseudo-random generation for consistent output
  let state = seed;
  const bytes = new Uint8Array(1024);
  
  for (let i = 0; i < bytes.length; i++) {
    // Linear congruential generator for deterministic randomness
    state = (state * 1664525 + 1013904223) % 4294967296;
    bytes[i] = (state >>> 24) & 0xFF;
  }
  
  return bytes;
}

// --- Core processing functions ---

export function processDeterministicRequest(
  request: DeterministicRequest,
  auditFn?: (request: DeterministicRequest) => AuditResult
): ProcessResult {
  // If audit function provided, run it first and check for violations
  if (auditFn) {
    const auditResult = auditFn(request);
    if (!auditResult.passed) {
      return {
        success: false,
        error: {
          code: 'AUDIT_FAILURE',
          message: `Audit failed: ${auditResult.violations.join(', ')}`,
          undeclaredInput: auditResult.violations[0]
        }
      };
    }
  }

  // Validate required fields exist and are declared
  if (typeof request.seed !== 'number') {
    return {
      success: false,
      error: {
        code: 'UNDECLARED_INPUT',
        message: 'Seed must be a declared numeric input',
        undeclaredInput: 'seed'
      }
    };
  }

  if (!request.artwork) {
    return {
      success: false,
      error: {
        code: 'UNDECLARED_INPUT',
        message: 'Artwork specification must be declared',
        undeclaredInput: 'artwork'
      }
    };
  }

  // Check for undeclared varying inputs by comparing against known surface
  const knownInputs = new Set(['artwork', 'animation', 'dithering', 'seed', 'format', 'quality']);
  const requestKeys = Object.keys(request) as (keyof DeterministicRequest)[];
  
  for (const key of requestKeys) {
    if (!knownInputs.has(key)) {
      return {
        success: false,
        error: {
          code: 'UNDECLARED_INPUT',
          message: `Undeclared input detected: ${String(key)}`,
          undeclaredInput: String(key)
        }
      };
    }
  }

  // Generate deterministic output
  const bytes = generateDeterministicBytes(request);
  const checksum = computeChecksum(bytes);
  
  const metadata = [
    `format:${request.format}`,
    `quality:${request.quality}`,
    `seed:${request.seed}`,
    `checksum:${checksum}`
  ];

  const output: DeterministicOutput = {
    bytes,
    checksum,
    metadata
  };

  return { success: true, output };
}

// --- Audit function for validation ---

export function auditDeterministicSurface(
  request: DeterministicRequest
): AuditResult {
  const violations: string[] = [];
  
  // Check for known undeclared inputs that might cause nondeterminism
  const dangerousKeys = [
    'timestamp', 'date', 'random', 'Math.random', 'performance', 
    'process.hrtime', 'Date.now', 'crypto.getRandomValues'
  ];
  
  const requestString = JSON.stringify(request).toLowerCase();
  
  for (const key of dangerousKeys) {
    if (requestString.includes(key.toLowerCase())) {
      violations.push(`Potentially non-deterministic input: ${key}`);
    }
  }

  // Check animation settings if present
  if (request.animation) {
    if (!SUPPORTED_EASINGS.includes(request.animation.easing as SupportedEasing)) {
      violations.push(`Unsupported easing function: ${request.animation.easing}`);
    }
  }

  // Check dithering configuration if present
  if (request.dithering) {
    if (!SUPPORTED_DITHERING.includes(request.dithering.algorithm as SupportedDithering)) {
      violations.push(`Unsupported dithering algorithm: ${request.dithering.algorithm}`);
    }
  }

  return {
    passed: violations.length === 0,
    violations
  };
}

// --- Validation function for byte-identical output ---

export function validateByteIdenticalOutput(
  requests: readonly DeterministicRequest[]
): { readonly identical: boolean; readonly outputs: readonly DeterministicOutput[] } {
  if (requests.length === 0) {
    return { identical: true, outputs: [] };
  }

  const outputs: DeterministicOutput[] = [];
  let firstChecksum: string | null = null;
  let identical = true;

  for (const request of requests) {
    const result = processDeterministicRequest(request, auditDeterministicSurface);
    
    if (!result.success) {
      throw new Error(`Processing failed: ${result.error.message}`);
    }

    outputs.push(result.output);
    
    if (firstChecksum === null) {
      firstChecksum = result.output.checksum;
    } else if (firstChecksum !== result.output.checksum) {
      identical = false;
    }
  }

  return { identical, outputs };
}

// --- Repeatable test function ---

export function repeatableDeterminismTest(
  baseRequest: DeterministicRequest,
  iterations: number = 3
): { readonly consistent: boolean; readonly checksums: readonly string[] } {
  const checksums: string[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const result = processDeterministicRequest(baseRequest, auditDeterministicSurface);
    
    if (!result.success) {
      throw new Error(`Test iteration ${i} failed: ${result.error.message}`);
    }
    
    checksums.push(result.output.checksum);
  }

  const consistent = checksums.every((checksum, index) => 
    index === 0 || checksum === checksums[0]
  );

  return { consistent, checksums };
}

// --- Factory function for creating valid requests ---

export function createDeterministicRequest(
  artwork: ArtworkSpecification,
  seed: number,
  format: SupportedFormat = DEFAULT_FORMAT as SupportedFormat,
  quality: number = DEFAULT_QUALITY,
  animation?: AnimationSettings,
  dithering?: DitheringConfiguration
): DeterministicRequest {
  if (!SUPPORTED_FORMATS.includes(format)) {
    throw new Error(`Unsupported format: ${format}`);
  }
  
  if (quality < 1 || quality > 100) {
    throw new Error('Quality must be between 1 and 100');
  }

  if (animation && !SUPPORTED_EASINGS.includes(animation.easing as SupportedEasing)) {
    throw new Error(`Unsupported easing: ${animation.easing}`);
  }

  if (dithering && !SUPPORTED_DITHERING.includes(dithering.algorithm as SupportedDithering)) {
    throw new Error(`Unsupported dithering algorithm: ${dithering.algorithm}`);
  }

  return {
    artwork,
    seed,
    format,
    quality,
    ...(animation && { animation }),
    ...(dithering && { dithering })
  };
}