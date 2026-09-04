// platformparity.ts
// One specification, one artefact, everywhere. ANQR realises the same
// capability on more than one delivery surface (container architectures, an
// edge runtime), and a surface that emits even one different byte, one
// reordered refusal reason or one softer scan verdict forks the product
// silently: callers pin digests, cache refusals and trust verdicts without
// knowing which surface answered. This module owns the canonical realisation
// — bytes, refusal reasons and scan verdict as functions of the specification
// alone — and the audit that catches a surface which drifts from it.

import { createHash } from "node:crypto";

/**
 * The surfaces ANQR actually ships from. Parity is only meaningful over a
 * declared set: an audit over "whatever showed up" would pass when a surface
 * silently stopped realising anything at all.
 */
export const DELIVERY_SURFACES = ["linux-amd64", "linux-arm64", "wasm32-edge"] as const;
export type DeliverySurface = (typeof DELIVERY_SURFACES)[number];

/**
 * Refusal reasons are derived from the specification, never from the surface,
 * so identical specifications refuse identically everywhere. Declared as an
 * ordered set: the declaration order is the canonical reporting order.
 */
export const REFUSAL_REASONS = [
  "empty-payload",
  "payload-too-large",
  "name-not-portable",
  "media-type-undeclared",
] as const;
export type RefusalReason = (typeof REFUSAL_REASONS)[number];

export const SCAN_VERDICTS = ["safe", "unsafe", "unscannable"] as const;
export type ScanVerdict = (typeof SCAN_VERDICTS)[number];

export const PARITY_VERDICTS = ["parity", "divergent"] as const;
export type ParityVerdict = (typeof PARITY_VERDICTS)[number];

export const DIVERGENCE_KINDS = [
  "surface-unrealised",
  "surface-duplicated",
  "artefact-bytes-differ",
  "refusal-reasons-differ",
  "scan-verdict-differs",
] as const;
export type DivergenceKind = (typeof DIVERGENCE_KINDS)[number];

export const PUBLISH_REFUSAL_KINDS = [
  "parity-divergent",
  "specification-refused",
  "scan-refused",
  "digest-conflict",
] as const;
export type PublishRefusalKind = (typeof PUBLISH_REFUSAL_KINDS)[number];

/**
 * Schemes a scanned payload may launch without a person deciding first.
 * Membership grants safety; everything else is denied by omission.
 */
export const SAFE_SCHEMES = ["https", "mailto", "tel"] as const;
export type SafeScheme = (typeof SAFE_SCHEMES)[number];

/** QR version 40 binary capacity: the largest payload any surface can encode. */
export const MAX_PAYLOAD_BYTES = 2953;

export interface ArtefactSpecification {
  /** Names one artefact across every surface, so it must survive all of them. */
  readonly name: string;
  readonly mediaType: string;
  readonly payload: string;
}

/** What one surface claims to have produced for a specification. */
export interface SurfaceRealisation {
  readonly surface: DeliverySurface;
  readonly artefactBytes: Uint8Array;
  readonly refusalReasons: readonly RefusalReason[];
  readonly scanVerdict: ScanVerdict;
}

export interface Divergence {
  readonly kind: DivergenceKind;
  /** Null only when no surface exists to name: parity of nothing fails closed. */
  readonly surface: DeliverySurface | null;
  readonly detail: string;
}

export interface ParityConfirmed {
  readonly verdict: "parity";
  readonly digest: string;
  readonly refusalReasons: readonly RefusalReason[];
  readonly scanVerdict: ScanVerdict;
  readonly surfaces: readonly DeliverySurface[];
}

export interface ParityDivergent {
  readonly verdict: "divergent";
  readonly divergences: readonly Divergence[];
}

export type ParityReport = ParityConfirmed | ParityDivergent;

export type ParityAudit = (realisations: readonly SurfaceRealisation[]) => ParityReport;

export interface PublishedArtefact {
  readonly name: string;
  readonly digest: string;
  readonly surfaces: readonly DeliverySurface[];
  readonly scanVerdict: ScanVerdict;
}

export interface ParityState {
  readonly published: readonly PublishedArtefact[];
}

export const EMPTY_PARITY_STATE: ParityState = { published: [] };

export interface PublishSuccess {
  readonly ok: true;
  readonly state: ParityState;
  readonly record: PublishedArtefact;
}

export interface PublishRefusal {
  readonly ok: false;
  readonly kind: PublishRefusalKind;
  readonly detail: string;
  /** Populated only when the refusal is a parity divergence. */
  readonly divergences: readonly Divergence[];
  /** Populated only when the specification itself is refused. */
  readonly refusalReasons: readonly RefusalReason[];
}

export type PublishOutcome = PublishSuccess | PublishRefusal;

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function byteLengthOf(value: string): number {
  return utf8Bytes(value).length;
}

/**
 * A surface's line convention and Unicode composition are exactly the kind of
 * accidental input that forks bytes between architectures, so both are
 * normalised away before anything downstream sees the payload.
 */
export function normalisePayload(payload: string): string {
  return payload.replace(/\r\n?/g, "\n").normalize("NFC");
}

