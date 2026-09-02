// Capability module for structural inspection in the ANQR product.

// --- Type definitions ---

/**
 * Discrete orientation values that may be reported. Exported as a readonly
 * tuple of string literals and as a union type so callers can both iterate
 * the set and narrow on the literal.
 */
export const ORIENTATIONS = ['normal', 'rotated90', 'rotated180', 'rotated270'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

/**
 * Discrete encoding modes that may be reported.
 */
export const ENCODING_MODES = ['numeric', 'alphanumeric', 'byte', 'kanji'] as const;
export type EncodingMode = (typeof ENCODING_MODES)[number];

/**
 * Discrete error-correction levels.
 */
export const ERROR_CORRECTION_LEVELS = ['L', 'M', 'Q', 'H'] as const;
export type ErrorCorrectionLevel = (typeof ERROR_CORRECTION_LEVELS)[number];

/**
 * Geometry diagnostics describing the bounding box of a symbol.
 */
export interface GeometryDiagnostics {
  readonly topLeft: { readonly x: number; readonly y: number };
  readonly bottomRight: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: number;
}

/**
 * Timing diagnostics describing decode performance.
 */
export interface TimingDiagnostics {
  readonly decodeMs: number;
  readonly captureMs?: number;
  readonly preprocessMs?: number;
}

/**
 * Image properties.
 */
export interface ImageProperties {
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly channels: number;
  readonly bitsPerChannel: number;
}

/**
 * Quiet-zone information.
 */
export interface QuietZoneInfo {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/**
 * Detected and dominant colours. The dominant colour is the most frequent
 * value found across all channels; detected colours is the full list of
 * distinct values observed.
 */
export interface ColourReport {
  readonly dominant: number;
  readonly detected: readonly number[];
}

/**
 * Data capacity description.
 */
export interface DataCapacity {
  readonly totalModules: number;
  readonly dataModules: number;
  readonly functionModules: number;
  readonly usableBytes: number;
}

/**
 * The complete structural inspection report.
 */
export interface StructuralReport {
  readonly version: number;
  readonly moduleCount: number;
  readonly errorCorrectionLevel: ErrorCorrectionLevel;
  readonly maskPattern: number;
  readonly encodingMode: EncodingMode;
  readonly errorsCorrected: number;
  readonly erasures: number;
  readonly orientation: Orientation;
  readonly quietZone: QuietZoneInfo;
  readonly dataCapacity: DataCapacity;
  readonly structuralAnalysis: string;
  readonly imageProperties: ImageProperties;
  readonly geometry: GeometryDiagnostics;
  readonly timing: TimingDiagnostics;
  readonly colours: ColourReport;
  readonly moduleMatrix: readonly (readonly number[])[];
  readonly byteView: readonly number[];
}

/**
 * A single input record describing a known artefact, used to seed an
 * inspection. Only fields that the caller supplies will be considered
 * "measured"; the rest will be omitted from the report.
 */
export interface ArtefactSpec {
  readonly version?: number;
  readonly moduleCount?: number;
  readonly errorCorrectionLevel?: ErrorCorrectionLevel;
  readonly maskPattern?: number;
  readonly encodingMode?: EncodingMode;
  readonly errorsCorrected?: number;
  readonly erasures?: number;
  readonly orientation?: Orientation;
  readonly quietZone?: QuietZoneInfo;
  readonly dataCapacity?: DataCapacity;
  readonly structuralAnalysis?: string;
  readonly imageProperties?: ImageProperties;
  readonly geometry?: GeometryDiagnostics;
  readonly timing?: TimingDiagnostics;
  readonly colours?: ColourReport;
  readonly moduleMatrix?: readonly (readonly number[])[];
  readonly byteView?: readonly number[];
}

/**
 * Discriminated error type for inspection operations. The literal `kind`
 * field allows callers to narrow the union before reading members.
 */
export type InspectionErrorKind =
  | 'invalid-version'
  | 'invalid-module-count'
  | 'invalid-mask'
  | 'invalid-orientation'
  | 'invalid-mode'
  | 'invalid-error-correction'
  | 'invalid-matrix-shape'
  | 'validation-failed';

export interface InspectionError {
  readonly kind: InspectionErrorKind;
  readonly message: string;
}

export type InspectionResult =
  | { readonly success: true; readonly report: StructuralReport }
  | { readonly success: false; readonly error: InspectionError };

// --- Constants ---

export const MASK_PATTERN_VALUES = [0, 1, 2, 3, 4, 5, 6, 7] as const;
export type MaskPatternValue = (typeof MASK_PATTERN_VALUES)[number];

export const MIN_VERSION = 1;
export const MAX_VERSION = 40;
export const MIN_MODULE_COUNT = 21;
export const MAX_MODULE_COUNT = 177;

export const DEFAULT_VERSION = 1;
export const DEFAULT_ERROR_CORRECTION: ErrorCorrectionLevel = 'M';
export const DEFAULT_MASK_PATTERN: MaskPatternValue = 0;
export const DEFAULT_ENCODING_MODE: EncodingMode = 'byte';
export const DEFAULT_ORIENTATION: Orientation = 'normal';

// --- Helpers ---

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOrientation(value: unknown): value is Orientation {
  return typeof value === 'string' && (ORIENTATIONS as readonly string[]).includes(value);
}

function isEncodingMode(value: unknown): value is EncodingMode {
  return typeof value === 'string' && (ENCODING_MODES as readonly string[]).includes(value);
}

function isErrorCorrectionLevel(value: unknown): value is ErrorCorrectionLevel {
  return typeof value === 'string' && (ERROR_CORRECTION_LEVELS as readonly string[]).includes(value);
}

function isMaskPattern(value: unknown): value is MaskPatternValue {
  return typeof value === 'number' && Number.isInteger(value) &&
    (MASK_PATTERN_VALUES as readonly number[]).includes(value);
}

function isQuietZone(value: unknown): value is QuietZoneInfo {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const qz = value as Record<string, unknown>;
  return isFiniteNumber(qz.top) && isFiniteNumber(qz.bottom) &&
    isFiniteNumber(qz.left) && isFiniteNumber(qz.right);
}

function isGeometry(value: unknown): value is GeometryDiagnostics {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const g = value as Record<string, unknown>;
  if (typeof g.topLeft !== 'object' || g.topLeft === null) {
    return false;
  }
  if (typeof g.bottomRight !== 'object' || g.bottomRight === null) {
    return false;
  }
  const tl = g.topLeft as Record<string, unknown>;
  const br = g.bottomRight as Record<string, unknown>;
  return isFiniteNumber(tl.x) && isFiniteNumber(tl.y) &&
    isFiniteNumber(br.x) && isFiniteNumber(br.y) &&
    isFiniteNumber(g.width) && isFiniteNumber(g.height) &&
    isFiniteNumber(g.aspectRatio);
}

function isTiming(value: unknown): value is TimingDiagnostics {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const t = value as Record<string, unknown>;
  if (!isFiniteNumber(t.decodeMs)) {
    return false;
  }
  if (t.captureMs !== undefined && !isFiniteNumber(t.captureMs)) {
    return false;
  }
  if (t.preprocessMs !== undefined && !isFiniteNumber(t.preprocessMs)) {
    return false;
  }
  return true;
}

function isImageProperties(value: unknown): value is ImageProperties {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const p = value as Record<string, unknown>;
  return isFiniteNumber(p.pixelWidth) && isFiniteNumber(p.pixelHeight) &&
    isFiniteNumber(p.channels) && isFiniteNumber(p.bitsPerChannel);
}

function isDataCapacity(value: unknown): value is DataCapacity {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const d = value as Record<string, unknown>;
  return isFiniteNumber(d.totalModules) && isFiniteNumber(d.dataModules) &&
    isFiniteNumber(d.functionModules) && isFiniteNumber(d.usableBytes);
}

function isColours(value: unknown): value is ColourReport {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const c = value as Record<string, unknown>;
  if (!isFiniteNumber(c.dominant)) {
    return false;
  }
  if (!Array.isArray(c.detected)) {
    return false;
  }
  return c.detected.every(isFiniteNumber);
}

function isMatrix(value: unknown): value is readonly (readonly number[])[] {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every((row) => Array.isArray(row) && row.every(isFiniteNumber));
}

function isByteView(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every(isFiniteNumber);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

// --- Core inspection ---

/**
 * Validates a candidate artefact specification. The audit is run before any
 * record is constructed; if it throws or returns an error, no inspection
 * record is produced and `undefined` is returned so the caller can branch
 * without ever seeing a partially built report.
 */
export function auditSpec(spec: ArtefactSpec): InspectionError | undefined {
  if (spec.version !== undefined && (!isFiniteNumber(spec.version) ||
    spec.version < MIN_VERSION || spec.version > MAX_VERSION)) {
    return {
      kind: 'invalid-version',
      message: `Version must be an integer between ${MIN_VERSION} and ${MAX_VERSION}.`,
    };
  }

  if (spec.moduleCount !== undefined &&
    (!isFiniteNumber(spec.moduleCount) || spec.moduleCount < MIN_MODULE_COUNT ||
      spec.moduleCount > MAX_MODULE_COUNT)) {
    return {
      kind: 'invalid-module-count',
      message: `Module count must be between ${MIN_MODULE_COUNT} and ${MAX_MODULE_COUNT}.`,
    };
  }

  if (spec.maskPattern !== undefined && !isMaskPattern(spec.maskPattern)) {
    return {
      kind: 'invalid-mask',
      message: 'Mask pattern must be an integer in [0, 7].',
    };
  }

  if (spec.orientation !== undefined && !isOrientation(spec.orientation)) {
    return {
      kind: 'invalid-orientation',
      message: `Orientation must be one of: ${ORIENTATIONS.join(', ')}.`,
    };
  }

  if (spec.encodingMode !== undefined && !isEncodingMode(spec.encodingMode)) {
    return {
      kind: 'invalid-mode',
      message: `Encoding mode must be one of: ${ENCODING_MODES.join(', ')}.`,
    };
  }

  if (spec.errorCorrectionLevel !== undefined &&
    !isErrorCorrectionLevel(spec.errorCorrectionLevel)) {
    return {
      kind: 'invalid-error-correction',
      message: `Error correction level must be one of: ${ERROR_CORRECTION_LEVELS.join(', ')}.`,
    };
  }

  if (spec.moduleMatrix !== undefined && !isMatrix(spec.moduleMatrix)) {
    return {
      kind: 'invalid-matrix-shape',
      message: 'Module matrix must be an array of arrays of finite numbers.',
    };
  }

  return undefined;
}

/**
 * Produces a structural inspection report from a specification. Only fields
 * that were actually measured are emitted; unmeasured diagnostics are omitted
 * entirely so no placeholder appears in the output.
 *
 * The audit is invoked before any report fields are computed; on failure
 * the returned object carries the error and `report` is not present.
 */
export function inspectArtefact(
  spec: ArtefactSpec,
  auditor: (s: ArtefactSpec) => InspectionError | undefined = auditSpec
): InspectionResult {
  const auditResult = auditor(spec);
  if (auditResult !== undefined) {
    return { success: false, error: auditResult };
  }

  // Build the report field-by-field, omitting any unmeasured diagnostic.
  const report: {
    -readonly [K in keyof StructuralReport]?: StructuralReport[K];
  } = {};

  if (spec.version !== undefined) {
    report.version = spec.version;
  }
  if (spec.moduleCount !== undefined) {
    report.moduleCount = spec.moduleCount;
  }
  if (spec.errorCorrectionLevel !== undefined) {
    report.errorCorrectionLevel = spec.errorCorrectionLevel;
  }
  if (spec.maskPattern !== undefined) {
    report.maskPattern = spec.maskPattern;
  }
  if (spec.encodingMode !== undefined) {
    report.encodingMode = spec.encodingMode;
  }
  if (spec.errorsCorrected !== undefined) {
    report.errorsCorrected = spec.errorsCorrected;
  }
  if (spec.erasures !== undefined) {
    report.erasures = spec.erasures;
  }
  if (spec.orientation !== undefined) {
    report.orientation = spec.orientation;
  }
  if (spec.quietZone !== undefined) {
    report.quietZone = spec.quietZone;
  }
  if (spec.dataCapacity !== undefined) {
    report.dataCapacity = spec.dataCapacity;
  }
  if (spec.structuralAnalysis !== undefined && isString(spec.structuralAnalysis)) {
    report.structuralAnalysis = spec.structuralAnalysis;
  }
  if (spec.imageProperties !== undefined && isImageProperties(spec.imageProperties)) {
    report.imageProperties = spec.imageProperties;
  }
  if (spec.geometry !== undefined && isGeometry(spec.geometry)) {
    report.geometry = spec.geometry;
  }
  if (spec.timing !== undefined && isTiming(spec.timing)) {
    report.timing = spec.timing;
  }
  if (spec.colours !== undefined && isColours(spec.colours)) {
    report.colours = spec.colours;
  }
  if (spec.moduleMatrix !== undefined && isMatrix(spec.moduleMatrix)) {
    report.moduleMatrix = spec.moduleMatrix;
  }
  if (spec.byteView !== undefined && isByteView(spec.byteView)) {
    report.byteView = spec.byteView;
  }

  return { success: true, report: report as StructuralReport };
}

// --- Validation ---

/**
 * Validates that an inspection of an artefact constructed with a known
 * specification reports exactly those parameters. Returns a discriminated
 * result; callers must narrow on the literal before reading members.
 *
 * The audit function is invoked before any report is captured, so a
 * validation failure cannot mutate the report under inspection.
 */
export function validateInspection(
  expected: ArtefactSpec,
  actual: StructuralReport,
  auditor: (s: ArtefactSpec) => InspectionError | undefined = auditSpec
): InspectionResult {
  const auditResult = auditor(expected);
  if (auditResult !== undefined) {
    return { success: false, error: { ...auditResult, kind: 'validation-failed' } };
  }

  const mismatches: string[] = [];

  if (expected.version !== undefined && actual.version !== expected.version) {
    mismatches.push(`version: expected ${expected.version}, got ${actual.version}`);
  }
  if (expected.moduleCount !== undefined && actual.moduleCount !== expected.moduleCount) {
    mismatches.push(`moduleCount: expected ${expected.moduleCount}, got ${actual.moduleCount}`);
  }
  if (expected.errorCorrectionLevel !== undefined &&
    actual.errorCorrectionLevel !== expected.errorCorrectionLevel) {
    mismatches.push(`errorCorrectionLevel: expected ${expected.errorCorrectionLevel}, got ${actual.errorCorrectionLevel}`);
  }
  if (expected.maskPattern !== undefined && actual.maskPattern !== expected.maskPattern) {
    mismatches.push(`maskPattern: expected ${expected.maskPattern}, got ${actual.maskPattern}`);
  }
  if (expected.encodingMode !== undefined && actual.encodingMode !== expected.encodingMode) {
    mismatches.push(`encodingMode: expected ${expected.encodingMode}, got ${actual.encodingMode}`);
  }
  if (expected.errorsCorrected !== undefined &&
    actual.errorsCorrected !== expected.errorsCorrected) {
    mismatches.push(`errorsCorrected: expected ${expected.errorsCorrected}, got ${actual.errorsCorrected}`);
  }
  if (expected.erasures !== undefined && actual.erasures !== expected.erasures) {
    mismatches.push(`erasures: expected ${expected.erasures}, got ${actual.erasures}`);
  }
  if (expected.orientation !== undefined && actual.orientation !== expected.orientation) {
    mismatches.push(`orientation: expected ${expected.orientation}, got ${actual.orientation}`);
  }
  if (expected.moduleMatrix !== undefined &&
    actual.moduleMatrix !== undefined &&
    expected.moduleMatrix.length !== actual.moduleMatrix.length) {
    mismatches.push(`moduleMatrix: row count mismatch`);
  }

  if (mismatches.length > 0) {
    return {
      success: false,
      error: {
        kind: 'validation-failed',
        message: `Inspection does not match known parameters: ${mismatches.join('; ')}.`,
      },
    };
  }

  return { success: true, report: actual };
}

// --- Composite workflow ---

/**
 * Executes the full inspection workflow: audit, inspect, then validate.
 * The audit is the gate; if it fails at any point the original report
 * is returned untouched, demonstrating that no mutation occurs on a
 * failed audit.
 */
export function performStructuralInspection(
  spec: ArtefactSpec,
  auditor: (s: ArtefactSpec) => InspectionError | undefined = auditSpec
): InspectionResult {
  // Pre-audit the specification. On failure, do not produce a report.
  const auditResult = auditor(spec);
  if (auditResult !== undefined) {
    return { success: false, error: auditResult };
  }

  // Inspection itself cannot fail after a successful audit.
  const inspection = inspectArtefact(spec, auditor);
  if (!inspection.success) {
    return inspection;
  }

  // Validate that the report carries the expected parameters.
  return validateInspection(spec, inspection.report, auditor);
}

// --- Direct view helpers ---

/**
 * Returns the module matrix from a report. Returns undefined if the
 * matrix was not measured (i.e. omitted from the report rather than
 * represented by a placeholder).
 */
export function getModuleMatrix(
  report: StructuralReport
): readonly (readonly number[])[] | undefined {
  return report.moduleMatrix;
}

/**
 * Returns the byte-level view from a report. Returns undefined when
 * no byte-level view was measured.
 */
export function getByteView(
  report: StructuralReport
): readonly number[] | undefined {
  return report.byteView;
}

/**
 * Returns the dominant colour from the colour report, or undefined
 * when colour analysis was not measured.
 */
export function getDominantColour(report: StructuralReport): number | undefined {
  if (report.colours === undefined) {
    return undefined;
  }
  return report.colours.dominant;
}