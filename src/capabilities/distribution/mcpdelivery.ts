export interface ToolParameter {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly pattern?: string;
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly parameters: readonly ToolParameter[];
}

export interface CapabilitiesResource {
  readonly tools: readonly Tool[];
  readonly formats: readonly string[];
  readonly errorCorrectionLevels: readonly string[];
  readonly sizeRange: { readonly min: number; readonly max: number };
  readonly marginRange: { readonly min: number; readonly max: number };
  readonly overlayFetchPolicy: string;
  readonly safetyGuarantees: readonly string[];
}

export interface Config {
  readonly capabilities: CapabilitiesResource;
  readonly overlayPolicy: { readonly allowedOrigins: readonly string[] };
}

export interface GenerationInput {
  readonly data: string;
  readonly format: string;
  readonly size?: number;
  readonly margin?: number;
  readonly errorCorrectionLevel?: string;
}

export interface AdvancedGenerationInput extends GenerationInput {
  readonly overlay?: {
    readonly url: string;
    readonly position?: { readonly x: number; readonly y: number };
  };
}

export interface ToolValidationResult {
  readonly success: boolean;
  readonly field?: string;
  readonly message?: string;
}

export interface GenerationResult {
  readonly success: true;
  readonly artefact: string;
}

export interface GenerationError {
  readonly success: false;
  readonly field: string;
  readonly message: string;
}

export type GenerationOutcome = GenerationResult | GenerationError;

export interface OverlayCheckResult {
  readonly allowed: boolean;
  readonly reason?: string;
}

export interface FieldMismatch {
  readonly field: string;
  readonly advertised: string;
  readonly enforced: string;
  readonly message: string;
}

export interface CapabilityValidationResult {
  readonly success: true;
  readonly aligned: true;
}

export interface CapabilityValidationFailure {
  readonly success: false;
  readonly aligned: false;
  readonly field: string;
  readonly message: string;
  readonly advertised: string;
  readonly enforced: string;
}

export type CapabilityValidationOutcome =
  | CapabilityValidationResult
  | CapabilityValidationFailure;

export interface ToolInvocationResult {
  readonly success: boolean;
  readonly tool: string;
  readonly field?: string;
  readonly message?: string;
}

export type ToolInvocationOutcome =
  | { readonly success: true; readonly tool: string }
  | { readonly success: false; readonly tool: string; readonly field: string; readonly message: string };

export const BASIC_TOOL_NAME = 'basic-generation';
export const ADVANCED_TOOL_NAME = 'advanced-generation';
export const GENERATION_PROMPT = 'Generate QR code from provided data';

export const DEFAULT_FORMATS = ['PNG', 'SVG', 'JPEG'] as const;
export const DEFAULT_ERROR_CORRECTION_LEVELS = ['L', 'M', 'Q', 'H'] as const;
export const DEFAULT_SIZE_RANGE = { min: 256, max: 4096 } as const;
export const DEFAULT_MARGIN_RANGE = { min: 0, max: 100 } as const;
export const DEFAULT_OVERLAY_POLICY = 'same-origin';
export const DEFAULT_SAFETY_GUARANTEES = [
  'no-execution',
  'sandboxed-fetch',
  'content-type-validation'
] as const;

export const DEFAULT_ALLOWED_ORIGINS = ['self'] as const;

export type FormatLiteral = typeof DEFAULT_FORMATS[number];
export type ErrorCorrectionLevelLiteral = typeof DEFAULT_ERROR_CORRECTION_LEVELS[number];
export type SafetyGuaranteeLiteral = typeof DEFAULT_SAFETY_GUARANTEES[number];

export const GENERATION_TOOL_NAMES = [BASIC_TOOL_NAME, ADVANCED_TOOL_NAME] as const;
export type GenerationToolName = typeof GENERATION_TOOL_NAMES[number];

export const OVERLAY_POLICY_LITERAL = 'same-origin' as const;
export type OverlayPolicyLiteral = typeof OVERLAY_POLICY_LITERAL;

