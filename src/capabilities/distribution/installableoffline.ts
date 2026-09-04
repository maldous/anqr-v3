// installableoffline.ts
// Keep the product on the device, and keep the core outcome working without a
// network. Offline capability is what makes a browser product feel like an
// application.

export interface InstallManifest {
  readonly name: string;
  readonly shortName: string;
  readonly startUrl: string;
  readonly scope: string;
  readonly display: "standalone" | "browser";
  readonly orientation: "any" | "portrait" | "landscape";
}

export const MANIFEST: InstallManifest = {
  name: "ANQR",
  shortName: "ANQR",
  startUrl: "/",
  scope: "/",
  display: "standalone",
  orientation: "any",
};

/** Paths cached at install, so the scope is a declaration rather than a guess. */
export const CACHED_SCOPE: readonly string[] = ["/", "/index.html", "/assets/main.js", "/assets/styles.css", "/manifest.json"];

/**
 * Which capabilities work with no network.
 *
 * Creation is entirely client-side, so the core journey is offline-capable. The
 * ones that are not are not defects: they genuinely need a network, and saying
 * which is what lets a refusal be honest rather than generic.
 */
export const OFFLINE_CAPABLE: readonly string[] = [
  "anonymousgeneration", "qrartefactcreation", "outputrendering", "artefactexport",
  "scansafeoutput", "scansafetyvalidation", "encodingcontrolsurface", "visualcustomisation",
  "custompayloaddefinition", "qrdecoding",
];

export const NETWORK_DEPENDENT: Readonly<Record<string, string>> = {
  geolocationassistance: "A place lookup consults a service outside the product.",
  remoteassetsafety: "Fetching remote artwork requires reaching the remote host.",
  crawlablepresentation: "Metadata is injected by an edge runtime at request time.",
  advertisingmonetisation: "An advertising frame is loaded from a third party.",
  communitytranslationcontribution: "A contribution is submitted to a service.",
};

export function isOfflineCapable(capability: string): boolean {
  return OFFLINE_CAPABLE.includes(capability);
}

export type InstallOutcome = "installed" | "unsupported";

/** A host that does not support installation leaves the browser route intact. */
export function install(hostSupportsInstall: boolean): { readonly outcome: InstallOutcome; readonly browserRouteUsable: boolean } {
  return { outcome: hostSupportsInstall ? "installed" : "unsupported", browserRouteUsable: true };
}

export interface OfflineRefusal {
  readonly ok: false;
  /** A refusal, not an error: the capability needs something absent. */
  readonly kind: "network-required";
  readonly capability: string;
  readonly detail: string;
}

export interface OfflineSuccess {
  readonly ok: true;
  readonly capability: string;
}

export type InvokeOutcome = OfflineSuccess | OfflineRefusal;

/**
 * Offline is a runtime condition, not a mode the user selects. Nothing here
 * takes an "offline mode" flag; it takes whether the network is present.
 */
export function invoke(capability: string, networkAvailable: boolean): InvokeOutcome {
  if (networkAvailable || isOfflineCapable(capability)) return { ok: true, capability };
  return {
    ok: false,
    kind: "network-required",
    capability,
    detail: NETWORK_DEPENDENT[capability] ?? "This capability requires a network.",
  };
}

/** The core creation-and-export journey, as capability invocations. */
export const CORE_JOURNEY: readonly string[] = [
  "custompayloaddefinition", "encodingcontrolsurface", "qrartefactcreation",
  "scansafetyvalidation", "outputrendering", "artefactexport",
];

export function coreJourneyOffline(): readonly InvokeOutcome[] {
  return CORE_JOURNEY.map((capability) => invoke(capability, false));
}
