import type { ErrorCorrectionLevel } from "../qr/spec.ts";

// Inbound port: take a validated artefact specification and return a produced
// artefact. Inbound means the application layer is DRIVEN through this; a
// delivery surface calls it and never reaches the domain directly.

export interface ArtefactSpecification {
  readonly payload: string;
  readonly errorCorrectionLevel?: ErrorCorrectionLevel;
  readonly symbolVersion?: number;
  readonly maskPattern?: number | "auto";
  readonly outputFormat: "svg" | "png" | "gif";
  readonly moduleSizePx?: number;
  readonly quietZoneModules?: number;
  readonly foregroundColour?: string;
  readonly backgroundColour?: string;
}

export interface ProducedArtefact {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly symbolVersion: number;
  readonly errorCorrectionLevel: ErrorCorrectionLevel;
  readonly maskPattern: number;
  /** Set only when production re-decoded its own artefact, which the
   *  scan-safety contract requires for anything deliberately damaged. */
  readonly decodedPayload: string | null;
}

export type ProduceRefusalReason =
  | "PAYLOAD_TOO_LARGE"
  | "SPECIFICATION_INADMISSIBLE"
  | "CONTRAST_BELOW_FLOOR"
  | "DECODE_VERIFICATION_FAILED";

export type ProduceResult =
  | { readonly ok: true; readonly artefact: ProducedArtefact }
  | { readonly ok: false; readonly reason: ProduceRefusalReason; readonly detail: string };

export interface ProduceArtefactPort {
  produce(specification: ArtefactSpecification): Promise<ProduceResult>;
}