export function createTool(
  name: string,
  description: string,
  parameters: readonly ToolParameter[]
): Tool {
  if (!name || name.trim() === '') {
    throw new Error('Tool name must be a non-empty string.');
  }
  if (!description || description.trim() === '') {
    throw new Error('Tool description must be a non-empty string.');
  }
  if (!parameters || parameters.length === 0) {
    throw new Error('Tool must have at least one parameter.');
  }
  return { name, description, parameters };
}

export function createCapabilitiesResource(
  tools: readonly Tool[],
  formats: readonly string[],
  errorCorrectionLevels: readonly string[],
  sizeRange: { readonly min: number; readonly max: number },
  marginRange: { readonly min: number; readonly max: number },
  overlayFetchPolicy: string,
  safetyGuarantees: readonly string[]
): CapabilitiesResource {
  if (!tools || tools.length === 0) {
    throw new Error('Capabilities must declare at least one tool.');
  }
  if (!formats || formats.length === 0) {
    throw new Error('Capabilities must declare at least one format.');
  }
  if (!errorCorrectionLevels || errorCorrectionLevels.length === 0) {
    throw new Error('Capabilities must declare at least one error correction level.');
  }
  if (sizeRange.min > sizeRange.max) {
    throw new Error('Size range min must not exceed max.');
  }
  if (marginRange.min > marginRange.max) {
    throw new Error('Margin range min must not exceed max.');
  }
  if (!overlayFetchPolicy || overlayFetchPolicy.trim() === '') {
    throw new Error('Overlay fetch policy must be a non-empty string.');
  }
  if (!safetyGuarantees || safetyGuarantees.length === 0) {
    throw new Error('Capabilities must declare at least one safety guarantee.');
  }
  return {
    tools,
    formats,
    errorCorrectionLevels,
    sizeRange,
    marginRange,
    overlayFetchPolicy,
    safetyGuarantees
  };
}

export function createConfig(
  capabilities: CapabilitiesResource,
  overlayPolicy: { readonly allowedOrigins: readonly string[] }
): Config {
  if (!capabilities) {
    throw new Error('Config must include capabilities.');
  }
  if (!overlayPolicy || !overlayPolicy.allowedOrigins) {
    throw new Error('Config must include overlay policy with allowed origins.');
  }
  return { capabilities, overlayPolicy };
}

export function validateToolInput(
  input: unknown,
  tool: Tool
): ToolValidationResult {
  if (typeof input !== 'object' || input === null) {
    return { success: false, field: 'root', message: 'Input must be an object.' };
  }

  const record = input as Record<string, unknown>;

  for (const param of tool.parameters) {
    const value = record[param.name];

    if (param.required && (value === undefined || value === null)) {
      return {
        success: false,
        field: param.name,
        message: `Required field '${param.name}' is missing.`
      };
    }

    if (value !== undefined && value !== null) {
      if (param.type === 'string' && typeof value !== 'string') {
        return {
          success: false,
          field: param.name,
          message: `Field '${param.name}' must be a string.`
        };
      }

      if (param.type === 'number' && typeof value !== 'number') {
        return {
          success: false,
          field: param.name,
          message: `Field '${param.name}' must be a number.`
        };
      }

      if (param.type === 'object' && (typeof value !== 'object' || value === null)) {
        return {
          success: false,
          field: param.name,
          message: `Field '${param.name}' must be an object.`
        };
      }

      if (param.min !== undefined && typeof value === 'number' && value < param.min) {
        return {
          success: false,
          field: param.name,
          message: `Field '${param.name}' must be at least ${param.min}.`
        };
      }

      if (param.max !== undefined && typeof value === 'number' && value > param.max) {
        return {
          success: false,
          field: param.name,
          message: `Field '${param.name}' must be at most ${param.max}.`
        };
      }

      if (param.pattern !== undefined && typeof value === 'string') {
        const re = new RegExp(param.pattern);
        if (!re.test(value)) {
          return {
            success: false,
            field: param.name,
            message: `Field '${param.name}' does not match pattern '${param.pattern}'.`
          };
        }
      }
    }
  }

  return { success: true };
}

export function deriveCapabilitiesFromConfig(config: Config): CapabilitiesResource {
  if (!config) {
    throw new Error('Configuration is required to derive capabilities.');
  }
  return config.capabilities;
}

