// Capability module for animated artefact in the ANQR product.

// --- Type definitions ---

export interface Pattern {
  readonly alias: string;
  readonly pattern: string;
}

export interface AnimationConfig {
  readonly pattern: Pattern;
  readonly target: string;
  readonly easing: string;
  readonly interpolation: string;
  readonly waveAxis: string;
  readonly temporalDither: string;
  readonly outputFormat: string;
  readonly duration?: number;
  readonly frameCount?: number;
}

export interface AnimationArtefact {
  readonly format: string;
  readonly data: string;
  readonly frameCount: number;
  readonly duration: number;
}

export interface BoundExceededError {
  readonly error: 'BOUND_EXCEEDED';
  readonly message: string;
  readonly bound: number;
  readonly requested: number;
}

export interface ReadinessUnavailableError {
  readonly error: 'READINESS_UNAVAILABLE';
  readonly message: string;
}

export interface FrameDecodeError {
  readonly error: 'FRAME_DECODE_ERROR';
  readonly message: string;
  readonly frameIndex: number;
}

export interface AuditFailedError {
  readonly error: 'AUDIT_FAILED';
  readonly message: string;
}

export type AnimationResult =
  | { readonly success: true; readonly artefact: AnimationArtefact }
  | { readonly success: false; readonly error: BoundExceededError | ReadinessUnavailableError | FrameDecodeError | AuditFailedError };

export type AuditResult =
  | { readonly success: true }
  | { readonly success: false; readonly error: string };

export type FrameDecodeResult =
  | { readonly success: true; readonly frame: string }
  | { readonly success: false; readonly error: string };

export type ReadinessResult =
  | { readonly ready: true }
  | { readonly ready: false; readonly reason: string };

// --- Constants ---

export const OUTPUT_FORMATS = ['gif', 'webp'] as const;
export type OutputFormat = typeof OUTPUT_FORMATS[number];

export const EASING_TYPES = ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const;
export type EasingType = typeof EASING_TYPES[number];

export const INTERPOLATION_TYPES = ['nearest', 'linear', 'cubic'] as const;
export type InterpolationType = typeof INTERPOLATION_TYPES[number];

export const WAVE_AXES = ['x', 'y', 'z'] as const;
export type WaveAxis = typeof WAVE_AXES[number];

export const TEMPORAL_DITHER_MODES = ['none', 'bayer', 'floyd-steinberg'] as const;
export type TemporalDitherMode = typeof TEMPORAL_DITHER_MODES[number];

export const MAX_DURATION = 10000; // milliseconds
export const MAX_FRAME_COUNT = 300;
export const DEFAULT_FRAMERATE = 30; // frames per second

// --- Factory functions ---

export function createPattern(alias: string, pattern: string): Pattern {
  if (!alias || alias.trim() === '') {
    throw new Error('Pattern alias must be a non-empty string.');
  }
  if (!pattern || pattern.trim() === '') {
    throw new Error('Pattern must be a non-empty string.');
  }
  return { alias, pattern };
}

export function createAnimationConfig(
  pattern: Pattern,
  target: string,
  easing: string,
  interpolation: string,
  waveAxis: string,
  temporalDither: string,
  outputFormat: string,
  duration?: number,
  frameCount?: number
): AnimationConfig {
  if (!target || target.trim() === '') {
    throw new Error('Target must be a non-empty string.');
  }
  if (!EASING_TYPES.includes(easing as any)) {
    throw new Error(`Easing must be one of: ${EASING_TYPES.join(', ')}`);
  }
  if (!INTERPOLATION_TYPES.includes(interpolation as any)) {
    throw new Error(`Interpolation must be one of: ${INTERPOLATION_TYPES.join(', ')}`);
  }
  if (!WAVE_AXES.includes(waveAxis as any)) {
    throw new Error(`Wave axis must be one of: ${WAVE_AXES.join(', ')}`);
  }
  if (!TEMPORAL_DITHER_MODES.includes(temporalDither as any)) {
    throw new Error(`Temporal dither must be one of: ${TEMPORAL_DITHER_MODES.join(', ')}`);
  }
  if (!OUTPUT_FORMATS.includes(outputFormat as any)) {
    throw new Error(`Output format must be one of: ${OUTPUT_FORMATS.join(', ')}`);
  }
  if (duration !== undefined && duration <= 0) {
    throw new Error('Duration must be positive.');
  }
  if (frameCount !== undefined && frameCount <= 0) {
    throw new Error('Frame count must be positive.');
  }
  return { pattern, target, easing, interpolation, waveAxis, temporalDither, outputFormat, duration, frameCount };
}

