import { dataCodewords, ERROR_CORRECTION_LEVELS, MAX_VERSION, MIN_VERSION, type ErrorCorrectionLevel } from "../qr/spec.ts";
import { makeSegment, selectMode } from "../qr/encode.ts";

// The admissible join.
//
// A user interface collects values. It must not assemble them into a capability
// request, because the constraints between them are product semantics, not
// presentation. This is the one place where a set of supplied values becomes a
// specification, and an inadmissible combination is refused here rather than
// discovered downstream or, worse, silently corrected.
//
// The rules it enforces are declared in the semantic graph and projected into
// packages/architecture/experience.json. They are re-stated as executable
// checks here, and a drift check compares the projection against the graph, so
// this file cannot quietly enforce something the graph does not say.

export type OutputFormat = "svg" | "png" | "gif";

/** What a caller supplies: unvalidated, possibly inconsistent. */
export interface SuppliedValues {
  readonly payload: string;
  readonly errorCorrectionLevel: string;
  readonly outputFormat: string;
  readonly symbolVersion?: number | "auto";
  readonly maskPattern?: number | "auto";
  readonly moduleSizePx?: number;
  readonly quietZoneModules?: number;
  readonly foregroundColour?: string;
  readonly backgroundColour?: string;
}

/** What the producer accepts: validated, internally consistent. */
export interface ArtefactSpecification {
  readonly payload: string;
  readonly errorCorrectionLevel: ErrorCorrectionLevel;
  readonly outputFormat: OutputFormat;
  readonly symbolVersion: number | "auto";
  readonly maskPattern: number | "auto";
  readonly moduleSizePx: number;
  readonly quietZoneModules: number;
  readonly foregroundColour: string;
  readonly backgroundColour: string;
}

export type JoinRefusalCode =
  | "PAYLOAD_EMPTY"
  | "PAYLOAD_TOO_LARGE"
  | "ERROR_CORRECTION_LEVEL_UNKNOWN"
  | "OUTPUT_FORMAT_UNKNOWN"
  | "SYMBOL_VERSION_OUT_OF_RANGE"
  | "MASK_PATTERN_OUT_OF_RANGE"
  | "MODULE_SIZE_OUT_OF_RANGE"
  | "QUIET_ZONE_OUT_OF_RANGE"
  | "COLOUR_MALFORMED"
  | "SYMBOL_VERSION_TOO_SMALL_FOR_PAYLOAD"
  | "CONTRAST_BELOW_FLOOR";

export interface JoinRefusal {
  readonly code: JoinRefusalCode;
  /** The parameter the actor should change, so feedback can be placed. */
  readonly parameter: string;
  readonly detail: string;
  /** The declared join rule this refusal enforces, where one governs it. */
  readonly joinRule?: string;
}

export type JoinResult =
  | { readonly admissible: true; readonly specification: ArtefactSpecification }
  | { readonly admissible: false; readonly refusals: readonly JoinRefusal[] };