export function advertisedToolNames(config: Config): readonly string[] {
  const capabilities = deriveCapabilitiesFromConfig(config);
  return capabilities.tools.map((tool) => tool.name);
}

export function advertisedCapabilityNames(config: Config): readonly string[] {
  const capabilities = deriveCapabilitiesFromConfig(config);
  const toolNames = capabilities.tools.map((tool) => tool.name);
  return [
    ...toolNames,
    ...capabilities.formats,
    ...capabilities.errorCorrectionLevels,
    ...capabilities.safetyGuarantees
  ];
}

export function validateCapabilitiesAgainstConfig(
  capabilities: CapabilitiesResource,
  config: Config
): CapabilityValidationOutcome {
  const enforced = config.capabilities;

  if (capabilities.tools.length !== enforced.tools.length) {
    return {
      success: false,
      aligned: false,
      field: 'tools',
      advertised: String(capabilities.tools.length),
      enforced: String(enforced.tools.length),
      message: 'Advertised tool count does not match served configuration.'
    };
  }

  for (let i = 0; i < capabilities.tools.length; i++) {
    const a = capabilities.tools[i];
    const e = enforced.tools[i];
    if (a.name !== e.name) {
      return {
        success: false,
        aligned: false,
        field: `tools[${i}].name`,
        advertised: a.name,
        enforced: e.name,
        message: `Advertised tool name '${a.name}' does not match served tool '${e.name}'.`
      };
    }
    if (a.description !== e.description) {
      return {
        success: false,
        aligned: false,
        field: `tools[${i}].description`,
        advertised: a.description,
        enforced: e.description,
        message: `Advertised description for '${a.name}' does not match served description.`
      };
    }
    if (a.parameters.length !== e.parameters.length) {
      return {
        success: false,
        aligned: false,
        field: `tools[${i}].parameters`,
        advertised: String(a.parameters.length),
        enforced: String(e.parameters.length),
        message: `Advertised parameter count for '${a.name}' does not match served configuration.`
      };
    }
    for (let j = 0; j < a.parameters.length; j++) {
      const ap = a.parameters[j];
      const ep = e.parameters[j];
      if (ap.name !== ep.name || ap.type !== ep.type || ap.required !== ep.required) {
        return {
          success: false,
          aligned: false,
          field: `tools[${i}].parameters[${j}]`,
          advertised: `${ap.name}:${ap.type}:${ap.required}`,
          enforced: `${ep.name}:${ep.type}:${ep.required}`,
          message: `Advertised parameter '${ap.name}' does not match served parameter.`
        };
      }
    }
  }

  const advertisedFormats = new Set(capabilities.formats);
  const enforcedFormats = new Set(enforced.formats);
  for (const f of advertisedFormats) {
    if (!enforcedFormats.has(f)) {
      return {
        success: false,
        aligned: false,
        field: 'formats',
        advertised: Array.from(advertisedFormats).join(','),
        enforced: Array.from(enforcedFormats).join(','),
        message: `Advertised format '${f}' is not served.`
      };
    }
  }

  const advertisedEcl = new Set(capabilities.errorCorrectionLevels);
  const enforcedEcl = new Set(enforced.errorCorrectionLevels);
  for (const e of advertisedEcl) {
    if (!enforcedEcl.has(e)) {
      return {
        success: false,
        aligned: false,
        field: 'errorCorrectionLevels',
        advertised: Array.from(advertisedEcl).join(','),
        enforced: Array.from(enforcedEcl).join(','),
        message: `Advertised error correction level '${e}' is not served.`
      };
    }
  }

  if (
    capabilities.sizeRange.min !== enforced.sizeRange.min ||
    capabilities.sizeRange.max !== enforced.sizeRange.max
  ) {
    return {
      success: false,
      aligned: false,
      field: 'sizeRange',
      advertised: `${capabilities.sizeRange.min}-${capabilities.sizeRange.max}`,
      enforced: `${enforced.sizeRange.min}-${enforced.sizeRange.max}`,
      message: 'Advertised size range does not match served range.'
    };
  }

  if (
    capabilities.marginRange.min !== enforced.marginRange.min ||
    capabilities.marginRange.max !== enforced.marginRange.max
  ) {
    return {
      success: false,
      aligned: false,
      field: 'marginRange',
      advertised: `${capabilities.marginRange.min}-${capabilities.marginRange.max}`,
      enforced: `${enforced.marginRange.min}-${enforced.marginRange.max}`,
      message: 'Advertised margin range does not match served range.'
    };
  }

  if (capabilities.overlayFetchPolicy !== enforced.overlayFetchPolicy) {
    return {
      success: false,
      aligned: false,
      field: 'overlayFetchPolicy',
      advertised: capabilities.overlayFetchPolicy,
      enforced: enforced.overlayFetchPolicy,
      message: 'Advertised overlay fetch policy does not match served policy.'
    };
  }

  const advertisedSafety = new Set(capabilities.safetyGuarantees);
  const enforcedSafety = new Set(enforced.safetyGuarantees);
  for (const g of advertisedSafety) {
    if (!enforcedSafety.has(g)) {
      return {
        success: false,
        aligned: false,
        field: 'safetyGuarantees',
        advertised: Array.from(advertisedSafety).join(','),
        enforced: Array.from(enforcedSafety).join(','),
        message: `Advertised safety guarantee '${g}' is not served.`
      };
    }
  }

  return { success: true, aligned: true };
}

