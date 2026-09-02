// httpapidelivery.ts
// Capability module for HTTP API delivery in the ANQR product.

// --- Type definitions ---

export interface DeliveryPayload {
  readonly size: number;
  readonly errorCorrection: string;
  readonly foreground: string;
  readonly background: string;
  readonly format: string;
  readonly margin: number;
}

export interface SuccessArtefact {
  readonly artefact: string;
  readonly metadata: {
    readonly size: number;
    readonly format: string;
    readonly timestamp: number;
  };
}

export interface DeliveryError {
  readonly code: string;
  readonly detail: string;
  readonly parameter?: string;
}

export interface DeliveryResponse {
  readonly success: boolean;
  readonly artefact?: SuccessArtefact;
  readonly error?: DeliveryError;
}

export interface ApiState {
  readonly requestCount: number;
  readonly contract: readonly string[];
  readonly servedRoutes: readonly string[];
  readonly isReady: boolean;
}

// --- Constants ---

export const ALLOWED_FORMATS = ['png', 'jpeg', 'svg', 'pdf'] as const;
export const ALLOWED_ERROR_CORRECTION = ['L', 'M', 'Q', 'H'] as const;

export const ERROR_CODES = {
  CLIENT_ERROR: 'CLIENT_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  CONTRACT_DRIFT: 'CONTRACT_DRIFT',
  VALIDATION_ERROR: 'VALIDATION_ERROR'
} as const;

export const DEFAULT_MARGIN = 4;
export const MAX_PAYLOAD_SIZE = 10000;
export const MIN_PAYLOAD_SIZE = 1;

// --- Factory functions ---

export function createInitialApiState(): ApiState {
  return {
    requestCount: 0,
    contract: ['/api/delivery', '/api/health'],
    servedRoutes: ['/api/delivery', '/api/health'],
    isReady: true
  };
}

export function createDeliveryPayload(
  size: number,
  errorCorrection: string,
  foreground: string,
  background: string,
  format: string,
  margin: number = DEFAULT_MARGIN
): DeliveryPayload {
  return {
    size,
    errorCorrection,
    foreground,
    background,
    format,
    margin
  };
}

// --- Validation functions ---

export function validatePayload(payload: DeliveryPayload): DeliveryError | null {
  if (payload.size < MIN_PAYLOAD_SIZE || payload.size > MAX_PAYLOAD_SIZE) {
    return {
      code: ERROR_CODES.CLIENT_ERROR,
      detail: `Size must be between ${MIN_PAYLOAD_SIZE} and ${MAX_PAYLOAD_SIZE}`,
      parameter: 'size'
    };
  }

  if (!(ALLOWED_ERROR_CORRECTION as readonly string[]).includes(payload.errorCorrection)) {
    return {
      code: ERROR_CODES.CLIENT_ERROR,
      detail: `Error correction must be one of: ${ALLOWED_ERROR_CORRECTION.join(', ')}`,
      parameter: 'errorCorrection'
    };
  }

  if (!payload.foreground || payload.foreground.trim() === '') {
    return {
      code: ERROR_CODES.CLIENT_ERROR,
      detail: 'Foreground color is required',
      parameter: 'foreground'
    };
  }

  if (!payload.background || payload.background.trim() === '') {
    return {
      code: ERROR_CODES.CLIENT_ERROR,
      detail: 'Background color is required',
      parameter: 'background'
    };
  }

  if (!(ALLOWED_FORMATS as readonly string[]).includes(payload.format)) {
    return {
      code: ERROR_CODES.CLIENT_ERROR,
      detail: `Format must be one of: ${ALLOWED_FORMATS.join(', ')}`,
      parameter: 'format'
    };
  }

  if (payload.margin < 0) {
    return {
      code: ERROR_CODES.CLIENT_ERROR,
      detail: 'Margin must be non-negative',
      parameter: 'margin'
    };
  }

  return null;
}

// --- Audit function (requirement: httpapideliveryauditmodel) ---

export function auditRequest(state: ApiState): ApiState {
  // Count requests without retaining payload content
  return {
    ...state,
    requestCount: state.requestCount + 1
  };
}

// --- Contract checking (requirement: httpapideliveryreadinessmodel) ---

export function checkContractAlignment(state: ApiState): boolean {
  if (state.contract.length !== state.servedRoutes.length) {
    return false;
  }
  
  return state.contract.every((route, index) => route === state.servedRoutes[index]);
}

// --- Delivery function (requirement: httpapideliverycontracts) ---

export function deliverPayload(
  state: ApiState,
  payload: DeliveryPayload
): DeliveryResponse {
  // Check contract alignment first (fail-closed)
  if (!checkContractAlignment(state)) {
    return {
      success: false,
      error: {
        code: ERROR_CODES.CONTRACT_DRIFT,
        detail: 'API contract and served routes are not aligned'
      }
    };
  }

  // Validate payload
  const validationError = validatePayload(payload);
  if (validationError) {
    return {
      success: false,
      error: validationError
    };
  }

  // Simulate successful delivery
  const artefact: SuccessArtefact = {
    artefact: `generated-${Date.now()}`,
    metadata: {
      size: payload.size,
      format: payload.format,
      timestamp: Date.now()
    }
  };

  return {
    success: true,
    artefact
  };
}

// --- Error handling (requirement: httpapideliveryerrormodel) ---

export function createClientError(parameter: string, detail: string): DeliveryError {
  return {
    code: ERROR_CODES.CLIENT_ERROR,
    detail,
    parameter
  };
}

export function createServerError(detail: string): DeliveryError {
  // Never leak internal detail - use generic message
  return {
    code: ERROR_CODES.SERVER_ERROR,
    detail: 'Internal server error'
  };
}

// --- Permission check (requirement: httpapideliverypermissions) ---

export function checkPublicAccess(): boolean {
  // Deliberate posture: no credential required
  return true;
}

// --- Contract testing (requirement: httpapideliveryvalidation) ---

export function testContractCoverage(
  contract: readonly string[],
  testedStatusCodes: readonly number[]
): boolean {
  const requiredStatusCodes = [200, 400, 500];
  return requiredStatusCodes.every(code => testedStatusCodes.includes(code));
}

// --- Composite workflow ---

export function processDeliveryRequest(
  state: ApiState,
  payload: DeliveryPayload
): { newState: ApiState; response: DeliveryResponse } {
  // Audit first (requirement: httpapideliveryauditmodel)
  const auditedState = auditRequest(state);
  
  // Then attempt delivery
  const response = deliverPayload(auditedState, payload);
  
  return {
    newState: auditedState,
    response
  };
}