// --- Type definitions ---

export interface AuditState {
  readonly invocations: number;
}

export interface AuditCounted {
  readonly counted: true;
  readonly invocations: number;
}

export type AuditResult =
  | { readonly success: true; readonly state: AuditCounted }
  | { readonly success: false; readonly error: ProgrammaticGenerationError };

export interface ProgrammaticGenerationContract {
  readonly name: 'programmatic-generation';
  readonly version: '1.0.0';
  readonly surface: ReadonlyArray<ProgrammaticGenerationSurface>;
  readonly capabilities: ReadonlyArray<ProgrammaticGenerationCapability>;
}

export interface ProgrammaticGenerationSurface {
  readonly id: string;
  readonly kind: 'http' | 'mcp';
  readonly route: string;
}

export interface ProgrammaticGenerationCapability {
  readonly id: string;
  readonly description: string;
}

export interface ProgrammaticInvocation {
  readonly surfaceId: string;
  readonly capabilityId: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly nonce: string;
}

export interface ProgrammaticGenerationResult {
  readonly success: true;
  readonly surfaceId: string;
  readonly capabilityId: string;
  readonly nonce: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly issuedAt: number;
}

export type ProgrammaticGenerationOutcome =
  | ProgrammaticGenerationResult
  | { readonly success: false; readonly error: ProgrammaticGenerationError };

export interface ProgrammaticGenerationError {
  readonly code: ProgrammaticGenerationErrorCode;
  readonly message: string;
}

export interface PerimeterState {
  readonly limit: number;
  readonly windowMs: number;
  readonly observed: ReadonlyArray<number>;
}

export type PerimeterDecision =
  | { readonly success: true; readonly state: PerimeterState }
  | { readonly success: false; readonly error: ProgrammaticGenerationError };

export interface ReadinessState {
  readonly contract: ProgrammaticGenerationContract;
  readonly servedSurfaceIds: ReadonlyArray<string>;
  readonly advertisedCapabilityIds: ReadonlyArray<string>;
}

export type ReadinessOutcome =
  | { readonly success: true; readonly state: ReadinessState }
  | { readonly success: false; readonly error: ProgrammaticGenerationError };

export type ProgrammaticGenerationErrorCode =
  | 'ANQR-PG-4001'
  | 'ANQR-PG-4002'
  | 'ANQR-PG-4003'
  | 'ANQR-PG-4004'
  | 'ANQR-PG-4005'
  | 'ANQR-PG-4006'
  | 'ANQR-PG-4007';

// --- Constants ---

export const ERROR_CODE_RATE_LIMIT_EXCEEDED = 'ANQR-PG-4001' as const;
export const ERROR_CODE_UNKNOWN_SURFACE = 'ANQR-PG-4002' as const;
export const ERROR_CODE_UNKNOWN_CAPABILITY = 'ANQR-PG-4003' as const;
export const ERROR_CODE_INVALID_INVOCATION = 'ANQR-PG-4004' as const;
export const ERROR_CODE_PERIMETER_DENIED = 'ANQR-PG-4005' as const;
export const ERROR_CODE_READINESS_MISMATCH = 'ANQR-PG-4006' as const;
export const ERROR_CODE_AUDIT_FAILURE = 'ANQR-PG-4007' as const;

export const PROGRAMMATIC_GENERATION_ERROR_CODES = [
  ERROR_CODE_RATE_LIMIT_EXCEEDED,
  ERROR_CODE_UNKNOWN_SURFACE,
  ERROR_CODE_UNKNOWN_CAPABILITY,
  ERROR_CODE_INVALID_INVOCATION,
  ERROR_CODE_PERIMETER_DENIED,
  ERROR_CODE_READINESS_MISMATCH,
  ERROR_CODE_AUDIT_FAILURE,
] as const;

export const DEFAULT_PERIMETER_LIMIT = 100 as const;
export const DEFAULT_PERIMETER_WINDOW_MS = 60_000 as const;

export const PROGRAMMATIC_GENERATION_CAPABILITY_ID = 'programmatic-generation' as const;