export function invokeDeclaredTool(
  tool: Tool,
  input: unknown,
  audit: (result: ToolValidationResult) => void
): ToolInvocationOutcome {
  const validation = validateToolInput(input, tool);
  audit(validation);

  if (!validation.success) {
    return {
      success: false,
      tool: tool.name,
      field: validation.field ?? 'unknown',
      message: validation.message ?? 'Validation failed.'
    };
  }

  return { success: true, tool: tool.name };
}

export function checkOverlayPolicy(
  origin: string,
  config: Config
): OverlayCheckResult {
  if (!origin || origin.trim() === '') {
    return { allowed: false, reason: 'Origin must be a non-empty string.' };
  }
  if (!config.overlayPolicy.allowedOrigins.includes(origin)) {
    return {
      allowed: false,
      reason: `Origin '${origin}' is not in allowed origins.`
    };
  }
  return { allowed: true };
}

export function advertisedOverlayPolicy(config: Config): string {
  return advertisedOverlayPolicyFromOrigins(config.overlayPolicy.allowedOrigins);
}

export function overlayPolicyIsAdvertisedAsEnforced(config: Config): boolean {
  const advertised = config.capabilities.overlayFetchPolicy;
  const enforced = advertisedOverlayPolicy(config);
  return advertised === enforced;
}

export function isAnonymousByDefault(config: Config): boolean {
  const allowed = config.overlayPolicy.allowedOrigins;
  if (allowed.length !== 1) {
    return false;
  }
  return allowed[0] === 'self';
}

export type PerimeterValidationOutcome =
  | { readonly success: true; readonly anonymousByDefault: true; readonly policyAligned: true }
  | { readonly success: false; readonly field: string; readonly message: string };

export function validatePerimeterControls(
  config: Config
): PerimeterValidationOutcome {
  if (!isAnonymousByDefault(config)) {
    return {
      success: false,
      field: 'overlayPolicy.allowedOrigins',
      message: 'Surface must be anonymous by default (allowedOrigins must be ["self"]).'
    };
  }
  if (!overlayPolicyIsAdvertisedAsEnforced(config)) {
    return {
      success: false,
      field: 'capabilities.overlayFetchPolicy',
      message: 'Advertised overlay fetch policy does not match enforced policy.'
    };
  }
  return { success: true, anonymousByDefault: true, policyAligned: true };
}