/**
 * Length-prefixed fields in one fixed order make the canonical form
 * injective: no pair of distinct specifications can collide by smuggling a
 * newline between fields, and no surface can reorder properties.
 */
export function canonicalSpecification(specification: ArtefactSpecification): string {
  const fields: readonly (readonly [string, string])[] = [
    ["name", specification.name],
    ["mediaType", specification.mediaType],
    ["payload", normalisePayload(specification.payload)],
  ];
  return fields.map(([key, value]) => `${key} ${byteLengthOf(value)}\n${value}\n`).join("");
}

/**
 * The artefact's bytes are a function of the specification and a version
 * marker — nothing else. No timestamp, no hostname, no architecture: each of
 * those has broken byte identity in some real build system.
 */
export function artefactBytesFor(specification: ArtefactSpecification): Uint8Array {
  return utf8Bytes(`ANQR-ARTEFACT 1\n${canonicalSpecification(specification)}`);
}

export function digestOf(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Declared order, deduplicated. Two surfaces reporting the same refusals in a
 * different order would otherwise read as a parity break, and a parity break
 * that is really a sort order would teach people to ignore the audit.
 */
export function canonicalReasonOrder(reasons: readonly RefusalReason[]): readonly RefusalReason[] {
  return REFUSAL_REASONS.filter((reason) => reasons.includes(reason));
}

const PORTABLE_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DECLARED_MEDIA_TYPE = /^[a-z]+\/[a-z0-9.+-]+$/;

export function refusalReasonsFor(specification: ArtefactSpecification): readonly RefusalReason[] {
  const reasons: RefusalReason[] = [];
  const payload = normalisePayload(specification.payload);
  if (payload.length === 0) reasons.push("empty-payload");
  if (byteLengthOf(payload) > MAX_PAYLOAD_BYTES) reasons.push("payload-too-large");
  // Lowercase letters, digits and hyphens survive every surface, including
  // case-insensitive filesystems where "Menu" and "menu" are one artefact.
  if (!PORTABLE_NAME.test(specification.name)) reasons.push("name-not-portable");
  if (!DECLARED_MEDIA_TYPE.test(specification.mediaType)) reasons.push("media-type-undeclared");
  return canonicalReasonOrder(reasons);
}

function hasControlCharacters(payload: string): boolean {
  for (const character of payload) {
    const code = character.codePointAt(0) ?? 0;
    if ((code < 0x20 && code !== 0x0a) || code === 0x7f) return true;
  }
  return false;
}

function schemeOf(payload: string): string | null {
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(payload);
  const scheme = match === null ? null : match[1];
  // Scheme comparison is case-insensitive by RFC 3986; folding here keeps a
  // surface that preserves "HTTPS:" from scoring a different verdict.
  return scheme === undefined || scheme === null ? null : scheme.toLowerCase();
}

/**
 * The verdict depends on the payload alone. A payload nothing can inspect is
 * "unscannable", not "safe": absence of evidence never grants safety.
 */
export function scanVerdictFor(specification: ArtefactSpecification): ScanVerdict {
  const payload = normalisePayload(specification.payload);
  if (payload.length === 0 || hasControlCharacters(payload)) return "unscannable";
  const scheme = schemeOf(payload);
  // Inert text carries no scheme, so a scanner has nothing to launch from it.
  if (scheme === null) return "safe";
  return (SAFE_SCHEMES as readonly string[]).includes(scheme) ? "safe" : "unsafe";
}

export function scanPermits(verdict: ScanVerdict): boolean {
  switch (verdict) {
    case "safe":
      return true;
    default:
      // Fail closed: only an explicit safe verdict permits publication.
      // "unsafe", "unscannable" and any verdict this module has never heard
      // of all deny.
      return false;
  }
}

/**
 * Realise the specification on one surface. The surface is recorded but
 * deliberately never consulted: every other field is a function of the
 * specification alone, which is how parity holds by construction. The audit
 * below exists for surfaces that reimplement this elsewhere and drift.
 */
export function realise(specification: ArtefactSpecification, surface: DeliverySurface): SurfaceRealisation {
  return {
    surface,
    artefactBytes: artefactBytesFor(specification),
    refusalReasons: refusalReasonsFor(specification),
    scanVerdict: scanVerdictFor(specification),
  };
}

export function realiseOnAllSurfaces(
  specification: ArtefactSpecification,
  surfaces: readonly DeliverySurface[] = DELIVERY_SURFACES,
): readonly SurfaceRealisation[] {
  return surfaces.map((surface) => realise(specification, surface));
}

/**
 * Compare what the surfaces actually produced. Parity is only confirmed when
 * every declared surface realised the specification and every realisation
 * agrees on bytes, refusal reasons and scan verdict; a missing surface, a
 * duplicated surface or an empty declaration all fail closed as divergence.
 */
export function auditParity(
  realisations: readonly SurfaceRealisation[],
  surfaces: readonly DeliverySurface[] = DELIVERY_SURFACES,
): ParityReport {
  const divergences: Divergence[] = [];
  const bySurface = new Map<DeliverySurface, SurfaceRealisation>();

  for (const realisation of realisations) {
    if (bySurface.has(realisation.surface)) {
      divergences.push({
        kind: "surface-duplicated",
        surface: realisation.surface,
        detail: `Surface ${realisation.surface} reported more than one realisation; which one shipped is undecidable.`,
      });
    } else {
      bySurface.set(realisation.surface, realisation);
    }
  }

  for (const surface of surfaces) {
    if (!bySurface.has(surface)) {
      divergences.push({
        kind: "surface-unrealised",
        surface,
        detail: `Surface ${surface} produced no realisation; parity over an absent surface cannot be confirmed.`,
      });
    }
  }

  const referenceSurface = surfaces.length > 0 ? surfaces[0] : undefined;
  const reference = referenceSurface === undefined ? undefined : bySurface.get(referenceSurface);
  if (reference === undefined) {
    divergences.push({
      kind: "surface-unrealised",
      surface: referenceSurface === undefined ? null : referenceSurface,
      detail: "No declared surface produced a realisation to compare against, so the audit fails closed.",
    });
    return { verdict: "divergent", divergences };
  }

  const referenceDigest = digestOf(reference.artefactBytes);
  const referenceReasons = canonicalReasonOrder(reference.refusalReasons).join(",");
  for (const [surface, candidate] of bySurface) {
    if (candidate === reference) continue;
    const candidateDigest = digestOf(candidate.artefactBytes);
    if (candidateDigest !== referenceDigest) {
      divergences.push({
        kind: "artefact-bytes-differ",
        surface,
        detail: `sha256 ${candidateDigest} differs from ${reference.surface}'s ${referenceDigest}.`,
      });
    }
    const candidateReasons = canonicalReasonOrder(candidate.refusalReasons).join(",");
    if (candidateReasons !== referenceReasons) {
      divergences.push({
        kind: "refusal-reasons-differ",
        surface,
        detail: `Refusal reasons [${candidateReasons}] differ from ${reference.surface}'s [${referenceReasons}].`,
      });
    }
    if (candidate.scanVerdict !== reference.scanVerdict) {
      divergences.push({
        kind: "scan-verdict-differs",
        surface,
        detail: `Scan verdict ${candidate.scanVerdict} differs from ${reference.surface}'s ${reference.scanVerdict}.`,
      });
    }
  }

  if (divergences.length > 0) return { verdict: "divergent", divergences };
  return {
    verdict: "parity",
    digest: referenceDigest,
    refusalReasons: canonicalReasonOrder(reference.refusalReasons),
    scanVerdict: reference.scanVerdict,
    surfaces: [...bySurface.keys()],
  };
}

/** The requirement in one call: realise everywhere, then audit the result. */
export function confirmSurfaceParity(
  specification: ArtefactSpecification,
  surfaces: readonly DeliverySurface[] = DELIVERY_SURFACES,
): ParityReport {
  return auditParity(realiseOnAllSurfaces(specification, surfaces), surfaces);
}

/**
 * The only mutation this capability owns: recording an artefact as published.
 * The audit runs before any successor state is constructed — if it throws,
 * the throw propagates with the caller's state untouched, and if it reports
 * divergence, refused specification or an unsafe verdict, a refusal is
 * returned before a record exists to add.
 */
export function publishArtefact(
  state: ParityState,
  specification: ArtefactSpecification,
  realisations: readonly SurfaceRealisation[],
  audit: ParityAudit = auditParity,
): PublishOutcome {
  const report = audit(realisations);
  if (report.verdict === "divergent") {
    return {
      ok: false,
      kind: "parity-divergent",
      detail: `${report.divergences.length} divergence(s) between realised surfaces; publishing any one realisation would ship a surface-dependent product.`,
      divergences: report.divergences,
      refusalReasons: [],
    };
  }
  if (report.refusalReasons.length > 0) {
    // The surfaces agree the specification is refused. That agreement is
    // parity, but an artefact every surface refuses must not publish.
    return {
      ok: false,
      kind: "specification-refused",
      detail: "Every surface refuses this specification for the same reasons.",
      divergences: [],
      refusalReasons: report.refusalReasons,
    };
  }
  if (!scanPermits(report.scanVerdict)) {
    return {
      ok: false,
      kind: "scan-refused",
      detail: `Scan verdict ${report.scanVerdict} does not permit publication.`,
      divergences: [],
      refusalReasons: [],
    };
  }
  const existing = state.published.find((entry) => entry.name === specification.name);
  if (existing !== undefined) {
    // Republishing identical bytes is idempotent; republishing different
    // bytes under a published name would break byte identity retroactively.
    if (existing.digest === report.digest) return { ok: true, state, record: existing };
    return {
      ok: false,
      kind: "digest-conflict",
      detail: `Name ${specification.name} is already published as sha256 ${existing.digest}.`,
      divergences: [],
      refusalReasons: [],
    };
  }
  const record: PublishedArtefact = {
    name: specification.name,
    digest: report.digest,
    surfaces: report.surfaces,
    scanVerdict: report.scanVerdict,
  };
  return { ok: true, state: { published: [...state.published, record] }, record };
}