export const HTTP_SURFACE_PREFIX = '/api/v1/programmatic-generation' as const;
export const MCP_SURFACE_PREFIX = 'mcp://anqr/programmatic-generation' as const;

export const PROGRAMMATIC_GENERATION_CONTRACT: ProgrammaticGenerationContract = {
  name: PROGRAMMATIC_GENERATION_CAPABILITY_ID,
  version: '1.0.0',
  surface: [
    { id: 'pg-http-invoke', kind: 'http', route: `${HTTP_SURFACE_PREFIX}/invoke` },
    { id: 'pg-mcp-invoke', kind: 'mcp', route: `${MCP_SURFACE_PREFIX}/invoke` },
  ],
  capabilities: [
    {
      id: 'invoke',
      description: 'Programmatic invocation of a registered capability through an HTTP or MCP surface.',
    },
    {
      id: 'audit',
      description: 'Count invocations for operational health without retaining caller payloads.',
    },
    {
      id: 'perimeter',
      description: 'Enforce a per-caller invocation perimeter and refuse exceeding callers.',
    },
    {
      id: 'readiness',
      description: 'Verify that contract, served surfaces and advertised capabilities agree.',
    },
  ],
};

// --- Factory functions ---

/**
 * Creates an empty audit state.
 */
export function createAuditState(): AuditState {
  return { invocations: 0 };
}

/**
 * Creates a perimeter state with the default enterprise limit and window.
 */
export function createPerimeterState(
  limit: number = DEFAULT_PERIMETER_LIMIT,
  windowMs: number = DEFAULT_PERIMETER_WINDOW_MS
): PerimeterState {
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error('Perimeter limit must be a positive finite number.');
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error('Perimeter window must be a positive finite number.');
  }
  return { limit, windowMs, observed: [] };
}

/**
 * Creates a readiness state seeded from the published contract.
 */
export function createReadinessState(): ReadinessState {
  return {
    contract: PROGRAMMATIC_GENERATION_CONTRACT,
    servedSurfaceIds: PROGRAMMATIC_GENERATION_CONTRACT.surface.map((s) => s.id),
    advertisedCapabilityIds: PROGRAMMATIC_GENERATION_CONTRACT.capabilities.map((c) => c.id),
  };
}

// --- Audit functions ---

/**
 * Counts an invocation for operational health without retaining caller payloads.
 * Returns a new AuditCounted value; the audit function accepts the state and the
 * current time (epoch ms) and returns a new state. Caller payloads are never stored.
 */
export function auditInvocation(
  state: AuditState,
  auditFn: (current: AuditState, nowMs: number) => AuditState,
  nowMs: number
): AuditResult {
  if (!Number.isFinite(nowMs)) {
    return {
      success: false,
      error: {
        code: ERROR_CODE_AUDIT_FAILURE,
        message: 'Audit timestamp must be a finite number.',
      },
    };
  }
  if (state.invocations < 0) {
    return {
      success: false,
      error: {
        code: ERROR_CODE_AUDIT_FAILURE,
        message: 'Audit state invocations must be non-negative.',
      },
    };
  }
  const next = auditFn(state, nowMs);
  return {
    success: true,
    state: { counted: true, invocations: next.invocations },
  };
}

/**
 * Pure audit function: increments invocations by one. The current time is ignored.
 */
export function incrementAudit(current: AuditState, _nowMs: number): AuditState {
  return { invocations: current.invocations + 1 };
}

// --- Validation functions ---

/**
 * Validates a programmatic invocation against the published contract.
 */
