// renderedartefactcaching.ts
// Never render the same artefact twice, and never serve a different artefact
// from the same key. Caching is what makes a public unauthenticated render API
// affordable to operate.

/**
 * Parameters that change the rendered bytes. The key is derived from these and
 * nothing else.
 */
export const CACHE_SIGNIFICANT: readonly string[] = [
  "data", "ec", "v", "mask", "margin", "size", "fg", "bg", "format",
  "style", "finder", "eyeInner", "eyeOuter", "img", "animPattern", "animFrames",
];

/**
 * Parameters excluded from the key, each with the reason the exclusion is safe.
 * An exclusion that were wrong would serve one caller another caller's image,
 * so the reason is part of the declaration rather than a comment beside it.
 */
export const CACHE_EXCLUDED: Readonly<Record<string, string>> = {
  fname: "Names the downloaded file. It is applied at response time and never reaches the encoder.",
  internal: "Marks an internal caller for metrics. It selects no code path in rendering.",
  _fullRender: "Selects the synchronous or background route. Both routes produce the same bytes for the same inputs.",
  lang: "Selects interface language. The artefact carries no interface text.",
};

export function cacheKey(parameters: Readonly<Record<string, string>>): string {
  return CACHE_SIGNIFICANT
    .filter((name) => parameters[name] !== undefined)
    .map((name) => `${name}=${parameters[name] ?? ""}`)
    .join("&");
}

/** Whether two parameter sets must produce the same bytes. */
export function sameArtefact(left: Readonly<Record<string, string>>, right: Readonly<Record<string, string>>): boolean {
  return cacheKey(left) === cacheKey(right);
}

export interface Store {
  get(key: string): string | null;
  set(key: string, bytes: string): void;
}

/**
 * A store that can be made unavailable.
 *
 * Unavailability is degradation rather than failure: rendering proceeds
 * uncached. It is recorded once rather than per request, because a store that
 * is down for an hour would otherwise produce an hour of identical log lines
 * and bury everything else.
 */
export class MemoryStore implements Store {
  readonly #entries = new Map<string, string>();
  #available = true;
  #degradationRecorded = false;

  setAvailable(available: boolean): void {
    if (available) this.#degradationRecorded = false;
    this.#available = available;
  }

  get available(): boolean {
    return this.#available;
  }

  get degradationRecorded(): boolean {
    return this.#degradationRecorded;
  }

  /** Marks the degradation, returning whether this call was the first. */
  recordDegradationOnce(): boolean {
    if (this.#degradationRecorded) return false;
    this.#degradationRecorded = true;
    return true;
  }

  get(key: string): string | null {
    if (!this.#available) throw new Error("cache store unavailable");
    return this.#entries.get(key) ?? null;
  }

  set(key: string, bytes: string): void {
    if (!this.#available) throw new Error("cache store unavailable");
    this.#entries.set(key, bytes);
  }

  /** Cache state is derived and disposable: discarding it costs time only. */
  discard(): void {
    this.#entries.clear();
  }

  get size(): number {
    return this.#entries.size;
  }
}

export interface Served {
  readonly bytes: string;
  readonly hit: boolean;
  readonly rendered: boolean;
  readonly degraded: boolean;
  /** True only on the first degraded request in an outage. */
  readonly degradationLogged: boolean;
}

export function serve(store: MemoryStore, parameters: Readonly<Record<string, string>>, render: () => string): Served {
  const key = cacheKey(parameters);
  try {
    const cached = store.get(key);
    if (cached !== null) return { bytes: cached, hit: true, rendered: false, degraded: false, degradationLogged: false };
    const bytes = render();
    store.set(key, bytes);
    return { bytes, hit: false, rendered: true, degraded: false, degradationLogged: false };
  } catch {
    const logged = store.recordDegradationOnce();
    return { bytes: render(), hit: false, rendered: true, degraded: true, degradationLogged: logged };
  }
}
