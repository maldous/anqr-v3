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
  | { readonly success: true; readonly content: string; readonly bytes: number }
  | { readonly success: false; readonly refusal: RemoteAssetSafetyRefusal };

export interface RemoteAssetSafetyAuditEntry {
  readonly boundary: RemoteAssetSafetyBoundary;
  readonly timestamp: number;
  readonly redirectChain: readonly string[];
}

export type RemoteAssetSafetyAuditResult =
  | { readonly success: true; readonly entries: readonly RemoteAssetSafetyAuditEntry[] }
  | { readonly success: false; readonly refusal: RemoteAssetSafetyRefusal };

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
  for (const range of PRIVATE_RANGES) {
    if (hostname === range) return true;
  }

  for (const ip of METADATA_IPS) {
    if (hostname === ip) return true;
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return true;
  }

  return false;
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

  return null;
}

// --- Audit trail management ---

export function recordRefusal(
  auditTrail: readonly RemoteAssetSafetyAuditEntry[],
  refusal: RemoteAssetSafetyRefusal,
  redirectChain: readonly string[] = [],
  timestamp: number = 0
): RemoteAssetSafetyAuditEntry[] {
  const entry: RemoteAssetSafetyAuditEntry = {
    boundary: refusal.boundary,
    timestamp,
    redirectChain: [...redirectChain],
  };
  return [...auditTrail, entry];
}

// --- Core fetch with mandatory audit ---

export function auditFetch(
  url: string,
  policy: RemoteAssetSafetyPolicy,
  mockFetch: (url: string) => { content: string; size: number; redirects?: string[] },
  auditTrail: readonly RemoteAssetSafetyAuditEntry[] = [],
  timestamp: number = 0
): { readonly result: RemoteAssetSafetyFetchResult; readonly audit: readonly RemoteAssetSafetyAuditEntry[] } {
  const urlValidation = validateUrl(url, policy);
  if (urlValidation) {
    const newAudit = recordRefusal(auditTrail, urlValidation, [], timestamp);
    return {
      result: { success: false, refusal: urlValidation },
      audit: newAudit,
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
      const newAudit = recordRefusal(auditTrail, refusal, [...redirectChain], timestamp);
      return {
        result: { success: false, refusal },
        audit: newAudit,
      };
    }

    const networkCheck = checkNetworkBoundary(parsedUrl.hostname, policy);
    if (networkCheck) {
      const newAudit = recordRefusal(auditTrail, networkCheck, [...redirectChain], timestamp);
      return {
        result: { success: false, refusal: networkCheck },
        audit: newAudit,
      };
    }

    try {
      const response = mockFetch(currentUrl);

      if (response.size > policy.maxBytes) {
        const refusal: RemoteAssetSafetyRefusal = {
          boundary: 'size',
          reason: `Response size ${response.size} exceeds maximum ${policy.maxBytes}`,
        };
        const newAudit = recordRefusal(auditTrail, refusal, [...redirectChain], timestamp);
        return {
          result: { success: false, refusal },
          audit: newAudit,
        };
      }

      if (response.redirects && response.redirects.length > 0) {
        if (attempts > policy.maxRedirects) {
          const refusal: RemoteAssetSafetyRefusal = {
            boundary: 'redirect',
            reason: `Too many redirects (max ${policy.maxRedirects})`,
          };
          const newAudit = recordRefusal(auditTrail, refusal, [...redirectChain], timestamp);
          return {
            result: { success: false, refusal },
            audit: newAudit,
          };
        }

        const nextUrl = response.redirects[0];
        if (!nextUrl) {
          const refusal: RemoteAssetSafetyRefusal = {
            boundary: 'redirect',
            reason: 'Empty redirect target',
          };
          const newAudit = recordRefusal(auditTrail, refusal, [...redirectChain], timestamp);
          return {
            result: { success: false, refusal },
            audit: newAudit,
          };
        }
        redirectChain.push(currentUrl);
        currentUrl = nextUrl;
        continue;
      }

      return {
        result: { success: true, content: response.content, bytes: response.size },
        audit: auditTrail,
      };
    } catch (error) {
      const refusal: RemoteAssetSafetyRefusal = {
        boundary: 'timeout',
        reason: error instanceof Error ? error.message : 'Fetch failed',
      };
      const newAudit = recordRefusal(auditTrail, refusal, [...redirectChain], timestamp);
      return {
        result: { success: false, refusal },
        audit: newAudit,
      };
    }
  }

  const refusal: RemoteAssetSafetyRefusal = {
    boundary: 'redirect',
    reason: 'Max redirects exceeded',
  };
  const newAudit = recordRefusal(auditTrail, refusal, [...redirectChain], timestamp);
  return {
    result: { success: false, refusal },
    audit: newAudit,
  };
}

// --- Server-side enforcement ---

export function serverSideFetch(
  url: string,
  policy: RemoteAssetSafetyPolicy,
  mockFetch: (url: string) => { content: string; size: number; redirects?: string[] },
  auditTrail: readonly RemoteAssetSafetyAuditEntry[] = [],
  timestamp: number = 0
): { readonly result: RemoteAssetSafetyFetchResult; readonly audit: readonly RemoteAssetSafetyAuditEntry[] } {
  return auditFetch(url, policy, mockFetch, auditTrail, timestamp);
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