export function generateBasicQR(
  input: unknown,
  config: Config,
  audit: (result: ToolValidationResult) => void
): GenerationOutcome {
  const tool = config.capabilities.tools.find(t => t.name === BASIC_TOOL_NAME);
  if (!tool) {
    return { success: false, field: 'tool', message: 'Basic generation tool not found.' };
  }

  const validation = validateToolInput(input, tool);
  audit(validation);

  if (!validation.success) {
    return {
      success: false,
      field: validation.field ?? 'unknown',
      message: validation.message ?? 'Validation failed.'
    };
  }

  const record = input as GenerationInput;

  if (!config.capabilities.formats.includes(record.format)) {
    return {
      success: false,
      field: 'format',
      message: `Format '${record.format}' is not supported.`
    };
  }

  if (record.errorCorrectionLevel &&
      !config.capabilities.errorCorrectionLevels.includes(record.errorCorrectionLevel)) {
    return {
      success: false,
      field: 'errorCorrectionLevel',
      message: `Error correction level '${record.errorCorrectionLevel}' is not supported.`
    };
  }

  if (record.size !== undefined) {
    if (record.size < config.capabilities.sizeRange.min ||
        record.size > config.capabilities.sizeRange.max) {
      return {
        success: false,
        field: 'size',
        message: `Size must be between ${config.capabilities.sizeRange.min} and ${config.capabilities.sizeRange.max}.`
      };
    }
  }

  if (record.margin !== undefined) {
    if (record.margin < config.capabilities.marginRange.min ||
        record.margin > config.capabilities.marginRange.max) {
      return {
        success: false,
        field: 'margin',
        message: `Margin must be between ${config.capabilities.marginRange.min} and ${config.capabilities.marginRange.max}.`
      };
    }
  }

  return { success: true, artefact: `QR-${Buffer.from(record.data).toString('base64')}` };
}

export function generateAdvancedQR(
  input: unknown,
  config: Config,
  audit: (result: ToolValidationResult) => void
): GenerationOutcome {
  const tool = config.capabilities.tools.find(t => t.name === ADVANCED_TOOL_NAME);
  if (!tool) {
    return { success: false, field: 'tool', message: 'Advanced generation tool not found.' };
  }

  const validation = validateToolInput(input, tool);
  audit(validation);

  if (!validation.success) {
    return {
      success: false,
      field: validation.field ?? 'unknown',
      message: validation.message ?? 'Validation failed.'
    };
  }

  const record = input as AdvancedGenerationInput;

  const basicResult = generateBasicQR(record, config, audit);
  if (!basicResult.success) {
    return basicResult;
  }

  if (record.overlay) {
    const overlayCheck = checkOverlayPolicy(record.overlay.url, config);
    if (!overlayCheck.allowed) {
      return {
        success: false,
        field: 'overlay.url',
        message: overlayCheck.reason ?? 'Overlay origin denied.'
      };
    }
  }

  return { success: true, artefact: `ADVANCED-QR-${Buffer.from(record.data).toString('base64')}` };
}

export function createDefaultConfig(): Config {
  const basicTool = createTool(
    BASIC_TOOL_NAME,
    'Generate basic QR code',
    [
      { name: 'data', type: 'string', required: true },
      { name: 'format', type: 'string', required: true },
      { name: 'size', type: 'number', required: false, min: 256, max: 4096 },
      { name: 'margin', type: 'number', required: false, min: 0, max: 100 },
      { name: 'errorCorrectionLevel', type: 'string', required: false }
    ]
  );

  const advancedTool = createTool(
    ADVANCED_TOOL_NAME,
    'Generate advanced QR code with overlay support',
    [
      ...basicTool.parameters,
      { name: 'overlay', type: 'object', required: false }
    ]
  );

  const overlayPolicy = { allowedOrigins: DEFAULT_ALLOWED_ORIGINS };
  const overlayFetchPolicy = advertisedOverlayPolicyFromOrigins(overlayPolicy.allowedOrigins);

  const capabilities = createCapabilitiesResource(
    [basicTool, advancedTool],
    DEFAULT_FORMATS,
    DEFAULT_ERROR_CORRECTION_LEVELS,
    DEFAULT_SIZE_RANGE,
    DEFAULT_MARGIN_RANGE,
    overlayFetchPolicy,
    DEFAULT_SAFETY_GUARANTEES
  );

  return createConfig(capabilities, overlayPolicy);
}

function advertisedOverlayPolicyFromOrigins(
  allowedOrigins: readonly string[]
): string {
  if (allowedOrigins.length === 1 && allowedOrigins[0] === 'self') {
    return DEFAULT_OVERLAY_POLICY;
  }
  return 'deny';
}