// asynchronousrendering.ts
// Complete a render that cannot finish inside one request, without making the
// caller hang. The most valuable visual capabilities are the slowest, so the
// slow path has to exist for them to be offered at all.

/** Requests projected to exceed this are handed to the background runtime. */
export const SYNCHRONOUS_BOUND_MS = 2_000;

/** A background job that exceeds this is abandoned and reported. */
export const JOB_BOUND_MS = 60_000;

export type JobState = "queued" | "running" | "complete" | "failed" | "abandoned";

export interface RenderRequest {
  /** Stable identity derived from the request's own parameters. */
  readonly identity: string;
  readonly projectedMs: number;
}

export interface Placeholder {
  readonly kind: "placeholder";
  /** Distinguishable by the caller, which is the point of saying so. */
  readonly isPlaceholder: true;
  readonly identity: string;
  readonly retrieveAfterMs: number;
}

export interface Artefact {
  readonly kind: "artefact";
  readonly isPlaceholder: false;
  readonly identity: string;
  readonly bytes: string;
}

export interface JobFailure {
  readonly kind: "failure";
  readonly identity: string;
  readonly state: Extract<JobState, "failed" | "abandoned">;
  readonly detail: string;
}

export type Response = Placeholder | Artefact;

export function exceedsSynchronousBound(request: RenderRequest): boolean {
  return request.projectedMs > SYNCHRONOUS_BOUND_MS;
}

/**
 * The background runtime.
 *
 * Its presence is observable independently of the synchronous route, because a
 * synchronous route that answers perfectly while the background runtime is
 * missing produces placeholders that never resolve.
 */
export class BackgroundRuntime {
  readonly #jobs = new Map<string, { state: JobState; bytes: string | null; detail: string | null }>();
  #present = true;

  setPresent(present: boolean): void {
    this.#present = present;
  }

  /** Readiness answered by the background runtime for itself. */
  get present(): boolean {
    return this.#present;
  }

  start(request: RenderRequest): void {
    if (!this.#present) return;
    this.#jobs.set(request.identity, { state: "queued", bytes: null, detail: null });
  }

  /** Runs a queued job to completion, or abandons it if it exceeds its bound. */
  run(identity: string, elapsedMs: number, produce: () => string): void {
    const job = this.#jobs.get(identity);
    if (job === undefined) return;
    if (elapsedMs > JOB_BOUND_MS) {
      this.#jobs.set(identity, { state: "abandoned", bytes: null, detail: `Exceeded the ${JOB_BOUND_MS} ms job bound.` });
      return;
    }
    try {
      this.#jobs.set(identity, { state: "complete", bytes: produce(), detail: null });
    } catch (error) {
      this.#jobs.set(identity, { state: "failed", bytes: null, detail: error instanceof Error ? error.message : "render failed" });
    }
  }

  state(identity: string): JobState | null {
    return this.#jobs.get(identity)?.state ?? null;
  }

  /**
   * Retrieve by identity. A failed or abandoned job is reported rather than
   * leaving a placeholder that would be retried forever.
   */
  retrieve(identity: string): Artefact | JobFailure | null {
    const job = this.#jobs.get(identity);
    if (job === undefined) return null;
    if (job.state === "complete" && job.bytes !== null) {
      return { kind: "artefact", isPlaceholder: false, identity, bytes: job.bytes };
    }
    if (job.state === "failed" || job.state === "abandoned") {
      return { kind: "failure", identity, state: job.state, detail: job.detail ?? "unknown" };
    }
    return null;
  }
}

/**
 * The synchronous route. It never blocks waiting for the background one: an
 * over-bound request is answered promptly with a stated placeholder.
 */
export function respond(runtime: BackgroundRuntime, request: RenderRequest, produceNow: () => string): Response {
  if (!exceedsSynchronousBound(request)) {
    return { kind: "artefact", isPlaceholder: false, identity: request.identity, bytes: produceNow() };
  }
  runtime.start(request);
  return { kind: "placeholder", isPlaceholder: true, identity: request.identity, retrieveAfterMs: SYNCHRONOUS_BOUND_MS };
}
