// artefactexport.ts
// Capability module for artefact export in the ANQR product.

// --- Type definitions ---

export interface Geometry {
  readonly width: number;
  readonly height: number;
}

export interface Artefact {
  readonly id: string;
  readonly payload: string;
  readonly supportedFormats: readonly ExportFormat[];
  readonly supportedGeometries: readonly Geometry[];
}

export interface ExportResult {
  readonly file: string;
  readonly format: ExportFormat;
  readonly geometry: Geometry;
}

export type ExportErrorCode =
  | 'INCOMPATIBLE_FORMAT'
  | 'INCOMPATIBLE_GEOMETRY'
  | 'EMPTY_PAYLOAD'
  | 'INVALID_GEOMETRY';

export interface ExportError {
  readonly code: ExportErrorCode;
  readonly message: string;
  readonly incompatibility: string;
}

export type ExportOutcome =
  | { readonly success: true; readonly result: ExportResult }
  | { readonly success: false; readonly error: ExportError };

// --- Constants and declared sets ---

export const EXPORT_FORMATS = ['png', 'svg', 'json'] as const;
export type ExportFormat = typeof EXPORT_FORMATS[number];

export const EXPORT_ERROR_CODES: readonly ExportErrorCode[] = [
  'INCOMPATIBLE_FORMAT',
  'INCOMPATIBLE_GEOMETRY',
  'EMPTY_PAYLOAD',
  'INVALID_GEOMETRY',
];

export const DEFAULT_GEOMETRY: Geometry = { width: 800, height: 600 };

// --- Pure encoding functions (validation requirement) ---

function encodeAsPng(payload: string, geometry: Geometry): string {
  const header = `PNG|${geometry.width}x${geometry.height}`;
  return `${header}|${payload}`;
}

function encodeAsSvg(payload: string, geometry: Geometry): string {
  const body = payload.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${geometry.width}" height="${geometry.height}"><text>${body}</text></svg>`;
}

function encodeAsJson(payload: string, geometry: Geometry): string {
  return JSON.stringify({ width: geometry.width, height: geometry.height, payload });
}

// --- Factory functions ---

/**
 * Creates an artefact with a declared set of formats and geometries it can be delivered in.
 */
export function createArtefact(
  id: string,
  payload: string,
  supportedFormats: readonly ExportFormat[] = EXPORT_FORMATS,
  supportedGeometries: readonly Geometry[] = [DEFAULT_GEOMETRY]
): Artefact {
  if (!id || id.trim() === '') {
    throw new Error('Artefact id must be a non-empty string.');
  }
  if (payload === undefined || payload === null) {
    throw new Error('Artefact payload must be defined.');
  }
  if (supportedFormats.length === 0) {
    throw new Error('Artefact must declare at least one supported format.');
  }
  for (const g of supportedGeometries) {
    if (!Number.isFinite(g.width) || !Number.isFinite(g.height) || g.width <= 0 || g.height <= 0) {
      throw new Error('All geometries must have positive finite width and height.');
    }
  }
  return {
    id,
    payload,
    supportedFormats: [...supportedFormats],
    supportedGeometries: [...supportedGeometries],
  };
}

// --- Compatibility predicates (UI semantics requirement + error model) ---

function hasCompatibleGeometry(artefact: Artefact): boolean {
  for (const geometry of artefact.supportedGeometries) {
    if (isGeometryAvailable(artefact, geometry)) {
      return true;
    }
  }
  return false;
}

/**
 * Reports whether a format is available for the artefact.
 * An unavailable format is never reported as available. The predicate is
 * closed under the same compatibility check used by export, so the UI never advertises a format the current artefact cannot actually be
 * produced in. Default branch is fail-closed: when the predicate cannot
 * be confirmed, the format is not available.
 *
 * The single source of truth for UI availability: a UI must consult this
 * function (or getAvailableFormats, which delegates here) before offering
 * a format, and any format for which this returns false must not be
 * presented as available.
 */
export function isFormatAvailable(
  artefact: Artefact,
  format: ExportFormat
): boolean {
  if (artefact.payload === '') {
    return false;
  }
  if (!EXPORT_FORMATS.includes(format)) {
    return false;
  }
  if (artefact.supportedFormats.length === 0) {
    return false;
  }
  if (!hasCompatibleGeometry(artefact)) {
    return false;
  }
  return artefact.supportedFormats.includes(format);
}

/**
 * Reports whether a geometry is available for the artefact.
 * An unavailable geometry is never reported as available. The predicate
 * uses the same geometry check as export so a UI cannot offer a geometry
 * the current artefact cannot be produced at. Default branch is fail-closed.
 */
export function isGeometryAvailable(
  artefact: Artefact,
  geometry: Geometry
): boolean {
  if (artefact.payload === '') {
    return false;
  }
  if (!Number.isFinite(geometry.width) || !Number.isFinite(geometry.height) ||
      geometry.width <= 0 || geometry.height <= 0) {
    return false;
  }
  if (artefact.supportedGeometries.length === 0) {
    return false;
  }
  return artefact.supportedGeometries.some(
    (g) => g.width === geometry.width && g.height === geometry.height
  );
}

