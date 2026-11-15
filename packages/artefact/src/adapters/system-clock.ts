import type { ClockPort } from "../ports/clock.ts";

// The only adapter that reads ambient state. It exists so that nothing else
// does: a use case takes a ClockPort and is therefore testable with a fixed
// clock, and this is the single place real time enters the product.

export const systemClock: ClockPort = {
  nowMs(): number {
    return Date.now();
  },
};

/** A fixed clock, for callers that need determinism without a test double. */
export function fixedClock(instantMs: number): ClockPort {
  if (!Number.isFinite(instantMs)) throw new Error("CLOCK_INSTANT_INVALID");
  return { nowMs: () => instantMs };
}