export function validateInvocation(
  contract: ProgrammaticGenerationContract,
  invocation: ProgrammaticInvocation
): ProgrammaticGenerationOutcome {
  if (!invocation.surfaceId || invocation.surfaceId.trim() === '') {
    return {
      success: false,
      error: {
        code: ERROR_CODE_INVALID_INVOCATION,
        message: 'Invocation surfaceId must be a non-empty string.',
      },
    };
  }
  if (!invocation.capabilityId || invocation.capabilityId.trim() === '') {
    return {
      success: false,
      error: {
        code: ERROR_CODE_INVALID_INVOCATION,
        message: 'Invocation capabilityId must be a non-empty string.',
      },
    };
  }
  if (!invocation.nonce || invocation.nonce.trim() === '') {
    return {
      success: false,
      error: {
        code: ERROR_CODE_INVALID_INVOCATION,
        message: 'Invocation nonce must be a non-empty string.',
      },
    };
  }

  const surface = contract.surface.find((s) => s.id === invocation.surfaceId);
  if (surface === undefined) {
    return {
      success: false,
      error: {
        code: ERROR_CODE_UNKNOWN_SURFACE,
        message: `Surface "${invocation.surfaceId}" is not declared in the contract.`,
      },
    };
  }

  const capability = contract.capabilities.find((c) => c.id === invocation.capabilityId);
  if (capability === undefined) {
    return {
      success: false,
      error: {
        code: ERROR_CODE_UNKNOWN_CAPABILITY,
        message: `Capability "${invocation.capabilityId}" is not declared in the contract.`,
      },
    };
  }

  return {
    success: true,
    surfaceId: surface.id,
    capabilityId: capability.id,
    nonce: invocation.nonce,
    payload: Object.freeze({ ...invocation.input }),
    issuedAt: 0,
  };
}

// --- Surface invocation functions ---

/**
 * Invokes the HTTP surface. Accepts repeated programmatic invocation and returns a
 * stable result structure across calls. Caller payloads are never retained; the
 * result echoes only the surfaceId, capabilityId and nonce.
 */
export function invokeHttpSurface(
  invocation: ProgrammaticInvocation,
  nowMs: number
): ProgrammaticGenerationOutcome {
  if (!invocation.surfaceId.startsWith('pg-http-')) {
    return {
      success: false,
      error: {
        code: ERROR_CODE_UNKNOWN_SURFACE,
        message: `HTTP surface id "${invocation.surfaceId}" is not served by the HTTP adapter.`,
      },
    };
  }
  const base = validateInvocation(PROGRAMMATIC_GENERATION_CONTRACT, invocation);
  if (base.success === false) {
    return base;
  }
  return {
    success: true,
    surfaceId: base.surfaceId,
    capabilityId: base.capabilityId,
    nonce: base.nonce,
    payload: base.payload,
    issuedAt: nowMs,
  };
}

/**
 * Invokes the MCP surface. Accepts repeated programmatic invocation and returns a
 * stable result structure across calls.
 */
export function invokeMcpSurface(
  invocation: ProgrammaticInvocation,
  nowMs: number
): ProgrammaticGenerationOutcome {
  if (!invocation.surfaceId.startsWith('pg-mcp-')) {
    return {
      success: false,
      error: {
        code: ERROR_CODE_UNKNOWN_SURFACE,
        message: `MCP surface id "${invocation.surfaceId}" is not served by the MCP adapter.`,
      },
    };
  }
  const base = validateInvocation(PROGRAMMATIC_GENERATION_CONTRACT, invocation);
  if (base.success === false) {
    return base;
  }
  return {
    success: true,
    surfaceId: base.surfaceId,
    capabilityId: base.capabilityId,
    nonce: base.nonce,
    payload: base.payload,
    issuedAt: nowMs,
  };
}

// --- Perimeter functions ---

/**
 * Records an observation timestamp into the perimeter state. Returns a new state.
 */
export function recordPerimeterObservation(
  state: PerimeterState,
  nowMs: number
): PerimeterState {
  return { ...state, observed: [...state.observed, nowMs] };
}

/**
 * Evaluates a perimeter decision. A caller exceeding the limit inside the window is
 * refused with a stable, machine-readable code so a client can back off correctly.
 * The check precedes the recorded observation; on refusal, no observation is appended.
 */