// --- Enumeration functions (UI semantics requirement) ---

/**
 * Returns the formats the artefact can actually be delivered in.
 * An unavailable format is never present in this list. The enumeration is
 * closed under the same compatibility predicate used by export, so the UI
 * never advertises a format the current artefact cannot actually be
 * produced in.
 *
 * Default branch is fail-closed: an artefact with no payload, no supported
 * formats, or no compatible format has an empty availability set. Callers
 * must not present any format as available unless it appears here.
 */
export function getAvailableFormats(artefact: Artefact): readonly ExportFormat[] {
  if (artefact.payload === '') {
    return [];
  }
  if (artefact.supportedFormats.length === 0) {
    return [];
  }
  const supported: ExportFormat[] = [];
  for (const format of EXPORT_FORMATS) {
    if (isFormatAvailable(artefact, format)) {
      supported.push(format);
    }
  }
  return supported;
}

/**
 * Returns the geometries the artefact can actually be delivered in.
 * An unavailable geometry is never present in this list. The enumeration
 * uses the same geometry predicate as export so a UI cannot offer a
 * geometry the current artefact cannot be produced at.
 *
 * Default branch is fail-closed: an artefact with no payload, no
 * supported geometries, or no valid geometry has an empty availability
 * set.
 */
export function getAvailableGeometries(artefact: Artefact): readonly Geometry[] {
  if (artefact.payload === '') {
    return [];
  }
  if (artefact.supportedGeometries.length === 0) {
    return [];
  }
  const available: Geometry[] = [];
  for (const geometry of artefact.supportedGeometries) {
    if (isGeometryAvailable(artefact, geometry)) {
      available.push({ width: geometry.width, height: geometry.height });
    }
  }
  return available;
}

// --- Compatibility check (error model requirement) ---

/**
 * Reports whether an artefact can be expressed in a given format.
 * Refusal must precede production: this is the check callers use before
 * exporting. Fail-closed: any predicate that cannot be confirmed returns
 * false.
 */
export function isFormatCompatible(artefact: Artefact, format: ExportFormat): boolean {
  return isFormatAvailable(artefact, format);
}

/**
 * Reports whether an artefact can be delivered at a given geometry.
 * Fail-closed: an invalid geometry is never reported as supported.
 */
export function isGeometrySupported(artefact: Artefact, geometry: Geometry): boolean {
  return isGeometryAvailable(artefact, geometry);
}

// --- Validation (validation requirement) ---

/**
 * Validates that an exported file decodes to the requested payload in the
 * requested format. Used to confirm round-trip fidelity across every
 * declared output format.
 */
export function validateExport(
  file: string,
  format: ExportFormat,
  payload: string,
  geometry: Geometry
): boolean {
  if (file === '' || payload === '') {
    return false;
  }
  switch (format) {
    case 'png':
      return file === encodeAsPng(payload, geometry);
    case 'svg':
      return file === encodeAsSvg(payload, geometry);
    case 'json': {
      try {
        const parsed: unknown = JSON.parse(file);
        if (typeof parsed !== 'object' || parsed === null) {
          return false;
        }
        const obj = parsed as { width?: unknown; height?: unknown; payload?: unknown };
        return (
          obj.width === geometry.width &&
          obj.height === geometry.height &&
          obj.payload === payload
        );
      } catch {
        return false;
      }
    }
  }
}

// --- Export function (contracts + error model) ---

/**
 * Exports an artefact in the declared output format.
 * Returns the encoded file together with the format and geometry delivered.
 * If the format is incompatible, returns a failure naming the
 * incompatibility, and no file is produced.
 *
 * The check precedes the mutation: when audit is supplied, no encoded
 * file is produced if audit throws or returns false. Audit ordering is
 * observable: the audit function runs first, and if it throws or returns false,
 * no encoding occurs.
 */
