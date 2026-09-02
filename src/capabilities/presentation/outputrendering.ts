// outputrendering.ts
// Capability module for output rendering in the ANQR product.

// --- Type definitions ------------------------------------------------------

// Supported output formats.
export const OUTPUT_FORMATS = ['png', 'webp', 'gif', 'svg'] as const;
export type OutputFormat = typeof OUTPUT_FORMATS[number];

// Fit mode determines how source geometry is fitted into the target rectangle.
export const FIT_MODES = ['contain', 'cover', 'fill', 'inside', 'outside'] as const;
export type FitMode = typeof FIT_MODES[number];

// Optional crop region – coordinates are expressed in source pixel space.
export interface CropRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

// Geometry specification – either a square size or explicit width/height.
export type Geometry =
  | { readonly size: number } // square size
  | { readonly width: number; readonly height: number };

// Rendering options supplied by callers.
export interface RenderOptions {
  readonly format: OutputFormat;
  readonly geometry: Geometry;
  readonly fit?: FitMode; // defaults to 'contain'
  readonly crop?: CropRegion; // optional crop before scaling
  readonly features?: readonly ('animation' | 'transparency')[]; // requested features
}

// Successful render result – a Buffer containing the encoded artefact.
export interface RenderSuccess {
  readonly success: true;
  readonly artefact: Buffer;
  readonly format: OutputFormat;
}

// Render failure – includes a human readable message and the offending format/feature.
export interface RenderFailure {
  readonly success: false;
  readonly error: {
    readonly message: string;
    readonly format: OutputFormat;
    readonly unsupportedFeature?: string;
    readonly role: 'alert';
  };
}

export type RenderResult = RenderSuccess | RenderFailure;

// --- Constants ------------------------------------------------------------

export const DEFAULT_FIT_MODE: FitMode = 'contain';
export const ALERT_ROLE = 'alert' as const;

// --- Helper validation functions ------------------------------------------

/**
 * Validates that a given format can carry all requested features.
 * Returns a RenderFailure if any feature is unsupported.
 */
function validateFeatures(
  format: OutputFormat,
  features?: readonly ('animation' | 'transparency')[]
): RenderFailure | null {
  if (!features || features.length === 0) {
    return null;
  }
  for (const feature of features) {
    if (feature === 'animation' && format === 'svg') {
      return {
        success: false,
        error: {
          message: `Format "${format}" cannot carry feature "${feature}".`,
          format,
          unsupportedFeature: feature,
          role: ALERT_ROLE,
        },
      };
    }
    // Additional feature checks can be added here.
  }
  return null;
}

/**
 * Validates geometry values (positive numbers) and fit mode.
 * Returns a RenderFailure on invalid input.
 */
function validateGeometry(
  geometry: Geometry,
  fit?: FitMode
): RenderFailure | null {
  const isPositive = (n: number) => Number.isFinite(n) && n > 0;
  if ('size' in geometry) {
    if (!isPositive(geometry.size)) {
      return {
        success: false,
        error: {
          message: `Size must be a positive number; received ${geometry.size}.`,
          format: 'png', // placeholder – caller will replace on actual validation
          role: ALERT_ROLE,
        },
      };
    }
  } else {
    if (!isPositive(geometry.width) || !isPositive(geometry.height)) {
      return {
        success: false,
        error: {
          message: `Width and height must be positive numbers; received ${geometry.width}x${geometry.height}.`,
          format: 'png',
          role: ALERT_ROLE,
        },
      };
    }
  }
  if (fit && !FIT_MODES.includes(fit as any)) {
    return {
      success: false,
      error: {
        message: `Fit mode "${fit}" is not supported.`,
        format: 'png',
        role: ALERT_ROLE,
      },
    };
  }
  return null;
}

/**
 * Public audit function – callers may pass a custom audit implementation.
 * The default audit performs the built‑in validation.
 */
export type AuditFn = (options: RenderOptions) => RenderFailure | null;

export const defaultAudit: AuditFn = (options) => {
  const featureError = validateFeatures(options.format, options.features);
  if (featureError) return featureError;
  const geometryError = validateGeometry(options.geometry, options.fit);
  if (geometryError) return geometryError;
  return null;
};

// --- Core rendering function -----------------------------------------------

/**
 * Renders an artefact according to the supplied options.
 * The function is pure – it does not mutate `options` and returns a new Buffer.
 * It accepts an `audit` function which is executed before any mutation; if the audit returns a failure, rendering is aborted.
 */
export function render(
  options: RenderOptions,
  audit: AuditFn = defaultAudit
): RenderResult {
  // Step 1: audit – must be observable before any mutation.
  const auditResult = audit(options);
  if (auditResult) {
    return auditResult;
  }

  // Step 2: produce a dummy Buffer representing the artefact.
  // Since we cannot depend on external imaging libraries, we simulate
  // the output with a simple identifier string.
  const identifier = `${options.format}|${JSON.stringify(options.geometry)}|${options.fit ?? DEFAULT_FIT_MODE}`;
  const buffer = Buffer.from(identifier, 'utf8');

  return {
    success: true,
    artefact: buffer,
    format: options.format,
  };
}

// --- Validation of produced artefact ---------------------------------------

/**
 * Parses the returned artefact Buffer and verifies it matches the declared format.
 * In a real implementation this would invoke a decoder; here we perform a minimal check.
 */
export function validateArtefact(
  result: RenderResult
): RenderResult {
  if (!result.success) {
    return result;
  }
  // Simple sanity check: the buffer must contain the format name as a prefix.
  const content = result.artefact.toString('utf8');
  if (!content.startsWith(result.format)) {
    return {
      success: false,
      error: {
        message: `Artefact does not match declared format ${result.format}.`,
        format: result.format,
        role: ALERT_ROLE,
      },
    };
  }
  return result;
}

// --- Exported constants for external consumption ---------------------------

export const SUPPORTED_FEATURES = ['animation', 'transparency'] as const;
export type SupportedFeature = typeof SUPPORTED_FEATURES[number];

// End of module