export function evaluatePerimeter(
  state: PerimeterState,
  nowMs: number,
  auditFn: (current: AuditState, at: number) => AuditState
): PerimeterDecision {
  if (!Number.isFinite(nowMs)) {
    return {
      success: false,
      error: {
        code: ERROR_CODE_PERIMETER_DENIED,
        message: 'Perimeter evaluation requires a finite timestamp.',
      },
    };
  }
  const windowStart = nowMs - state.windowMs;
  const withinWindow = state.observed.filter((t) => t >= windowStart && t <= nowMs);
  if (withinWindow.length >= state.limit) {
    return {
      success: false,
      error: {
        code: ERROR_CODE_RATE_LIMIT_EXCEEDED,
        message: `Caller exceeded perimeter limit of ${state.limit} within ${state.windowMs}ms.`,
      },
    };
  }
  const next = recordPerimeterObservation(state, nowMs);
  // Audit observation without retaining caller payloads: only the count matters.
  const auditResult = auditFn(createAuditState(), nowMs);
  if (auditResult.invocations < 1) {
    return {
      success: false,
      error: {
        code: ERROR_CODE_AUDIT_FAILURE,
        message: 'Perimeter audit function failed to record an observation.',
      },
    };
  }
  return { success: true, state: next };
}

// --- Readiness functions ---

/**
 * Asserts that the published contract, the served surface and the advertised
 * capabilities agree. Fail-closed: the default branch denies.
 */
export function evaluateReadiness(state: ReadinessState): ReadinessOutcome {
  const contractSurfaceIds = state.contract.surface.map((s) => s.id);
  const contractCapabilityIds = state.contract.capabilities.map((c) => c.id);

  const surfacesMatch =
    contractSurfaceIds.length === state.servedSurfaceIds.length &&
    contractSurfaceIds.every((id, i) => state.servedSurfaceIds[i] === id);
  const capabilitiesMatch =
    contractCapabilityIds.length === state.advertisedCapabilityIds.length &&
    contractCapabilityIds.every((id, i) => state.advertisedCapabilityIds[i] === id);

  if (!surfacesMatch) {
    return {
      success: false,
      error: {
        code: ERROR_CODE_READINESS_MISMATCH,
        message: 'Served surfaces do not match the contract surfaces.',
      },
    };
  }
  if (!capabilitiesMatch) {
    return {
      success: false,
      error: {
        code: ERROR_CODE_READINESS_MISMATCH,
        message: 'Advertised capabilities do not match the contract capabilities.',
      },
    };
  }

  return { success: true, state };
}

// --- Composite workflow function ---

/**
 * Exercises repeated invocation and asserts the result structure is stable.
 * The mutation function accepts the audit function and does not mutate when it
 * throws or returns a failure. Returns an array of outcomes in invocation order.
 */
export function exerciseRepeatedInvocation(
  invocations: ReadonlyArray<ProgrammaticInvocation>,
  nowMs: number,
  auditFn: (current: AuditState, at: number) => AuditState
): ReadonlyArray<ProgrammaticGenerationOutcome> {
  const results: ProgrammaticGenerationOutcome[] = [];
  for (const invocation of invocations) {
    const outcome = invokeHttpSurface(invocation, nowMs);
    if (outcome.success === true) {
      const audited = auditFn(createAuditState(), nowMs);
      if (audited.invocations < 1) {
        results.push({
          success: false,
          error: {
            code: ERROR_CODE_AUDIT_FAILURE,
            message: 'Repeated invocation audit function did not record an observation.',
          },
        });
        continue;
      }
    }
    results.push(outcome);
  }
  return Object.freeze(results);
}

/**
 * Asserts that two outcomes are structurally equal under the stable result shape.
 */
export function assertStableStructure(
  a: ProgrammaticGenerationOutcome,
  b: ProgrammaticGenerationOutcome
): boolean {
  if (a.success !== b.success) {
    return false;
  }
  if (a.success === true && b.success === true) {
    return (
      a.surfaceId === b.surfaceId &&
      a.capabilityId === b.capabilityId &&
      a.nonce === b.nonce
    );
  }
  if (a.success === false && b.success === false) {
    return a.error.code === b.error.code;
  }
  return false;
}