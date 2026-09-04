// accessentitlement.ts
// Gate the capabilities a tier reserves, without ever gating the product's
// central outcome. The free tier is the acquisition channel, so a gate that
// touched creation or export would cost more than it earned.

export type Tier = "free" | "professional";

export const TIERS: readonly Tier[] = ["free", "professional"];

/**
 * What each tier grants. The core journey is absent from every gated set: it is
 * ungated by construction rather than by policy.
 */
export const TIER_GRANTS: Readonly<Record<Tier, readonly string[]>> = {
  free: [],
  professional: ["animatedartefact", "brandoverlay", "artefactmetadataembedding", "qrartwork"],
};

/** Capabilities no tier may ever gate. */
export const UNGATED_CAPABILITIES: readonly string[] = [
  "anonymousgeneration",
  "qrartefactcreation",
  "outputrendering",
  "artefactexport",
  "scansafeoutput",
];

export type EntitlementFault = "absent" | "malformed" | "expired";

export interface EntitlementState {
  readonly tier: Tier;
  readonly expiresAtMs: number | null;
  /** Present only when the state fell back to free, saying why. */
  readonly fault: EntitlementFault | null;
}

export const DEFAULT_STATE: EntitlementState = { tier: "free", expiresAtMs: null, fault: "absent" };

export interface Entitlement {
  readonly tier: Tier;
  readonly expiresAtMs: number;
}

/**
 * Parse an entitlement token.
 *
 * The three faults stay apart because they mean different things to the holder:
 * absent means never had one, malformed means the token is wrong, expired means
 * it was right and has run out. Collapsing them would tell a paying user with a
 * lapsed entitlement that they never had one.
 */
export function readEntitlement(token: string | null, nowMs: number): EntitlementState {
  if (token === null || token.trim() === "") return DEFAULT_STATE;
  let parsed: unknown;
  try {
    parsed = JSON.parse(token) as unknown;
  } catch {
    return { tier: "free", expiresAtMs: null, fault: "malformed" };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { tier: "free", expiresAtMs: null, fault: "malformed" };
  }
  const candidate = parsed as Partial<Entitlement>;
  if (!TIERS.includes(candidate.tier as Tier) || typeof candidate.expiresAtMs !== "number" || !Number.isFinite(candidate.expiresAtMs)) {
    return { tier: "free", expiresAtMs: null, fault: "malformed" };
  }
  if (candidate.expiresAtMs <= nowMs) {
    return { tier: "free", expiresAtMs: candidate.expiresAtMs, fault: "expired" };
  }
  return { tier: candidate.tier as Tier, expiresAtMs: candidate.expiresAtMs, fault: null };
}

/**
 * The only route to a tier is an entitlement. A client asserting one is
 * ignored: were assertion sufficient, the gate would be decoration.
 */
export function grantedTier(state: EntitlementState, clientAsserts: Tier | null = null): Tier {
  void clientAsserts;
  return state.tier;
}

export function permits(state: EntitlementState, capability: string): boolean {
  if (UNGATED_CAPABILITIES.includes(capability)) return true;
  return TIER_GRANTS[state.tier].includes(capability);
}

export interface GateRefusal {
  readonly permitted: false;
  readonly capability: string;
  readonly requiredTier: Tier;
  readonly detail: string;
}

export type GateOutcome = { readonly permitted: true } | GateRefusal;

/** A gated capability states the tier it needs rather than failing opaquely. */
export function gate(state: EntitlementState, capability: string): GateOutcome {
  if (permits(state, capability)) return { permitted: true };
  const required = TIERS.find((tier) => TIER_GRANTS[tier].includes(capability)) ?? "professional";
  return { permitted: false, capability, requiredTier: required, detail: `${capability} requires the ${required} tier.` };
}

/** The core journey evaluated against a state, so "never gated" is checkable. */
export function coreJourneyPermitted(state: EntitlementState): boolean {
  return UNGATED_CAPABILITIES.every((capability) => permits(state, capability));
}
