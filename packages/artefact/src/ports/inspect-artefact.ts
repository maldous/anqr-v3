import type { ErrorCorrectionLevel } from "../qr/spec.ts";

// Inbound port: take an artefact or payload and return what it says, how it is
// built, and whether it will scan.

export interface ArtefactStructure {
  readonly symbolVersion: number;
  readonly errorCorrectionLevel: ErrorCorrectionLevel;
  readonly maskPattern: number;
  readonly moduleCount: number;
  readonly errorsCorrected: number;
  /** Remaining correction budget in codewords, which is what makes a scan
   *  safety verdict a measurement rather than an opinion. */
  readonly damageMarginCodewords: number;
}

export type InspectRefusalReason = "GRID_UNREADABLE" | "FORMAT_UNRECOVERABLE" | "UNCORRECTABLE";

export type InspectResult =
  | { readonly ok: true; readonly payload: string; readonly structure: ArtefactStructure }
  | { readonly ok: false; readonly reason: InspectRefusalReason; readonly detail: string };

export interface InspectArtefactPort {
  inspect(modules: Uint8Array, size: number): Promise<InspectResult>;
}