export const OUTPUT_FORMATS: readonly OutputFormat[] = ["svg", "png", "gif"];
export const MINIMUM_CONTRAST_RATIO = 4.5;
const MODULE_SIZE_RANGE = [1, 64] as const;
const QUIET_ZONE_RANGE = [0, 16] as const;
const COLOUR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function relativeLuminance(colour: string): number {
  const channel = (value: number): number => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  const red = channel(Number.parseInt(colour.slice(1, 3), 16));
  const green = channel(Number.parseInt(colour.slice(3, 5), 16));
  const blue = channel(Number.parseInt(colour.slice(5, 7), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG contrast ratio, which is what the design profile's floor is stated in. */
export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Join supplied values into a specification, or refuse.
 *
 * Every refusal names the parameter to change, because a validation message
 * that cannot be placed beside its input is a validation message the actor
 * cannot act on.
 */
export function joinArtefactSpecification(supplied: SuppliedValues): JoinResult {
  const refusals: JoinRefusal[] = [];

  const payload = supplied.payload;
  if (payload.length === 0) {
    refusals.push({ code: "PAYLOAD_EMPTY", parameter: "payload", detail: "Enter what the code should carry." });
  }

  const level = supplied.errorCorrectionLevel as ErrorCorrectionLevel;
  if (!ERROR_CORRECTION_LEVELS.includes(level)) {
    refusals.push({
      code: "ERROR_CORRECTION_LEVEL_UNKNOWN", parameter: "errorCorrectionLevel",
      detail: `Error correction must be one of ${ERROR_CORRECTION_LEVELS.join(", ")}.`,
    });
  }

  const format = supplied.outputFormat as OutputFormat;
  if (!OUTPUT_FORMATS.includes(format)) {
    refusals.push({
      code: "OUTPUT_FORMAT_UNKNOWN", parameter: "outputFormat",
      detail: `Output format must be one of ${OUTPUT_FORMATS.join(", ")}.`,
    });
  }

  const symbolVersion = supplied.symbolVersion ?? "auto";
  if (symbolVersion !== "auto" && (!Number.isInteger(symbolVersion) || symbolVersion < MIN_VERSION || symbolVersion > MAX_VERSION)) {
    refusals.push({
      code: "SYMBOL_VERSION_OUT_OF_RANGE", parameter: "symbolVersion",
      detail: `Symbol version must be between ${MIN_VERSION} and ${MAX_VERSION}, or automatic.`,
    });
  }

  const maskPattern = supplied.maskPattern ?? "auto";
  if (maskPattern !== "auto" && (!Number.isInteger(maskPattern) || maskPattern < 0 || maskPattern > 7)) {
    refusals.push({ code: "MASK_PATTERN_OUT_OF_RANGE", parameter: "maskPattern", detail: "Mask must be 0 to 7, or automatic." });
  }

  const moduleSizePx = supplied.moduleSizePx ?? 6;
  if (!Number.isInteger(moduleSizePx) || moduleSizePx < MODULE_SIZE_RANGE[0] || moduleSizePx > MODULE_SIZE_RANGE[1]) {
    refusals.push({
      code: "MODULE_SIZE_OUT_OF_RANGE", parameter: "moduleSizePx",
      detail: `Module size must be between ${MODULE_SIZE_RANGE[0]} and ${MODULE_SIZE_RANGE[1]} pixels.`,
    });
  }

  const quietZoneModules = supplied.quietZoneModules ?? 4;
  if (!Number.isInteger(quietZoneModules) || quietZoneModules < QUIET_ZONE_RANGE[0] || quietZoneModules > QUIET_ZONE_RANGE[1]) {
    refusals.push({
      code: "QUIET_ZONE_OUT_OF_RANGE", parameter: "quietZoneModules",
      detail: `Quiet zone must be between ${QUIET_ZONE_RANGE[0]} and ${QUIET_ZONE_RANGE[1]} modules.`,
    });
  }

  const foregroundColour = supplied.foregroundColour ?? "#000000";
  const backgroundColour = supplied.backgroundColour ?? "#ffffff";
  for (const [name, value] of [["foregroundColour", foregroundColour], ["backgroundColour", backgroundColour]] as const) {
    if (!COLOUR_PATTERN.test(value)) {
      refusals.push({ code: "COLOUR_MALFORMED", parameter: name, detail: "Colour must be a six-digit hex value such as #1a365d." });
    }
  }

  // Cross-parameter rules. Evaluated only once each participant is
  // individually valid, so an actor sees the specific defect rather than a
  // cascade caused by an earlier one.
  if (refusals.length === 0) {
    // constrains payload -> symbolVersion, and
    // constrains errorCorrectionLevel -> symbolVersion.
    // A forced version must hold the payload at the chosen level. Refused
    // rather than upgraded: upgrading returns a different-sized artefact from
    // the one asked for, which is a different artefact.
    if (symbolVersion !== "auto") {
      const segment = makeSegment(payload, selectMode(payload));
      const headerBits = 4 + (symbolVersion <= 9 ? 8 : 16);
      const requiredBits = segment.mode === "byte" ? headerBits + segment.bits.length : 4 + 14 + segment.bits.length;
      const capacityBits = dataCodewords(symbolVersion, level) * 8;
      if (requiredBits > capacityBits) {
        refusals.push({
          code: "SYMBOL_VERSION_TOO_SMALL_FOR_PAYLOAD", parameter: "symbolVersion",
          detail: `Version ${symbolVersion} at level ${level} holds ${Math.floor(capacityBits / 8)} data codewords, and this payload needs more. Choose a higher version, a lower error-correction level, or automatic.`,
          joinRule: "urn:anqr:artefact-parameter-join-rule:24-constrains-payload-symbolVersion",
        });
      }
    }

    // constrains foregroundColour -> minimumContrastRatio.
    const ratio = contrastRatio(foregroundColour, backgroundColour);
    if (ratio < MINIMUM_CONTRAST_RATIO) {
      refusals.push({
        code: "CONTRAST_BELOW_FLOOR", parameter: "foregroundColour",
        detail: `These colours contrast at ${ratio.toFixed(2)} to 1, below the ${MINIMUM_CONTRAST_RATIO} to 1 floor a scanner needs. Darken the foreground or lighten the background.`,
        joinRule: "urn:anqr:artefact-parameter-join-rule:18-constrains-foregroundColour-minimumContrastRatio",
      });
    }
  }

  if (refusals.length > 0) return { admissible: false, refusals };
  return {
    admissible: true,
    specification: {
      payload, errorCorrectionLevel: level, outputFormat: format,
      symbolVersion, maskPattern, moduleSizePx, quietZoneModules,
      foregroundColour, backgroundColour,
    },
  };
}
