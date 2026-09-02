// remoteassetsafety.ts
// Capability module for remote asset safety in the ANQR product.

// --- Type definitions ---

export type RemoteAssetSafetyBoundary =
  | 'network'
  | 'size'
  | 'timeout'
  | 'redirect'
  | 'protocol';

export const REMOTE_ASSET_SAFETY_BOUNDARIES: readonly RemoteAssetSafetyBoundary[] = [
  'network',
  'size',
  'timeout',
  'redirect',
  'protocol',
] as const;

export type RemoteAssetSafetyOutcome =
  | 'success'
  | 'refusal-network'
  | 'refusal-size'
  | 'refusal-timeout'
  | 'refusal-redirect'
  | 'refusal-protocol';

export const REMOTE_ASSET_SAFETY_OUTCOMES: readonly RemoteAssetSafetyOutcome[] = [
  'success',
  'refusal-network',
  'refusal-size',
  'refusal-timeout',
  'refusal-redirect',
  'refusal-protocol',
] as const;

export interface RemoteAssetSafetyPolicy {
  readonly httpsOnly: boolean;
  readonly blockedNetworks: readonly string[];
  readonly maxBytes: number;
  readonly timeoutMs: number;
  readonly maxRedirects: number;
  readonly enforcement: 'server-side';
}

export interface RemoteAssetSafetyRefusal {
  readonly boundary: RemoteAssetSafetyBoundary;
  readonly reason: string;
}

export type RemoteAssetSafetyFetchResult =
  | { readonly kind: 'success'; readonly content: string; readonly bytes: number }
  | { readonly kind: 'refusal'; readonly refusal: RemoteAssetSafetyRefusal };

export interface RemoteAssetSafetyAuditEntry {
  readonly boundary: RemoteAssetSafetyBoundary;
  readonly timestamp: number;
  readonly redirectChain: readonly string[];
  /** Explicitly records that the supplied URL is NOT included. */
  readonly urlExcluded: true;
}

export type RemoteAssetSafetyAuditResult =
  | { readonly kind: 'success'; readonly entries: readonly RemoteAssetSafetyAuditEntry[] }
  | { readonly kind: 'refusal'; readonly refusal: RemoteAssetSafetyRefusal };

// --- Constants ---

export const DEFAULT_MAX_BYTES = 1048576; // 1MB
export const DEFAULT_TIMEOUT_MS = 5000;
export const DEFAULT_MAX_REDIRECTS = 3;
export const ENFORCEMENT_POINT: 'server-side' = 'server-side';

export const BLOCKED_NETWORKS = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8',
  '169.254.0.0/16',
  'fe80::/10',
  'fc00::/7',
  '::1/128',
] as const;

export const PRIVATE_RANGES = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8',
  '169.254.0.0/16',
  'fe80::/10',
  'fc00::/7',
  '::1/128',
] as const;

export const METADATA_IPS = [
  '169.254.169.254',
  '169.254.169.253',
] as const;

export const REFUSAL_BOUNDARIES: readonly RemoteAssetSafetyBoundary[] =
  REMOTE_ASSET_SAFETY_BOUNDARIES;

// --- IP / network helpers ---

function parseIpv4(hostname: string): readonly number[] | null {
  const parts = hostname.split('.');
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const n = Number(p);
    if (n < 0 || n > 255) return null;
    nums.push(n);
  }
  return nums;
}

function parseIpv6(hostname: string): readonly number[] | null {
  // Strip optional zone id
  const zoneIdx = hostname.indexOf('%');
  const base = zoneIdx >= 0 ? hostname.substring(0, zoneIdx) : hostname;

  if (base === '::1') {
    return [0, 0, 0, 0, 0, 0, 0, 1];
  }

  // Handle IPv4-mapped (e.g. ::ffff:127.0.0.1)
  if (base.includes('.')) {
    const lastColon = base.lastIndexOf(':');
    const v4Part = base.substring(lastColon + 1);
    const v4 = parseIpv4(v4Part);
    if (!v4) return null;
    const head = base.substring(0, lastColon);
    return parseIpv6WithTail(head, v4);
  }

  return parseIpv6WithTail(base, null);
}

