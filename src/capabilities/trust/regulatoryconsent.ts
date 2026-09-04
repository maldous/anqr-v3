// regulatoryconsent.ts
// Ask before anything follows the user, and make the answer enforceable rather
// than merely recorded. Consent is the precondition of the advertising that
// funds a free product, and the boundary that keeps anonymity credible.

export type Purpose = "strictly-necessary" | "measurement" | "advertising" | "personalisation";

export const PURPOSES: readonly Purpose[] = ["strictly-necessary", "measurement", "advertising", "personalisation"];

/** What each purpose permits, so a decision means something specific. */
export const PURPOSE_PERMITS: Readonly<Record<Purpose, string>> = {
  "strictly-necessary": "Behaviour the product cannot work without. Never blocked and never asked about.",
  measurement: "Aggregate usage counting with no cross-site identity.",
  advertising: "Third-party advertising frames and the requests they make.",
  personalisation: "Any profile built across visits or sites.",
};

export type Decision = "granted" | "refused";

export type ConsentFault = "undecided" | "platform-failed";

export interface ConsentState {
  readonly decisions: Readonly<Partial<Record<Purpose, Decision>>>;
  /** Set while no usable decision exists, saying why. */
  readonly fault: ConsentFault | null;
}

/**
 * The fail-closed default. Nothing beyond strictly-necessary is permitted until
 * a decision exists, and the absence of a decision is a state rather than an
 * error.
 */
export const DEFAULT_STATE: ConsentState = { decisions: {}, fault: "undecided" };

/**
 * Whether a purpose may run.
 *
 * Strictly-necessary always may. Everything else requires an explicit grant, so
 * an undecided state and a failed consent platform both block — differently
 * reported, identically enforced.
 */
export function permits(state: ConsentState, purpose: Purpose): boolean {
  if (purpose === "strictly-necessary") return true;
  return state.decisions[purpose] === "granted";
}

export function record(state: ConsentState, purpose: Purpose, decision: Decision): ConsentState {
  if (purpose === "strictly-necessary") return state;
  return { decisions: { ...state.decisions, [purpose]: decision }, fault: null };
}

export function withdraw(state: ConsentState, purpose: Purpose): ConsentState {
  return record(state, purpose, "refused");
}

/** A consent platform that fails to load leaves tracking blocked, never permitted. */
export function platformFailed(): ConsentState {
  return { decisions: {}, fault: "platform-failed" };
}

export interface BlockReason {
  readonly blocked: true;
  readonly purpose: Purpose;
  readonly fault: ConsentFault | "refused";
  readonly detail: string;
}

export type LoadDecision = { readonly blocked: false } | BlockReason;

/**
 * Decide whether a third-party script may be evaluated.
 *
 * The condition is evaluated before the request, which is the permissions
 * facet: a script blocked after it loaded has already run.
 */
export function mayLoad(state: ConsentState, purpose: Purpose): LoadDecision {
  if (permits(state, purpose)) return { blocked: false };
  const fault = state.fault ?? "refused";
  return {
    blocked: true,
    purpose,
    fault,
    detail: fault === "platform-failed"
      ? "The consent platform could not load, so tracking stays blocked."
      : fault === "undecided"
        ? "No decision has been recorded, so tracking stays blocked."
        : "The purpose was refused.",
  };
}

export interface ConsentEvent {
  readonly at: number;
  readonly purpose: Purpose;
  readonly decision: Decision;
}

/**
 * Both a decision and its later withdrawal are observable, which is what makes
 * a consent claim auditable rather than asserted.
 */
export class ConsentLog {
  readonly #events: ConsentEvent[] = [];
  #state: ConsentState = DEFAULT_STATE;

  get state(): ConsentState {
    return this.#state;
  }

  apply(at: number, purpose: Purpose, decision: Decision): ConsentState {
    this.#state = record(this.#state, purpose, decision);
    if (purpose !== "strictly-necessary") this.#events.push({ at, purpose, decision });
    return this.#state;
  }

  events(): readonly ConsentEvent[] {
    return [...this.#events];
  }

  /** The history for one purpose, in order, so a withdrawal is visible. */
  history(purpose: Purpose): readonly Decision[] {
    return this.#events.filter((event) => event.purpose === purpose).map((event) => event.decision);
  }
}