// --- Audit function ---

export function auditAnimation(
  config: AnimationConfig,
  renderingSurfaceAvailable: boolean
): AuditResult {
  if (!renderingSurfaceAvailable) {
    return {
      success: false,
      error: 'Animated rendering surface is not available.',
    };
  }

  if (config.duration !== undefined && config.duration > MAX_DURATION) {
    return {
      success: false,
      error: `Duration ${config.duration} exceeds maximum of ${MAX_DURATION}`,
    };
  }

  if (config.frameCount !== undefined && config.frameCount > MAX_FRAME_COUNT) {
    return {
      success: false,
      error: `Frame count ${config.frameCount} exceeds maximum of ${MAX_FRAME_COUNT}`,
    };
  }

  return { success: true };
}

// --- Frame decoder ---

export function decodeFrame(
  frameIndex: number,
  config: AnimationConfig
): FrameDecodeResult {
  // Simulate frame decoding; always succeeds in this implementation.
  // In a real scenario, this would decode the actual frame data.
  return { success: true, frame: `frame-${frameIndex}` };
}

// --- Readiness checker ---

export function checkReadiness(renderingSurfaceAvailable: boolean): ReadinessResult {
  if (!renderingSurfaceAvailable) {
    return { ready: false, reason: 'Animated rendering surface is not available.' };
  }
  return { ready: true };
}

// --- Production function ---

export function produceAnimation(
  config: AnimationConfig,
  renderingSurfaceAvailable: boolean,
  audit: (config: AnimationConfig, renderingSurfaceAvailable: boolean) => AuditResult = auditAnimation,
  decoder: (frameIndex: number, config: AnimationConfig) => FrameDecodeResult = decodeFrame
): AnimationResult {
  // Step 1: Audit (includes readiness and bounds checks)
  const auditResult = audit(config, renderingSurfaceAvailable);
  if (!auditResult.success) {
    return {
      success: false,
      error: {
        error: 'AUDIT_FAILED',
        message: auditResult.error,
      },
    };
  }

  // Step 2: Determine frame count
  let frameCount: number;
  if (config.frameCount !== undefined) {
    frameCount = config.frameCount;
  } else if (config.duration !== undefined) {
    frameCount = Math.floor(config.duration / 1000 * DEFAULT_FRAMERATE);
  } else {
    frameCount = DEFAULT_FRAMERATE; // default 1 second
  }

  // Step 3: Decode all frames
  const frames: string[] = [];
  for (let i = 0; i < frameCount; i++) {
    const decodeResult = decoder(i, config);
    if (!decodeResult.success) {
      return {
        success: false,
        error: {
          error: 'FRAME_DECODE_ERROR',
          message: decodeResult.error,
          frameIndex: i,
        },
      };
    }
    frames.push(decodeResult.frame);
  }

  // Step 4: Produce whole artefact
  const artefact: AnimationArtefact = {
    format: config.outputFormat,
    data: frames.join(','),
    frameCount: frames.length,
    duration: config.duration ?? frameCount / DEFAULT_FRAMERATE * 1000,
  };

  return { success: true, artefact };
}

// --- Validation function ---

export function validateAnimationArtefact(artefact: AnimationArtefact): boolean {
  // Check that the artefact is complete (all frames present)
  if (artefact.frameCount <= 0 || artefact.data.split(',').length !== artefact.frameCount) {
    return false;
  }
  return true;
}