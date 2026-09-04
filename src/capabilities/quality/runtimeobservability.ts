// runtimeobservability.ts
// Know that the deployed product is working, without the product depending on
// being watched. A user is not the monitoring system.

export type EventKind = "request" | "render" | "refusal" | "failure" | "degradation";

export const EVENT_KINDS: readonly EventKind[] = ["request", "render", "refusal", "failure", "degradation"];

export interface RuntimeEvent {
  readonly kind: EventKind;
  readonly route: string;
  readonly durationMs: number;
  readonly outcome: string;
  /** Never the payload. See sanitise below. */
  readonly detail: string | null;
}

/**
 * Fields that would carry what a user encoded. What a user encodes is theirs,
 * so it never reaches a sink outside the product — which also means an outage
 * cannot leak it.
 */
export const FORBIDDEN_EVENT_FIELDS: readonly string[] = ["data", "payload", "content", "text", "url", "img"];

/**
 * Strip anything payload-shaped. This is deliberately a whitelist of what may
 * be emitted rather than a blacklist of what may not: a new parameter added to
 * a route would otherwise start being emitted the day it was added.
 */
export function sanitise(event: RuntimeEvent, extra: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> {
  const permitted: Record<string, unknown> = {
    kind: event.kind,
    route: event.route,
    durationMs: event.durationMs,
    outcome: event.outcome,
  };
  if (event.detail !== null) permitted.detail = event.detail;
  void extra;
  return permitted;
}

export function containsPayload(emitted: Readonly<Record<string, unknown>>): boolean {
  return FORBIDDEN_EVENT_FIELDS.some((field) => field in emitted);
}

export interface Sink {
  send(event: Readonly<Record<string, unknown>>): void;
}

/** A sink that can be made unreachable, to prove degradation is silent to users. */
export class MemorySink implements Sink {
  readonly #sent: Readonly<Record<string, unknown>>[] = [];
  #reachable = true;

  setReachable(reachable: boolean): void { this.#reachable = reachable; }
  get reachable(): boolean { return this.#reachable; }
  send(event: Readonly<Record<string, unknown>>): void {
    if (!this.#reachable) throw new Error("sink unreachable");
    this.#sent.push(event);
  }
  get sent(): readonly Readonly<Record<string, unknown>>[] { return [...this.#sent]; }
}

export interface EmitResult {
  readonly delivered: boolean;
  /** The product's own behaviour, unaffected either way. */
  readonly productAffected: false;
  /** Visible to the operator even when delivery failed. */
  readonly operatorNotice: string | null;
}

export function emit(sink: Sink, event: RuntimeEvent): EmitResult {
  try {
    sink.send(sanitise(event));
    return { delivered: true, productAffected: false, operatorNotice: null };
  } catch {
    return { delivered: false, productAffected: false, operatorNotice: "Telemetry sink unreachable; events are being dropped." };
  }
}

export type RuntimeName = "static" | "function" | "edge" | "background";

export const RUNTIMES: readonly RuntimeName[] = ["static", "function", "edge", "background"];

export interface HealthAnswer {
  readonly runtime: RuntimeName;
  /** Whether the runtime exists and responds at all. */
  readonly present: boolean;
  /** Whether it is prepared to serve. Distinct from merely responding. */
  readonly ready: boolean;
  readonly detail: string;
}

/**
 * Presence and readiness are separate answers per runtime. A runtime that is
 * present but not ready is the case a single boolean hides, and it is exactly
 * the case a deployment needs to see.
 */
export function health(runtime: RuntimeName, present: boolean, ready: boolean): HealthAnswer {
  return {
    runtime,
    present,
    ready: present && ready,
    detail: !present ? "absent" : ready ? "ready" : "present but not ready",
  };
}

export function healthReport(states: Readonly<Record<RuntimeName, { present: boolean; ready: boolean }>>): readonly HealthAnswer[] {
  return RUNTIMES.map((runtime) => health(runtime, states[runtime].present, states[runtime].ready));
}