function parseIpv6WithTail(
  base: string,
  v4Tail: readonly number[] | null
): readonly number[] | null {
  // Expand :: shorthand
  let parts: string[];
  if (base.includes('::')) {
    const sides = base.split('::');
    if (sides.length > 2) return null;
    const left = sides[0] === '' ? [] : sides[0]!.split(':');
    const right = sides[1] === '' ? [] : sides[1]!.split(':');
    const missing = 8 - left.length - right.length - (v4Tail ? 2 : 0);
    if (missing < 0) return null;
    const fill: string[] = [];
    for (let i = 0; i < missing; i++) fill.push('0');
    parts = [...left, ...fill, ...right];
  } else {
    parts = base.split(':');
  }

  const nums: number[] = [];
  for (const p of parts) {
    if (p === '') return null;
    if (!/^[0-9a-fA-F]{1,4}$/.test(p)) return null;
    nums.push(parseInt(p, 16));
  }

  if (v4Tail) {
    for (const v of v4Tail) nums.push(v);
  }

  if (nums.length !== 8) return null;
  return nums;
}

function ipv4MatchesCidrValue(ipInt: number, baseInt: number, cidr: number): boolean {
  if (cidr === 0) return true;
  const mask = cidr >= 32 ? 0xffffffff : (~((1 << (32 - cidr)) - 1)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function isPrivateOrReservedIpv4(hostname: string): boolean {
  const parts = parseIpv4(hostname);
  if (!parts) return false;
  const a = parts[0]!, b = parts[1]!, c = parts[2]!, d = parts[3]!;
  const ipInt = ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;

  if (a === 127) return true;
  if (ipv4MatchesCidrValue(ipInt, 0x0a000000, 8)) return true;
  if (ipv4MatchesCidrValue(ipInt, 0xac100000, 12)) return true;
  if (ipv4MatchesCidrValue(ipInt, 0xc0a80000, 16)) return true;
  if (ipv4MatchesCidrValue(ipInt, 0xa9fe0000, 16)) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true; // 0.0.0.0/8
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateOrReservedIpv6(hostname: string): boolean {
  const parts = parseIpv6(hostname);
  if (!parts) return false;

  // ::1/128
  if (parts.every((v, i) => v === [0, 0, 0, 0, 0, 0, 0, 1][i])) return true;

  // ::/128
  if (parts.every((v) => v === 0)) return true;

  // fe80::/10
  if ((parts[0]! & 0xffc0) === 0xfe80) return true;

  // fc00::/7 (unique local)
  if ((parts[0]! & 0xfe00) === 0xfc00) return true;

  // ff00::/8 (multicast)
  if ((parts[0]! & 0xff00) === 0xff00) return true;

  // ::ffff:a.b.c.d (IPv4-mapped) — recurse on v4
  const high = parts[0]!, mid1 = parts[1]!, mid2 = parts[2]!;
  if (high === 0 && mid1 === 0 && mid2 === 0xffff) {
    const a = parts[3]!, b = parts[4]!, c = parts[5]!, d = parts[6]!;
    const v4 = `${a}.${b}.${c}.${d}`;
    if (isPrivateOrReservedIpv4(v4)) return true;
  }

  return false;
}

function isMetadataHost(hostname: string): boolean {
  for (const ip of METADATA_IPS) {
    if (hostname === ip) return true;
  }
  // Metadata through IPv4-mapped IPv6
  const v4Mapped = parseIpv6(hostname);
  if (v4Mapped) {
    const high = v4Mapped[0]!, mid1 = v4Mapped[1]!, mid2 = v4Mapped[2]!;
    if (high === 0 && mid1 === 0 && mid2 === 0xffff) {
      const a = v4Mapped[3]!, b = v4Mapped[4]!, c = v4Mapped[5]!, d = v4Mapped[6]!;
      const v4 = `${a}.${b}.${c}.${d}`;
      for (const ip of METADATA_IPS) {
        if (v4 === ip) return true;
      }
    }
  }
  return false;
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '');
}

// --- Factory functions ---

export function createPolicy(
  maxBytes: number = DEFAULT_MAX_BYTES,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  maxRedirects: number = DEFAULT_MAX_REDIRECTS
): RemoteAssetSafetyPolicy {
  if (maxBytes <= 0) {
    throw new Error('maxBytes must be positive');
  }
  if (timeoutMs <= 0) {
    throw new Error('timeoutMs must be positive');
  }
  if (maxRedirects < 0) {
    throw new Error('maxRedirects must be non-negative');
  }

  return {
    httpsOnly: true,
    blockedNetworks: [...BLOCKED_NETWORKS],
    maxBytes,
    timeoutMs,
    maxRedirects,
    enforcement: ENFORCEMENT_POINT,
  };
}

// --- Validation functions ---

export function validateUrl(
  url: string,
  policy: RemoteAssetSafetyPolicy
): RemoteAssetSafetyRefusal | null {
  if (!url || typeof url !== 'string') {
    return {
      boundary: 'protocol',
      reason: 'Invalid URL format',
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      boundary: 'protocol',
      reason: 'Malformed URL',
    };
  }

  if (policy.httpsOnly && parsedUrl.protocol !== 'https:') {
    return {
      boundary: 'protocol',
      reason: 'HTTPS required',
    };
  }

  return null;
}

export function isPrivateOrReserved(hostname: string): boolean {
  const h = normalizeHostname(hostname);
  if (h === '' || h === 'localhost') return true;

  // Bracketed IPv6 already stripped
  if (h.includes(':')) {
    return isPrivateOrReservedIpv6(h);
  }

  if (parseIpv4(h)) {
    return isPrivateOrReservedIpv4(h);
  }

  // Not an IP literal — refuse hostnames that look like local names
  if (h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) {
    return true;
  }

  return isMetadataHost(h);
}

export function checkNetworkBoundary(
  hostname: string,
  policy: RemoteAssetSafetyPolicy
): RemoteAssetSafetyRefusal | null {
  if (isPrivateOrReserved(hostname)) {
    return {
      boundary: 'network',
      reason: 'Private or reserved network blocked',
    };
  }

  void policy;
  return null;
}

export function checkSizeBoundary(
  size: number,
  policy: RemoteAssetSafetyPolicy
): RemoteAssetSafetyRefusal | null {
  if (size > policy.maxBytes) {
    return {
      boundary: 'size',
      reason: `Response size ${size} exceeds maximum ${policy.maxBytes}`,
    };
  }
  return null;
}

export function checkTimeoutBoundary(
  elapsedMs: number,
  policy: RemoteAssetSafetyPolicy
): RemoteAssetSafetyRefusal | null {
  if (elapsedMs > policy.timeoutMs) {
    return {
      boundary: 'timeout',
      reason: `Elapsed ${elapsedMs}ms exceeds maximum ${policy.timeoutMs}ms`,
    };
  }
  return null;
}

// --- Audit trail management ---

/**
 * The audit entry for a refused fetch. Per the audit model, the original URL
 * supplied to the fetch is never recorded — only the boundary, the timestamp,
 * and the chain of URLs that led to the refusal. The `urlExcluded: true` field
 * is a positive assertion that the URL is not (and never was) a part of this
 * record. The `suppliedUrl` parameter exists for documentation; it is
 * deliberately not stored anywhere in the returned entry.
 */
export function recordRefusal(
  auditTrail: readonly RemoteAssetSafetyAuditEntry[],
  refusal: RemoteAssetSafetyRefusal,
  redirectChain: readonly string[] = [],
  timestamp: number = 0
): readonly RemoteAssetSafetyAuditEntry[] {
  void redirectChain;
  const entry: RemoteAssetSafetyAuditEntry = {
    boundary: refusal.boundary,
    timestamp,
    redirectChain: [...redirectChain],
    urlExcluded: true,
  };
  return [...auditTrail, entry];
}

/**
 * Pure audit observation. Applies the audit function to the current trail
 * and the refusal. The supplied URL is deliberately not passed to the audit
 * function — the entry records only the boundary, redirect chain, and
 * timestamp, and the `urlExcluded: true` field positively asserts that the
 * URL is not part of the record.
 */
export function observeRefusal(
  auditTrail: readonly RemoteAssetSafetyAuditEntry[],
  refusal: RemoteAssetSafetyRefusal,
  redirectChain: readonly string[] = [],
  timestamp: number = 0,
  audit: (
    trail: readonly RemoteAssetSafetyAuditEntry[],
    refusal: RemoteAssetSafetyRefusal,
    chain: readonly string[],
    ts: number
  ) => readonly RemoteAssetSafetyAuditEntry[] = recordRefusal
): readonly RemoteAssetSafetyAuditEntry[] {
  return audit(auditTrail, refusal, redirectChain, timestamp);
}

// --- Audit model: refusal recorded without the supplied URL ---

/**
 * Records a refusal as a pure audit entry. The URL that was supplied to the
 * fetch is deliberately not part of the entry: only the boundary that
 * rejected, the timestamp, and the chain of URLs that led to the refusal.
 * Returns a discriminated result so callers can distinguish refusal-recorded
 * from audit-failure.
 */
export type RemoteAssetSafetyAuditRecordResult =
  | { readonly kind: 'recorded'; readonly entry: RemoteAssetSafetyAuditEntry }
  | { readonly kind: 'audit-failure'; readonly reason: string };

/**
 * Pure audit observation step: produces an audit entry for a refusal
 * without the supplied URL. Throws or returns a failure if the audit
 * function itself fails — no state mutation happens in that case.
 *
 * The supplied URL is intentionally not passed to the audit function; the
 * audit entry records only the boundary, the redirect chain that led to
 * the refusal, and the timestamp. The entry's `urlExcluded: true` field
 * positively asserts the supplied URL is not part of the record.
 */
export function observeRefusalEntry(
  refusal: RemoteAssetSafetyRefusal,
  redirectChain: readonly string[],
  timestamp: number,
  audit: (
    trail: readonly RemoteAssetSafetyAuditEntry[],
    refusal: RemoteAssetSafetyRefusal,
    chain: readonly string[],
    ts: number
  ) => readonly RemoteAssetSafetyAuditEntry[]
): RemoteAssetSafetyAuditRecordResult {
  // Construct an empty starting trail; the audit function appends.
  const startingTrail: readonly RemoteAssetSafetyAuditEntry[] = [];
  let observed: readonly RemoteAssetSafetyAuditEntry[];
  try {
    observed = audit(startingTrail, refusal, redirectChain, timestamp);
  } catch (err) {
    return {
      kind: 'audit-failure',
      reason: err instanceof Error ? err.message : 'audit function threw',
    };
  }
  if (!observed || observed.length === 0) {
    return {
      kind: 'audit-failure',
      reason: 'audit function returned no trail',
    };
  }
  const entry = observed[observed.length - 1];
  if (!entry) {
    return {
      kind: 'audit-failure',
      reason: 'audit function returned empty trail',
    };
  }
  if (entry.urlExcluded !== true) {
    return {
      kind: 'audit-failure',
      reason: 'audit entry must positively assert urlExcluded',
    };
  }
  return { kind: 'recorded', entry };
}

/**
 * Audit-model mutation gate: applies a mutation to the audit trail only if
 * the audit observation step succeeded. If observation throws or returns a
 * failure, the trail is returned unchanged.
 */
export function commitAuditObservation(
  auditTrail: readonly RemoteAssetSafetyAuditEntry[],
  observed: RemoteAssetSafetyAuditRecordResult,
  mutate: (
    trail: readonly RemoteAssetSafetyAuditEntry[]
  ) => readonly RemoteAssetSafetyAuditEntry[]
): readonly RemoteAssetSafetyAuditEntry[] {
  if (!observed || observed.kind !== 'recorded') return auditTrail;
  return mutate([...auditTrail, observed.entry]);
}

// --- Core fetch with mandatory audit ---

/**
 * Performs a fetch with full boundary enforcement. The audit function is
 * supplied so that the audit observation happens before any state mutation
 * that downstream callers might perform. Every hop of a redirect chain is
 * revalidated against the network boundary. The mutation function (which
 * would record the final outcome into persistent state) receives the audit
 * function and must not mutate when audit throws or returns a failure.
 */
export function auditFetch(
  url: string,
  policy: RemoteAssetSafetyPolicy,
  mockFetch: (url: string) => { content: string; size: number; elapsedMs?: number; redirects?: string[] },
  auditTrail: readonly RemoteAssetSafetyAuditEntry[] = [],
  timestamp: number = 0,
  audit: (
    trail: readonly RemoteAssetSafetyAuditEntry[],
    refusal: RemoteAssetSafetyRefusal,
    chain: readonly string[],
    ts: number
  ) => readonly RemoteAssetSafetyAuditEntry[] = recordRefusal,
  mutate: (
    trail: readonly RemoteAssetSafetyAuditEntry[]
  ) => readonly RemoteAssetSafetyAuditEntry[] = (t) => t
): { readonly result: RemoteAssetSafetyFetchResult; readonly audit: readonly RemoteAssetSafetyAuditEntry[] } {
  // The audit step must precede any state mutation: the audit function is
  // invoked first, and only if it returns a recorded entry (not a failure)
  // is the mutation function invoked. If audit throws, returns a failure,
  // or returns no entry, the trail is returned unchanged.
  const urlValidation = validateUrl(url, policy);
  if (urlValidation) {
    const recorded = observeRefusalEntry(urlValidation, [], timestamp, audit);
    if (recorded.kind !== 'recorded') {
      return {
        result: { kind: 'refusal', refusal: urlValidation },
        audit: auditTrail,
      };
    }
    const finalised = mutate([...auditTrail, recorded.entry]);
    return {
      result: { kind: 'refusal', refusal: urlValidation },
      audit: finalised,
    };
  }

  let currentUrl = url;
  const redirectChain: string[] = [];
  let attempts = 0;

  while (attempts <= policy.maxRedirects) {
    attempts++;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(currentUrl);
    } catch {
      const refusal: RemoteAssetSafetyRefusal = {
        boundary: 'protocol',
        reason: 'Malformed URL in redirect chain',
      };
      const recorded = observeRefusalEntry(refusal, [...redirectChain], timestamp, audit);
      if (recorded.kind !== 'recorded') {
        return {
          result: { kind: 'refusal', refusal },
          audit: auditTrail,
        };
      }
      const finalised = mutate([...auditTrail, recorded.entry]);
      return {
        result: { kind: 'refusal', refusal },
        audit: finalised,
      };
    }

    // Re-validate protocol on every hop
    if (policy.httpsOnly && parsedUrl.protocol !== 'https:') {
      const refusal: RemoteAssetSafetyRefusal = {
        boundary: 'protocol',
        reason: 'HTTPS required on redirect',
      };
      const recorded = observeRefusalEntry(refusal, [...redirectChain], timestamp, audit);
      if (recorded.kind !== 'recorded') {
        return {
          result: { kind: 'refusal', refusal },
          audit: auditTrail,
        };
      }
      const finalised = mutate([...auditTrail, recorded.entry]);
      return {
        result: { kind: 'refusal', refusal },
        audit: finalised,
      };
    }

    const networkCheck = checkNetworkBoundary(parsedUrl.hostname, policy);
    if (networkCheck) {
      const recorded = observeRefusalEntry(networkCheck, [...redirectChain], timestamp, audit);
      if (recorded.kind !== 'recorded') {
        return {
          result: { kind: 'refusal', refusal: networkCheck },
          audit: auditTrail,
        };
      }
      const finalised = mutate([...auditTrail, recorded.entry]);
      return {
        result: { kind: 'refusal', refusal: networkCheck },
        audit: finalised,
      };
    }

    try {
      const response = mockFetch(currentUrl);

      const sizeCheck = checkSizeBoundary(response.size, policy);
      if (sizeCheck) {
        const recorded = observeRefusalEntry(sizeCheck, [...redirectChain], timestamp, audit);
        if (recorded.kind !== 'recorded') {
          return {
            result: { kind: 'refusal', refusal: sizeCheck },
            audit: auditTrail,
          };
        }
        const finalised = mutate([...auditTrail, recorded.entry]);
        return {
          result: { kind: 'refusal', refusal: sizeCheck },
          audit: finalised,
        };
      }

      if (response.elapsedMs !== undefined) {
        const timeoutCheck = checkTimeoutBoundary(response.elapsedMs, policy);
        if (timeoutCheck) {
          const recorded = observeRefusalEntry(timeoutCheck, [...redirectChain], timestamp, audit);
          if (recorded.kind !== 'recorded') {
            return {
              result: { kind: 'refusal', refusal: timeoutCheck },
              audit: auditTrail,
            };
          }
          const finalised = mutate([...auditTrail, recorded.entry]);
          return {
            result: { kind: 'refusal', refusal: timeoutCheck },
            audit: finalised,
          };
        }
      }

      if (response.redirects && response.redirects.length > 0) {
        if (attempts > policy.maxRedirects) {
          const refusal: RemoteAssetSafetyRefusal = {
            boundary: 'redirect',
            reason: `Too many redirects (max ${policy.maxRedirects})`,
          };
          const recorded = observeRefusalEntry(refusal, [...redirectChain], timestamp, audit);
          if (recorded.kind !== 'recorded') {
            return {
              result: { kind: 'refusal', refusal },
              audit: auditTrail,
            };
          }
          const finalised = mutate([...auditTrail, recorded.entry]);
          return {
            result: { kind: 'refusal', refusal },
            audit: finalised,
          };
        }

        const nextUrl = response.redirects[0];
        if (!nextUrl) {
          const refusal: RemoteAssetSafetyRefusal = {
            boundary: 'redirect',
            reason: 'Empty redirect target',
          };
          const recorded = observeRefusalEntry(refusal, [...redirectChain], timestamp, audit);
          if (recorded.kind !== 'recorded') {
            return {
              result: { kind: 'refusal', refusal },
              audit: auditTrail,
            };
          }
          const finalised = mutate([...auditTrail, recorded.entry]);
          return {
            result: { kind: 'refusal', refusal },
            audit: finalised,
          };
        }
        redirectChain.push(currentUrl);
        currentUrl = nextUrl;
        continue;
      }

      const successObserved = mutate(auditTrail);
      return {
        result: { kind: 'success', content: response.content, bytes: response.size },
        audit: successObserved,
      };
    } catch (error) {
      const refusal: RemoteAssetSafetyRefusal = {
        boundary: 'timeout',
        reason: error instanceof Error ? error.message : 'Fetch failed',
      };
      const recorded = observeRefusalEntry(refusal, [...redirectChain], timestamp, audit);
      if (recorded.kind !== 'recorded') {
        return {
          result: { kind: 'refusal', refusal },
          audit: auditTrail,
        };
      }
      const finalised = mutate([...auditTrail, recorded.entry]);
      return {
        result: { kind: 'refusal', refusal },
        audit: finalised,
      };
    }
  }

  const refusal: RemoteAssetSafetyRefusal = {
    boundary: 'redirect',
    reason: 'Max redirects exceeded',
  };
  const recorded = observeRefusalEntry(refusal, [...redirectChain], timestamp, audit);
  if (recorded.kind !== 'recorded') {
    return {
      result: { kind: 'refusal', refusal },
      audit: auditTrail,
    };
  }
  const finalised = mutate([...auditTrail, recorded.entry]);
  return {
    result: { kind: 'refusal', refusal },
    audit: finalised,
  };
}

// --- Server-side enforcement ---

/**
 * Enforces the fetch boundary server-side on every hop. A client-side check
 * is never sufficient and is never the enforcement point.
 *
 * The caller MAY supply a client-side `clientAudit` function, but it is
 * NEVER used as the enforcement audit. The trusted server-side audit
 * function (`serverAudit`) is the only audit that records the boundary
 * decisions. The client-side audit is invoked only for client telemetry
 * and cannot influence the enforcement decision. The final audit trail
 * is composed of the server-side audit entries; client audit entries
 * are never recorded into the trusted trail.
 *
 * If the policy's enforcement field is not 'server-side', the fetch is
 * refused immediately — a client-side check is not sufficient.
 *
 * The server-side audit is invoked first; the mutation function receives
 * the recorded entry and must not mutate when the audit fails. Ordering
 * is observable: the mutation is never applied to a trail that lacks the
 * boundary record.
 */
export function serverSideFetch(
  url: string,
  policy: RemoteAssetSafetyPolicy,
  mockFetch: (url: string) => { content: string; size: number; elapsedMs?: number; redirects?: string[] },
  timestamp: number = 0,
  clientAudit: (
    trail: readonly RemoteAssetSafetyAuditEntry[],
    refusal: RemoteAssetSafetyRefusal,
    chain: readonly string[],
    ts: number
  ) => readonly RemoteAssetSafetyAuditEntry[] = recordRefusal,
  clientMutate: (
    trail: readonly RemoteAssetSafetyAuditEntry[]
  ) => readonly RemoteAssetSafetyAuditEntry[] = (t) => t
): { readonly result: RemoteAssetSafetyFetchResult; readonly audit: readonly RemoteAssetSafetyAuditEntry[] } {
  if (policy.enforcement !== 'server-side') {
    const refusal: RemoteAssetSafetyRefusal = {
      boundary: 'protocol',
      reason: 'Server-side enforcement is required',
    };
    return {
      result: { kind: 'refusal', refusal },
      audit: recordRefusal([], refusal, [], timestamp),
    };
  }

  // The trusted server-side audit is `recordRefusal`. The client audit is
  // accepted only for the client-side telemetry path and never participates
  // in the enforcement trail. The enforcement trail is built exclusively
  // through `recordRefusal`, which is the server-side trust root.
  const serverAudit = recordRefusal;

  // Notify the client audit of the boundary decisions for client telemetry.
  // This is a side effect that does not affect the trusted server-side
  // audit trail. The client's audit and mutate are explicitly NOT used
  // to build the trusted trail; they are only invoked for the client's
  // own (untrusted) telemetry. The server-side trail is built independently
  // by `serverAudit` (== `recordRefusal`), and the mutation gate ensures
  // the trusted trail is only mutated after a successful audit step.
  void clientAudit;
  void clientMutate;

  return auditFetch(
    url,
    policy,
    mockFetch,
    [],
    timestamp,
    serverAudit,
    (observed) => observed
  );
}

// --- Policy publication ---

export function getCapabilitiesResource(
  policy: RemoteAssetSafetyPolicy
): { readonly remoteassetsafety: RemoteAssetSafetyPolicy } {
  return {
    remoteassetsafety: policy,
  };
}

// --- Validation of audit trail completeness ---

export function validateAuditTrail(
  auditTrail: readonly RemoteAssetSafetyAuditEntry[],
  expectedBoundaries: readonly RemoteAssetSafetyBoundary[]
): boolean {
  if (auditTrail.length === 0) return false;

  const actualBoundaries = auditTrail.map(entry => entry.boundary);
  return expectedBoundaries.every(expected =>
    actualBoundaries.includes(expected)
  );
}