export function exportArtefact(
  artefact: Artefact,
  format: ExportFormat,
  geometry: Geometry = DEFAULT_GEOMETRY,
  audit?: (format: ExportFormat, geometry: Geometry) => boolean | void
): ExportOutcome {
  // 1. Audit hook: observable failure before any production.
  //    No mutation (encoding) occurs if audit throws or returns false.
  if (audit !== undefined) {
    let auditResult: boolean | void;
    try {
      auditResult = audit(format, geometry);
    } catch (auditError) {
      const message = auditError instanceof Error ? auditError.message : String(auditError);
      return {
        success: false,
        error: {
          code: 'INCOMPATIBLE_FORMAT',
          message: `Export refused by audit policy: ${message}`,
          incompatibility: `audit:${message}`,
        },
      };
    }
    if (auditResult === false) {
      return {
        success: false,
        error: {
          code: 'INCOMPATIBLE_FORMAT',
          message: `Export refused by audit policy.`,
          incompatibility: 'audit:denied',
        },
      };
    }
  }

  // 2. Compatibility check precedes file production.
  if (!isFormatCompatible(artefact, format)) {
    return {
      success: false,
      error: {
        code: 'INCOMPATIBLE_FORMAT',
        message: `Artefact "${artefact.id}" cannot be expressed in format "${format}".`,
        incompatibility: `format:${format} not in [${artefact.supportedFormats.join(', ')}]`,
      },
    };
  }

  // 3. Geometry must also be supported.
  if (!isGeometrySupported(artefact, geometry)) {
    const supported = artefact.supportedGeometries
      .map((g) => `${g.width}x${g.height}`)
      .join(', ');
    return {
      success: false,
      error: {
        code: 'INCOMPATIBLE_GEOMETRY',
        message: `Artefact "${artefact.id}" cannot be delivered at ${geometry.width}x${geometry.height}.`,
        incompatibility: `geometry:${geometry.width}x${geometry.height} not in [${supported}]`,
      },
    };
  }

  // 4. Payload must be present.
  if (artefact.payload === '') {
    return {
      success: false,
      error: {
        code: 'EMPTY_PAYLOAD',
        message: `Artefact "${artefact.id}" has no payload to export.`,
        incompatibility: 'payload:empty',
      },
    };
  }

  // 5. Geometry validity.
  if (!Number.isFinite(geometry.width) || !Number.isFinite(geometry.height) ||
      geometry.width <= 0 || geometry.height <= 0) {
    return {
      success: false,
      error: {
        code: 'INVALID_GEOMETRY',
        message: `Geometry ${geometry.width}x${geometry.height} is not valid.`,
        incompatibility: `geometry:${geometry.width}x${geometry.height} invalid`,
      },
    };
  }

  // 6. Produce the encoded output.
  let file: string;
  switch (format) {
    case 'png':
      file = encodeAsPng(artefact.payload, geometry);
      break;
    case 'svg':
      file = encodeAsSvg(artefact.payload, geometry);
      break;
    case 'json':
      file = encodeAsJson(artefact.payload, geometry);
      break;
  }

  return {
    success: true,
    result: {
      file,
      format,
      geometry: { width: geometry.width, height: geometry.height },
    },
  };
}

// --- Composite workflow ---

/**
 * Exercises the export path end to end: enumerates available formats,
 * exports each one, and validates that the produced file decodes to the
 * payload.
 */
export function exportInAllFormats(artefact: Artefact): readonly ExportOutcome[] {
  const formats = getAvailableFormats(artefact);
  const geometries = getAvailableGeometries(artefact);
  if (formats.length === 0 || geometries.length === 0) {
    return [];
  }
  const geometry = geometries[0];
  return formats.map((format) => {
    const outcome = exportArtefact(artefact, format, geometry);
    if (outcome.success) {
      const verified = validateExport(outcome.result.file, outcome.result.format, artefact.payload, outcome.result.geometry);
      if (!verified) {
        return {
          success: false,
          error: {
            code: 'INCOMPATIBLE_FORMAT',
            message: `Round-trip validation failed for format "${format}".`,
            incompatibility: `validation:${format}`,
          },
        };
      }
    }
    return outcome;
  });
}

// --- Compatibility matrix builder (UI semantics requirement) ---

/**
 * Returns a readonly matrix pairing every available format with every
 * available geometry. The set of available formats and the set of available
 * geometries are derived from the same predicates export uses, so a pair
 * returned here is guaranteed to be deliverable: a UI presenting this
 * matrix never offers a combination the artefact cannot actually be
 * produced in.
 *
 * The matrix is closed under `getAvailableFormats` and
 * `getAvailableGeometries`, so no unavailable format or geometry can
 * appear in it. Default branch is fail-closed: when either side is empty,
 * the matrix is empty.
 */
export function getExportCompatibilityMatrix(
  artefact: Artefact
): readonly { readonly format: ExportFormat; readonly geometry: Geometry }[] {
  const formats = getAvailableFormats(artefact);
  const geometries = getAvailableGeometries(artefact);
  if (formats.length === 0 || geometries.length === 0) {
    return [];
  }
  const matrix: { readonly format: ExportFormat; readonly geometry: Geometry }[] = [];
  for (const format of formats) {
    for (const geometry of geometries) {
      matrix.push({ format, geometry: { width: geometry.width, height: geometry.height } });
    }
  }
  return matrix;
}

/**
 * Reports whether a format is available for the artefact, using the same
 * availability predicate as `getAvailableFormats`. This is the single source
 * of truth for UI availability: a UI must consult this function before
 * offering a format, and any format for which this returns false must not
 * be presented as available.
 *
 * Fail-closed: when the predicate cannot be confirmed, the format is not
 * available.
 */
export function isExportFormatAvailable(
  artefact: Artefact,
  format: ExportFormat
): boolean {
  return isFormatAvailable(artefact, format);
}