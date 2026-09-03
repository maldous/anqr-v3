import type { ClockPort } from "../ports/clock.ts";
import type { ContainerEncoderPort, Frame } from "../ports/container-encoder.ts";
import type { RasterSurfacePort, Rgba } from "../ports/raster-surface.ts";
import { decodeSymbol } from "../qr/decode.ts";
import { encodePayload } from "../qr/encode.ts";
import { buildSymbol } from "../qr/matrix.ts";
import { blockLayout } from "../qr/spec.ts";
import {
  joinArtefactSpecification, type ArtefactSpecification, type JoinRefusal, type OutputFormat, type SuppliedValues,
} from "../model/artefact-specification.ts";

// The artefact production use case.
//
// This is the application layer: it composes domain operations into a product
// outcome and drives outbound ports. It imports the domain and the ports and it
// must never import an adapter — the concrete rasteriser and container encoder
// arrive injected, which is what lets the same use case serve a browser, an
// HTTP surface and a protocol server without change.
//
// It also never accepts loose values. A caller supplies values, the join
// decides whether they constitute a specification, and only a specification
// reaches production.

// Re-exported deliberately. The delivery layer needs these types and may not
// import the domain, so the application layer's public surface is what carries
// them outward. This is the dependency rule doing its job rather than an
// inconvenience worked around.
export type {
  ArtefactSpecification, JoinRefusal, JoinRefusalCode, OutputFormat, SuppliedValues,
} from "../model/artefact-specification.ts";
export { OUTPUT_FORMATS, MINIMUM_CONTRAST_RATIO, contrastRatio } from "../model/artefact-specification.ts";

export interface ProducerDependencies {
  /** Injected, never imported: which container serves a chosen format. */
  containerFor(format: OutputFormat): ContainerEncoderPort;
  surfaceFor(width: number, height: number): RasterSurfacePort;
  clock: ClockPort;
}

export interface ArtefactStructure {
  readonly symbolVersion: number;
  readonly errorCorrectionLevel: string;
  readonly maskPattern: number;
  readonly moduleCount: number;
  readonly sizePx: number;
  /** Codewords of damage the symbol can still absorb, per block. */
  readonly damageMarginCodewords: number;
}

export interface ScanSafety {
  /** Whether production decoded its own artefact back to the requested payload. */
  readonly verified: boolean;
  readonly decodedPayload: string | null;
  readonly verdict: "scannable" | "unverified" | "unsafe";
  readonly detail: string;
}

export interface ProducedArtefact {
  readonly specification: ArtefactSpecification;
  readonly structure: ArtefactStructure;
  readonly scanSafety: ScanSafety;
  /** The rendered artefact, ready for a container or a preview. */
  readonly frame: Frame;
  readonly producedAtMs: number;
}

export type ProduceRefusal =
  | { readonly kind: "inadmissible"; readonly refusals: readonly JoinRefusal[] }
  | { readonly kind: "unsafe"; readonly detail: string }
  | { readonly kind: "production-failed"; readonly detail: string };

export type ProduceResult =
  | { readonly ok: true; readonly artefact: ProducedArtefact }
  | { readonly ok: false; readonly refusal: ProduceRefusal };

export type ExportResult =
  | { readonly ok: true; readonly bytes: Uint8Array; readonly mediaType: string; readonly byteLength: number }
  | { readonly ok: false; readonly refusal: ProduceRefusal };

const hexToRgba = (colour: string): Rgba => ({
  red: Number.parseInt(colour.slice(1, 3), 16),
  green: Number.parseInt(colour.slice(3, 5), 16),
  blue: Number.parseInt(colour.slice(5, 7), 16),
  alpha: 255,
});

export interface ArtefactProducer {
  produce(supplied: SuppliedValues): Promise<ProduceResult>;
  exportArtefact(artefact: ProducedArtefact): Promise<ExportResult>;
}

export function createArtefactProducer(dependencies: ProducerDependencies): ArtefactProducer {
  return {
    async produce(supplied: SuppliedValues): Promise<ProduceResult> {
      const join = joinArtefactSpecification(supplied);
      if (!join.admissible) return { ok: false, refusal: { kind: "inadmissible", refusals: join.refusals } };
      const specification = join.specification;

      let symbol;
      let encoded;
      try {
        encoded = encodePayload(specification.payload, {
          level: specification.errorCorrectionLevel,
          ...(specification.symbolVersion === "auto" ? {} : { minimumVersion: specification.symbolVersion }),
        });
        symbol = buildSymbol(encoded.codewords, encoded.version, encoded.level, {
          mask: specification.maskPattern,
        });
      } catch (error) {
        return {
          ok: false,
          refusal: { kind: "production-failed", detail: error instanceof Error ? error.message : String(error) },
        };
      }

      // Scan safety is a measurement, not an assurance: production decodes its
      // own artefact and compares. A verdict asserted without decoding would be
      // exactly the claim the recorded codec limitation once made.
      let scanSafety: ScanSafety;
      try {
        const decoded = decodeSymbol(symbol.modules, symbol.size);
        scanSafety = decoded.text === specification.payload
          ? { verified: true, decodedPayload: decoded.text, verdict: "scannable", detail: "Decoded back to exactly the requested payload." }
          : { verified: true, decodedPayload: decoded.text, verdict: "unsafe", detail: "Decoded to something other than the requested payload." };
      } catch (error) {
        scanSafety = {
          verified: false, decodedPayload: null, verdict: "unsafe",
          detail: `The produced symbol could not be decoded: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
      if (scanSafety.verdict === "unsafe") return { ok: false, refusal: { kind: "unsafe", detail: scanSafety.detail } };

      const scale = specification.moduleSizePx;
      const quiet = specification.quietZoneModules;
      const sizePx = (symbol.size + quiet * 2) * scale;
      const surface = dependencies.surfaceFor(sizePx, sizePx);
      surface.fill(hexToRgba(specification.backgroundColour));
      const foreground = hexToRgba(specification.foregroundColour);
      for (let y = 0; y < symbol.size; y += 1) {
        for (let x = 0; x < symbol.size; x += 1) {
          if (symbol.modules[y * symbol.size + x] === 1) {
            surface.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale, foreground);
          }
        }
      }

      const layout = blockLayout(symbol.version, symbol.level);
      return {
        ok: true,
        artefact: {
          specification,
          structure: {
            symbolVersion: symbol.version,
            errorCorrectionLevel: symbol.level,
            maskPattern: symbol.mask,
            moduleCount: symbol.size * symbol.size,
            sizePx,
            damageMarginCodewords: Math.floor(layout.ecPerBlock / 2),
          },
          scanSafety,
          frame: { width: sizePx, height: sizePx, pixels: surface.pixels(), durationMs: 0 },
          producedAtMs: dependencies.clock.nowMs(),
        },
      };
    },

    async exportArtefact(artefact: ProducedArtefact): Promise<ExportResult> {
      // Refusing to export an unverified artefact is the scan-safe-output
      // claim being real rather than decorative.
      if (artefact.scanSafety.verdict !== "scannable") {
        return { ok: false, refusal: { kind: "unsafe", detail: artefact.scanSafety.detail } };
      }
      try {
        const container = dependencies.containerFor(artefact.specification.outputFormat);
        const encoded = await container.encode([artefact.frame]);
        return { ok: true, bytes: encoded.bytes, mediaType: encoded.mediaType, byteLength: encoded.bytes.length };
      } catch (error) {
        return {
          ok: false,
          refusal: { kind: "production-failed", detail: error instanceof Error ? error.message : String(error) },
        };
      }
    },
  };
}
