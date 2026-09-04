// abusecontrol.ts
// Keep one consumer from consuming a service that asks nobody to identify
// themselves. Two ANQR routes are public and unauthenticated, so bounding them
// is what makes them operable at all.

export type RouteName = "render" | "contract-render" | "agent";

export interface RouteLimit {
  readonly route: RouteName;
  /** Requests permitted inside one window. */
  readonly permitted: number;
  readonly windowMs: number;
  /**
   * Declared per route because the routes cost differently: a full overlay
   * render is seconds of CPU, a typed contract render is milliseconds.
   */
  readonly reason: string;
}

export const ROUTE_LIMITS: readonly RouteLimit[] = [
  { route: "render", permitted: 30, windowMs: 60_000, reason: "A full render may composite an overlay and encode animation frames." },
  { route: "contract-render", permitted: 120, windowMs: 60_000, reason: "A typed contract render is bounded and cheap." },
  { route: "agent", permitted: 60, windowMs: 60_000, reason: "An agent surface is authorised, so the limit protects capacity rather than identity." },
];

/**
 * The three refusal classes this capability keeps distinguishable. A rate
 * refusal that looked like an authorisation refusal would send a caller to fix
 * the wrong thing; one that looked like a render failure would send them to
 * retry immediately, which is the opposite of what they should do.
 */
export type RefusalKind = "rate-limited" | "unauthorised" | "render-failed";

export const REFUSAL_CODES = {
  "rate-limited": "ANQR_RATE_LIMITED",
  unauthorised: "ANQR_UNAUTHORISED",
  "render-failed": "ANQR_RENDER_FAILED",
} as const satisfies Record<RefusalKind, string>;

export interface Refusal {
  readonly kind: RefusalKind;
  readonly code: string;
  readonly status: number;
  /** Seconds until the caller may retry; only a rate refusal carries one. */
  readonly retryAfterSeconds: number | null;
  readonly detail: string;
}

export interface Admission {
  readonly admitted: true;
  readonly route: RouteName;
  readonly remaining: number;
}

export type Decision = Admission | (Refusal & { readonly admitted: false });

export function limitFor(route: RouteName): RouteLimit {
  const limit = ROUTE_LIMITS.find((entry) => entry.route === route);
  if (limit === undefined) throw new Error(`No declared limit for route ${route}`);
  return limit;
}

export function refusal(kind: RefusalKind, detail: string, retryAfterSeconds: number | null = null): Refusal {
  return {
    kind,
    code: REFUSAL_CODES[kind],
    status: kind === "rate-limited" ? 429 : kind === "unauthorised" ? 401 : 500,
    // Only a rate refusal can say when to come back. A retry signal on an
    // authorisation refusal would invite waiting instead of fixing.
    retryAfterSeconds: kind === "rate-limited" ? retryAfterSeconds : null,
    detail,
  };
}

interface Window { count: number; startedAtMs: number }

/**
 * A bounded fixed-window limiter.
 *
 * It holds its own state and takes its clock, so a window boundary can be
 * exercised without waiting for one. When its state is unavailable the route
 * fails closed: an unauthenticated public route that fails open under pressure
 * is worse than one that is briefly unavailable.
 */
export class RateLimiter {
  readonly #windows = new Map<string, Window>();
  readonly #now: () => number;
  #available = true;

  constructor(now: () => number = () => Date.now()) {
    this.#now = now;
  }

  /** Makes the limiter's own state unreachable, so fail-closed is testable. */
  setStateAvailable(available: boolean): void {
    this.#available = available;
  }

  get stateAvailable(): boolean {
    return this.#available;
  }

  /**
   * Decide before the handler does any work. The order is the permissions
   * facet: a limiter consulted after rendering has already spent the resource
   * it exists to protect.
   */
  admit(route: RouteName, origin: string): Decision {
    if (!this.#available) {
      return { admitted: false, ...refusal("rate-limited", "The limiter's own state is unavailable; the route fails closed.", 1) };
    }
    const limit = limitFor(route);
    const key = `${route} ${origin}`;
    const now = this.#now();
    const window = this.#windows.get(key);
    if (window === undefined || now - window.startedAtMs >= limit.windowMs) {
      this.#windows.set(key, { count: 1, startedAtMs: now });
      return { admitted: true, route, remaining: limit.permitted - 1 };
    }
    if (window.count >= limit.permitted) {
      const retryAfterSeconds = Math.max(1, Math.ceil((limit.windowMs - (now - window.startedAtMs)) / 1000));
      return { admitted: false, ...refusal("rate-limited", `Route ${route} permits ${limit.permitted} requests per ${limit.windowMs} ms.`, retryAfterSeconds) };
    }
    window.count += 1;
    return { admitted: true, route, remaining: limit.permitted - window.count };
  }
}

export interface GuardOutcome<T> {
  readonly decision: Decision;
  readonly result: T | null;
  /** Observable proof that a refused request did no work. */
  readonly handlerInvoked: boolean;
}

/**
 * Run a handler behind the limiter. The handler is not called when the request
 * is refused, which is the validation facet: the refusal must cost no render.
 */
export function guard<T>(limiter: RateLimiter, route: RouteName, origin: string, handler: () => T): GuardOutcome<T> {
  const decision = limiter.admit(route, origin);
  if (!decision.admitted) return { decision, result: null, handlerInvoked: false };
  return { decision, result: handler(), handlerInvoked: true };
}
