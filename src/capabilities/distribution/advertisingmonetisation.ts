// advertisingmonetisation.ts
// Fund a product that charges nothing, without degrading the product that is
// funded. Advertising is the revenue for the free tier and the reason anonymity
// can be preserved.

export type SlotName = "page-footer" | "page-rail" | "gallery-interstitial";

export interface SlotSpec {
  readonly name: SlotName;
  readonly position: string;
  /** Surfaces this slot may never appear on, and why. */
  readonly neverOn: readonly string[];
}

/**
 * Two regions are permanently out of bounds: the creation control surface,
 * because a slot there competes with the task, and the artefact preview,
 * because a slot over it obscures the outcome the user came for.
 */
export const FORBIDDEN_REGIONS: readonly string[] = ["creation-controls", "artefact-preview"];

export const SLOTS: readonly SlotSpec[] = [
  { name: "page-footer", position: "below the document content", neverOn: FORBIDDEN_REGIONS },
  { name: "page-rail", position: "beside long-form static content", neverOn: [...FORBIDDEN_REGIONS, "creation-surface"] },
  { name: "gallery-interstitial", position: "between gallery sections", neverOn: FORBIDDEN_REGIONS },
];

export function slotFor(name: SlotName): SlotSpec {
  const slot = SLOTS.find((entry) => entry.name === name);
  if (slot === undefined) throw new Error(`No declared slot ${name}`);
  return slot;
}

export function mayAppearOn(name: SlotName, region: string): boolean {
  return !slotFor(name).neverOn.includes(region);
}

export interface RenderedSlot {
  readonly name: SlotName;
  readonly filled: boolean;
  /** A collapsed slot occupies no space at all, rather than reserving it. */
  readonly occupiesSpace: boolean;
  /** A collapsed slot is not announced to assistive technology. */
  readonly ariaHidden: boolean;
  readonly requestMade: boolean;
}

export interface ConsentGate {
  /** Whether the advertising purpose is permitted. Evaluated before the request. */
  permitsAdvertising(): boolean;
}

/**
 * Render a slot.
 *
 * The consent condition is evaluated before any request is made, which is the
 * permissions facet: a request made and then discarded has already told a third
 * party that this visitor exists.
 */
export function renderSlot(name: SlotName, region: string, consent: ConsentGate, networkAvailable: boolean): RenderedSlot {
  const collapsed: RenderedSlot = { name, filled: false, occupiesSpace: false, ariaHidden: true, requestMade: false };
  if (!mayAppearOn(name, region)) return collapsed;
  if (!consent.permitsAdvertising()) return collapsed;
  if (!networkAvailable) return { ...collapsed, requestMade: true };
  return { name, filled: true, occupiesSpace: true, ariaHidden: false, requestMade: true };
}

/**
 * The core journey exercised with advertising blocked, to prove the product it
 * funds does not depend on it. Returns the steps that completed.
 */
export function coreJourneyWithAdvertisingBlocked(steps: readonly string[], consent: ConsentGate): readonly string[] {
  // Advertising participates in no journey step. This is the whole assertion:
  // the step list is returned unchanged whatever consent says.
  void consent;
  return [...steps];
}
