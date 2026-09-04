// accessauditing.ts
// Keep a durable record of who asked an authenticated surface for what, and
// what happened. Auditability is a precondition of enterprise consumption
// rather than a feature of it.

/** Every way an authenticated request can end. All of them are recorded. */
export type Outcome = "allowed" | "unauthorised" | "rate-limited" | "error";

export const OUTCOMES: readonly Outcome[] = ["allowed", "unauthorised", "rate-limited", "error"];

/** The class of event the store itself can raise about its own availability. */
export const STORE_UNAVAILABLE = "store-unavailable" as const;

export interface AuditEvent {
  readonly at: number;
  readonly route: string;
  /** A stable consumer identity, never a credential. */
  readonly consumer: string;
  readonly outcome: Outcome | typeof STORE_UNAVAILABLE;
  readonly detail: string | null;
}

/** How long events are kept, stated rather than left to a deployment. */
export const RETENTION_DAYS = 90;

export interface AuditStore {
  append(event: AuditEvent): void;
  read(): readonly AuditEvent[];
}

/**
 * An in-memory store. The capability is about what gets recorded and when, not
 * about where; a deployment binds a durable store to the same interface.
 */
export class MemoryAuditStore implements AuditStore {
  readonly #events: AuditEvent[] = [];
  #available = true;

  setAvailable(available: boolean): void {
    this.#available = available;
  }

  get available(): boolean {
    return this.#available;
  }

  append(event: AuditEvent): void {
    if (!this.#available) throw new Error("audit store unavailable");
    this.#events.push(event);
  }

  read(): readonly AuditEvent[] {
    return [...this.#events];
  }
}

export interface AuditResult {
  /** The request's own outcome, unchanged by anything the audit did. */
  readonly outcome: Outcome;
  readonly recorded: boolean;
  /** Set when the store was unavailable, so the gap is itself observable. */
  readonly gap: AuditEvent | null;
}

/**
 * Record an outcome.
 *
 * Two properties matter and are separate. Audit writing is not conditional on
 * the request succeeding — a refused request is exactly the one an auditor
 * wants to see. And an unavailable store never changes the request's own
 * outcome; instead the gap is itself recorded, because a silent hole in an
 * audit trail is worse than a noisy one.
 */
export function audit(store: AuditStore, event: AuditEvent, gapSink: AuditEvent[] = []): AuditResult {
  try {
    store.append(event);
    return { outcome: event.outcome as Outcome, recorded: true, gap: null };
  } catch {
    const gap: AuditEvent = {
      at: event.at,
      route: event.route,
      consumer: event.consumer,
      outcome: STORE_UNAVAILABLE,
      detail: `An outcome of ${event.outcome} could not be recorded.`,
    };
    gapSink.push(gap);
    return { outcome: event.outcome as Outcome, recorded: false, gap };
  }
}

/** Which declared outcome classes the store actually holds. */
export function representedOutcomes(store: AuditStore): readonly Outcome[] {
  const seen = new Set(store.read().map((event) => event.outcome));
  return OUTCOMES.filter((outcome) => seen.has(outcome));
}

export function retentionCutoff(nowMs: number): number {
  return nowMs - RETENTION_DAYS * 24 * 60 * 60 * 1000;
}
