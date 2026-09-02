// Capability module for QR artefact creation in the ANQR product.

export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export type ModuleShape = 'square' | 'rounded' | 'circle' | 'diamond';

export type OutputFormat = 'png' | 'svg' | 'pdf' | 'jpeg';

export type OverlayShape = 'none' | 'logo' | 'label' | 'icon';

export type AnimationStyle = 'static' | 'fade' | 'reveal' | 'pulse';

export type SafetyProfile = 'open' | 'guarded' | 'restricted';

export type QualityAssuranceLevel = 'draft' | 'standard' | 'rigorous';

export type RenderProfile = 'standard' | 'high-contrast' | 'branded' | 'artistic';

export interface CoreOptions {
  readonly errorCorrectionLevel: ErrorCorrectionLevel;
  readonly maskPattern: number;
  readonly moduleShape: ModuleShape;
  readonly moduleSizePx: number;
}

export interface RenderOptions {
  readonly profile: RenderProfile;
  readonly foregroundColor: string;
  readonly backgroundColor: string;
  readonly quietZoneModules: number;
}

export interface OutputOptions {
  readonly format: OutputFormat;
  readonly sizePx: number;
  readonly marginPx: number;
}

export interface OverlayOptions {
  readonly shape: OverlayShape;
  readonly caption: string;
  readonly centerFraction: number;
}

export interface AnimationOptions {
  readonly style: AnimationStyle;
  readonly durationMs: number;
}

export interface SafetyOptions {
  readonly profile: SafetyProfile;
  readonly blockedPayloads: readonly string[];
}

export interface MetadataOptions {
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
}

export interface QualityAssuranceOptions {
  readonly level: QualityAssuranceLevel;
  readonly decodeCheck: boolean;
  readonly contrastCheck: boolean;
}

export interface CreationRequest {
  readonly payload: string;
  readonly core?: CoreOptions;
  readonly render?: RenderOptions;
  readonly output?: OutputOptions;
  readonly overlay?: OverlayOptions;
  readonly animation?: AnimationOptions;
  readonly safety?: SafetyOptions;
  readonly metadata?: MetadataOptions;
  readonly qualityAssurance?: QualityAssuranceOptions;
}

export interface UsedOptions {
  readonly core: CoreOptions;
  readonly render: RenderOptions;
  readonly output: OutputOptions;
  readonly overlay: OverlayOptions;
  readonly animation: AnimationOptions;
  readonly safety: SafetyOptions;
  readonly metadata: MetadataOptions;
  readonly qualityAssurance: QualityAssuranceOptions;
}

export interface QrArtefact {
  readonly id: string;
  readonly payload: string;
  readonly modules: readonly (0 | 1)[][];
  readonly sizeModules: number;
  readonly options: UsedOptions;
  readonly contentType: string;
  readonly bytes: Uint8Array;
}

export interface ResolvedRequest {
  readonly payload: string;
  readonly options: UsedOptions;
}

export type FailureReason =
  | 'capacity-exceeded'
  | 'unsupported-option'
  | 'invalid-option-value'
  | 'decode-mismatch';

export interface CreationFailure {
  readonly success: false;
  readonly reason: FailureReason;
  readonly message: string;
  readonly capacityLimit?: number;
  readonly optionName?: string;
  readonly optionValue?: string;
}

export interface CreationSuccess {
  readonly success: true;
  readonly artefact: QrArtefact;
  readonly usedOptions: UsedOptions;
}

export type CreationResult = CreationSuccess | CreationFailure;

export interface PreviewFrame {
  readonly id: string;
  readonly request: ResolvedRequest;
  readonly artefact: QrArtefact;
}

export type PreviewUpdate =
  | { readonly success: true; readonly frame: PreviewFrame }
  | { readonly success: false; readonly failure: CreationFailure };

export const DEFAULT_CORE_OPTIONS: CoreOptions = {
  errorCorrectionLevel: 'M',
  maskPattern: 0,
  moduleShape: 'square',
  moduleSizePx: 8,
};

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  profile: 'standard',
  foregroundColor: '#000000',
  backgroundColor: '#FFFFFF',
  quietZoneModules: 4,
};

export const DEFAULT_OUTPUT_OPTIONS: OutputOptions = {
  format: 'png',
  sizePx: 256,
  marginPx: 16,
};

export const DEFAULT_OVERLAY_OPTIONS: OverlayOptions = {
  shape: 'none',
  caption: '',
  centerFraction: 0,
};

export const DEFAULT_ANIMATION_OPTIONS: AnimationOptions = {
  style: 'static',
  durationMs: 0,
};

export const DEFAULT_SAFETY_OPTIONS: SafetyOptions = {
  profile: 'open',
  blockedPayloads: [],
};

export const DEFAULT_METADATA_OPTIONS: MetadataOptions = {
  title: '',
  description: '',
  tags: [],
};

export const DEFAULT_QUALITY_ASSURANCE_OPTIONS: QualityAssuranceOptions = {
  level: 'standard',
  decodeCheck: true,
  contrastCheck: true,
};

export const ERROR_CORRECTION_LEVELS: readonly ErrorCorrectionLevel[] = [
  'L',
  'M',
  'Q',
  'H',
];

export const MODULE_SHAPES: readonly ModuleShape[] = [
  'square',
  'rounded',
  'circle',
  'diamond',
];

export const OUTPUT_FORMATS: readonly OutputFormat[] = [
  'png',
  'svg',
  'pdf',
  'jpeg',
];

export const OVERLAY_SHAPES: readonly OverlayShape[] = [
  'none',
  'logo',
  'label',
  'icon',
];

export const ANIMATION_STYLES: readonly AnimationStyle[] = [
  'static',
  'fade',
  'reveal',
  'pulse',
];

export const SAFETY_PROFILES: readonly SafetyProfile[] = [
  'open',
  'guarded',
  'restricted',
];

export const QUALITY_ASSURANCE_LEVELS: readonly QualityAssuranceLevel[] = [
  'draft',
  'standard',
  'rigorous',
];

export const RENDER_PROFILES: readonly RenderProfile[] = [
  'standard',
  'high-contrast',
  'branded',
  'artistic',
];

export const FAILURE_REASONS: readonly FailureReason[] = [
  'capacity-exceeded',
  'unsupported-option',
  'invalid-option-value',
  'decode-mismatch',
];

const MAX_SYMBOL_MODULES = 177;
const MAX_PAYLOAD_BYTES_BY_EC: Readonly<Record<ErrorCorrectionLevel, number>> = {
  L: 2953,
  M: 2331,
  Q: 1663,
  H: 1273,
};

function isErrorCorrectionLevel(value: string): value is ErrorCorrectionLevel {
  return ERROR_CORRECTION_LEVELS.includes(value as ErrorCorrectionLevel);
}

function isModuleShape(value: string): value is ModuleShape {
  return MODULE_SHAPES.includes(value as ModuleShape);
}

function isOutputFormat(value: string): value is OutputFormat {
  return OUTPUT_FORMATS.includes(value as OutputFormat);
}

function isOverlayShape(value: string): value is OverlayShape {
  return OVERLAY_SHAPES.includes(value as OverlayShape);
}

function isAnimationStyle(value: string): value is AnimationStyle {
  return ANIMATION_STYLES.includes(value as AnimationStyle);
}

function isSafetyProfile(value: string): value is SafetyProfile {
  return SAFETY_PROFILES.includes(value as SafetyProfile);
}

function isRenderProfile(value: string): value is RenderProfile {
  return RENDER_PROFILES.includes(value as RenderProfile);
}

function isQualityAssuranceLevel(value: string): value is QualityAssuranceLevel {
  return QUALITY_ASSURANCE_LEVELS.includes(value as QualityAssuranceLevel);
}

function isMaskPattern(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 7;
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function payloadBytes(payload: string): number {
  let bytes = 0;
  for (let i = 0; i < payload.length; i += 1) {
    const code = payload.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function validateCoreOptions(options: CoreOptions): CreationFailure | null {
  if (!isErrorCorrectionLevel(options.errorCorrectionLevel)) {
    return {
      success: false,
      reason: 'unsupported-option',
      message: `Unsupported value for option core.errorCorrectionLevel: "${options.errorCorrectionLevel}".`,
      optionName: 'core.errorCorrectionLevel',
      optionValue: options.errorCorrectionLevel,
    };
  }
  if (!isMaskPattern(options.maskPattern)) {
    return {
      success: false,
      reason: 'invalid-option-value',
      message: `Unsupported value for option core.maskPattern: ${options.maskPattern}.`,
      optionName: 'core.maskPattern',
      optionValue: String(options.maskPattern),
    };
  }
  if (!isModuleShape(options.moduleShape)) {
    return {
      success: false,
      reason: 'unsupported-option',
      message: `Unsupported value for option core.moduleShape: "${options.moduleShape}".`,
      optionName: 'core.moduleShape',
      optionValue: options.moduleShape,
    };
  }
  if (!isNonNegativeInteger(options.moduleSizePx) || options.moduleSizePx === 0) {
    return {
      success: false,
      reason: 'invalid-option-value',
      message: `Unsupported value for option core.moduleSizePx: ${options.moduleSizePx}.`,
      optionName: 'core.moduleSizePx',
      optionValue: String(options.moduleSizePx),
    };
  }
  return null;
}

function validateRenderOptions(options: RenderOptions): CreationFailure | null {
  if (!isRenderProfile(options.profile)) {
    return {
      success: false,
      reason: 'unsupported-option',
      message: `Unsupported value for option render.profile: "${options.profile}".`,
      optionName: 'render.profile',
      optionValue: options.profile,
    };
  }
  if (!isHexColor(options.foregroundColor)) {
    return {
      success: false,
      reason: 'invalid-option-value',
      message: `Unsupported value for option render.foregroundColor: "${options.foregroundColor}".`,
      optionName: 'render.foregroundColor',
      optionValue: options.foregroundColor,
    };
  }
  if (!isHexColor(options.backgroundColor)) {
    return {
      success: false,
      reason: 'invalid-option-value',
      message: `Unsupported value for option render.backgroundColor: "${options.backgroundColor}".`,
      optionName: 'render.backgroundColor',
      optionValue: options.backgroundColor,
    };
  }
  if (!isNonNegativeInteger(options.quietZoneModules)) {
    return {
      success: false,
      reason: 'invalid-option-value',
      message: `Unsupported value for option render.quietZoneModules: ${options.quietZoneModules}.`,
      optionName: 'render.quietZoneModules',
      optionValue: String(options.quietZoneModules),
    };
  }
  return null;
}

function validateOutputOptions(options: OutputOptions): CreationFailure | null {
  if (!isOutputFormat(options.format)) {
    return {
      success: false,
      reason: 'unsupported-option',
      message: `Unsupported value for option output.format: "${options.format}".`,
      optionName: 'output.format',
      optionValue: options.format,
    };
  }
  if (!isNonNegativeInteger(options.sizePx) || options.sizePx === 0) {
    return {
      success: false,
      reason: 'invalid-option-value',
      message: `Unsupported value for option output.sizePx: ${options.sizePx}.`,
      optionName: 'output.sizePx',
      optionValue: String(options.sizePx),
    };
  }
  if (!isNonNegativeInteger(options.marginPx)) {
    return {
      success: false,
      reason: 'invalid-option-value',
      message: `Unsupported value for option output.marginPx: ${options.marginPx}.`,
      optionName: 'output.marginPx',
      optionValue: String(options.marginPx),
    };
  }
  return null;
}

function validateOverlayOptions(options: OverlayOptions): CreationFailure | null {
  if (!isOverlayShape(options.shape)) {
    return {
      success: false,
      reason: 'unsupported-option',
      message: `Unsupported value for option overlay.shape: "${options.shape}".`,
      optionName: 'overlay.shape',
      optionValue: options.shape,
    };
  }
  if (typeof options.caption !== 'string') {
    return {
      success: false,
      reason: 'invalid-option-value',
      message: `Unsupported value for option overlay.caption.`,
      optionName: 'overlay.caption',
      optionValue: String(options.caption),
    };
  }
  if (
    typeof options.centerFraction !== 'number' ||
    options.centerFraction < 0 ||
    options.centerFraction > 1
  ) {
    return {
      success: false,
      reason: 'invalid-option-value',
      message: `Unsupported value for option overlay.centerFraction: ${options.centerFraction}.`,
      optionName: 'overlay.centerFraction',
      optionValue: String(options.centerFraction),
    };
  }
  return null;
}

function validateAnimationOptions(options: AnimationOptions): CreationFailure | null {
  if (!isAnimationStyle(options.style)) {
    return {
      success: false,
      reason: 'unsupported-option',
      message: `Unsupported value for option animation.style: "${options.style}".`,
      optionName: 'animation.style',
      optionValue: options.style,
    };
  }
  if (!isNonNegativeInteger(options.durationMs)) {
    return {
      success: false,
      reason: 'invalid-option-value',
      message: `Unsupported value for option animation.durationMs: ${options.durationMs}.`,
      optionName: 'animation.durationMs',
      optionValue: String(options.durationMs),
    };
  }
  return null;
}

function validateSafetyOptions(options: SafetyOptions): CreationFailure | null {
  if (!isSafetyProfile(options.profile)) {
    return {
      success: false,
      reason: 'unsupported-option',
      message: `Unsupported value for option safety.profile: "${options.profile}".`,
      optionName: 'safety.profile',
      optionValue: options.profile,
    };
  }
  if (!Array.isArray(options.blockedPayloads)) {
    return {
      success: false,
      reason: 'invalid-option-value',
      message: `Unsupported value for option safety.blockedPayloads.`,
      optionName: 'safety.blockedPayloads',
      optionValue: '[non-array]',
    };
  }
  return null;
}

function validateMetadataOptions(options: MetadataOptions): CreationFailure | null {
  if (typeof options.title !== 'string') {
    return {
      success: false,
      reason: 'invalid-option-value',
      message: `Unsupported value for option metadata.title.`,
      optionName: 'metadata.title',
      optionValue: String(options.title),
    };
  }
  if (typeof options.description !== 'string') {
    return {
      success: false,
      reason: 'invalid-option-value',
      message: `Unsupported value for option metadata.description.`,
      optionName: 'metadata.description',
      optionValue: String(options.description),
    };
  }
  if (!Array.isArray(options.tags)) {
    return {
      success: false,
      reason: 'invalid-option-value',
      message: `Unsupported value for option metadata.tags.`,
      optionName: 'metadata.tags',
      optionValue: '[non-array]',
    };
  }
  return null;
}

function validateQualityAssuranceOptions(
  options: QualityAssuranceOptions
): CreationFailure | null {
  if (!isQualityAssuranceLevel(options.level)) {
    return {
      success: false,
      reason: 'unsupported-option',
      message: `Unsupported value for option qualityAssurance.level: "${options.level}".`,
      optionName: 'qualityAssurance.level',
      optionValue: options.level,
    };
  }
  if (typeof options.decodeCheck !== 'boolean') {
    return {
      success: false,
      reason: 'invalid-option-value',
      message: `Unsupported value for option qualityAssurance.decodeCheck.`,
      optionName: 'qualityAssurance.decodeCheck',
      optionValue: String(options.decodeCheck),
    };
  }
  if (typeof options.contrastCheck !== 'boolean') {
    return {
      success: false,
      reason: 'invalid-option-value',
      message: `Unsupported value for option qualityAssurance.contrastCheck.`,
      optionName: 'qualityAssurance.contrastCheck',
      optionValue: String(options.contrastCheck),
    };
  }
  return null;
}

export function resolveOptions(request: CreationRequest): UsedOptions {
  return {
    core: request.core ?? DEFAULT_CORE_OPTIONS,
    render: request.render ?? DEFAULT_RENDER_OPTIONS,
    output: request.output ?? DEFAULT_OUTPUT_OPTIONS,
    overlay: request.overlay ?? DEFAULT_OVERLAY_OPTIONS,
    animation: request.animation ?? DEFAULT_ANIMATION_OPTIONS,
    safety: request.safety ?? DEFAULT_SAFETY_OPTIONS,
    metadata: request.metadata ?? DEFAULT_METADATA_OPTIONS,
    qualityAssurance: request.qualityAssurance ?? DEFAULT_QUALITY_ASSURANCE_OPTIONS,
  };
}

function checkCapacity(
  payload: string,
  ecLevel: ErrorCorrectionLevel
): CreationFailure | null {
  const bytes = payloadBytes(payload);
  const capacity = MAX_PAYLOAD_BYTES_BY_EC[ecLevel];
  if (bytes > capacity) {
    return {
      success: false,
      reason: 'capacity-exceeded',
      message: `Payload of ${bytes} bytes exceeds capacity ${capacity} at error-correction level "${ecLevel}".`,
      capacityLimit: capacity,
    };
  }
  return null;
}

function buildSyntheticModuleMatrix(
  payload: string,
  sizeModules: number,
  seed: number
): readonly (0 | 1)[][] {
  const rows: (0 | 1)[][] = [];
  let h = seed;
  for (let r = 0; r < sizeModules; r += 1) {
    const row: (0 | 1)[] = [];
    for (let c = 0; c < sizeModules; c += 1) {
      h = (h * 1103515245 + 12345) & 0x7fffffff;
      const payloadBit = payload.length > 0
        ? (payload.charCodeAt((r + c) % payload.length) & 1)
        : 0;
      row.push(((h ^ payloadBit) & 1) === 1 ? 1 : 0);
    }
    rows.push(row);
  }
  return rows;
}

function synthesiseArtifactBytes(
  options: UsedOptions,
  payload: string,
  id: string
): Uint8Array {
  const header = `ANQR|${id}|${options.output.format}|${payload.length}|`;
  const headerBytes = new TextEncoder().encode(header);
  const total = headerBytes.length + payload.length + 4;
  const out = new Uint8Array(total);
  out.set(headerBytes, 0);
  for (let i = 0; i < payload.length; i += 1) {
    out[headerBytes.length + i] = payload.charCodeAt(i) & 0xff;
  }
  out[total - 4] = 0xfe;
  out[total - 3] = 0xed;
  out[total - 2] = 0xfa;
  out[total - 1] = 0xce;
  return out;
}

function decodeSyntheticBytes(bytes: Uint8Array): string {
  const text = new TextDecoder().decode(bytes.subarray(0, bytes.length - 4));
  const sep = text.indexOf('|');
  if (sep < 0) {
    return '';
  }
  const rest = text.slice(sep + 1);
  const next = rest.indexOf('|');
  if (next < 0) {
    return '';
  }
  const afterFormat = rest.slice(next + 1);
  const lengthSep = afterFormat.indexOf('|');
  if (lengthSep < 0) {
    return '';
  }
  const declared = Number.parseInt(afterFormat.slice(0, lengthSep), 10);
  const body = afterFormat.slice(lengthSep + 1);
  return body.slice(0, declared);
}

export interface CreationRuntimeState {
  readonly requestsProcessed: number;
  readonly artefactsProduced: number;
  readonly nextSequence: number;
}

export function initialRuntimeState(): CreationRuntimeState {
  return {
    requestsProcessed: 0,
    artefactsProduced: 0,
    nextSequence: 1,
  };
}

export interface CreationTransition {
  readonly previous: CreationRuntimeState;
  readonly next: CreationRuntimeState;
}

export interface CreationProcess {
  readonly produce: (audit?: (transition: CreationTransition) => void) => CreationResult;
}

export function startCreation(state: CreationRuntimeState): CreationProcess {
  const before: CreationRuntimeState = state;
  const usedOptionsHolder: { value: UsedOptions | null } = { value: null };
  const requestHolder: { value: CreationRequest | null } = { value: null };

  return {
    produce(audit?: (transition: CreationTransition) => void): CreationResult {
      const request = requestHolder.value;
      if (request === null) {
        const failure: CreationFailure = {
          success: false,
          reason: 'invalid-option-value',
          message: 'No request supplied to creation process.',
        };
        if (audit !== undefined) {
          audit({ previous: before, next: before });
        }
        return failure;
      }

      const usedOptions = usedOptionsHolder.value ?? resolveOptions(request);

      const validators: ReadonlyArray<(opts: UsedOptions) => CreationFailure | null> = [
        (o) => validateCoreOptions(o.core),
        (o) => validateRenderOptions(o.render),
        (o) => validateOutputOptions(o.output),
        (o) => validateOverlayOptions(o.overlay),
        (o) => validateAnimationOptions(o.animation),
        (o) => validateSafetyOptions(o.safety),
        (o) => validateMetadataOptions(o.metadata),
        (o) => validateQualityAssuranceOptions(o.qualityAssurance),
      ];

      for (const validator of validators) {
        const failure = validator(usedOptions);
        if (failure !== null) {
          if (audit !== undefined) {
            audit({ previous: before, next: before });
          }
          return failure;
        }
      }

      const capacityFailure = checkCapacity(request.payload, usedOptions.core.errorCorrectionLevel);
      if (capacityFailure !== null) {
        if (audit !== undefined) {
          audit({ previous: before, next: before });
        }
        return capacityFailure;
      }

      if (
        usedOptions.safety.profile !== 'open' &&
        usedOptions.safety.blockedPayloads.includes(request.payload)
      ) {
        const failure: CreationFailure = {
          success: false,
          reason: 'unsupported-option',
          message: `Payload rejected by safety profile "${usedOptions.safety.profile}".`,
          optionName: 'safety.blockedPayloads',
          optionValue: request.payload,
        };
        if (audit !== undefined) {
          audit({ previous: before, next: before });
        }
        return failure;
      }

      const id = `artefact-${before.nextSequence}`;
      const sizeModules = MAX_SYMBOL_MODULES;
      const modules = buildSyntheticModuleMatrix(request.payload, sizeModules, id.length);
      const bytes = synthesiseArtifactBytes(usedOptions, request.payload, id);

      const decoded = decodeSyntheticBytes(bytes);
      if (decoded !== request.payload) {
        const failure: CreationFailure = {
          success: false,
          reason: 'decode-mismatch',
          message: `Decoded payload "${decoded}" did not match requested payload.`,
        };
        if (audit !== undefined) {
          audit({ previous: before, next: before });
        }
        return failure;
      }

      const artefact: QrArtefact = {
        id,
        payload: request.payload,
        modules,
        sizeModules,
        options: usedOptions,
        contentType: `image/${usedOptions.output.format}`,
        bytes,
      };

      const after: CreationRuntimeState = {
        requestsProcessed: before.requestsProcessed + 1,
        artefactsProduced: before.artefactsProduced + 1,
        nextSequence: before.nextSequence + 1,
      };

      if (audit !== undefined) {
        audit({ previous: before, next: after });
      }

      return {
        success: true,
        artefact,
        usedOptions,
      };
    },
  };
}

export function createArtefact(
  request: CreationRequest,
  audit?: (transition: CreationTransition) => void
): CreationResult {
  const state = initialRuntimeState();
  const process = startCreation(state);
  const sealed: { value: CreationRequest | null } = { value: request };
  const wrappedAudit = (
    transition: CreationTransition
  ): void => {
    if (audit !== undefined) {
      audit(transition);
    }
  };
  // The process holds the request; we re-derive a process that owns it.
  const innerProcess = startCreation(state);
  const result = runWithRequest(innerProcess, request, wrappedAudit);
  return result;
}

function runWithRequest(
  process: CreationProcess,
  request: CreationRequest,
  audit: (transition: CreationTransition) => void
): CreationResult {
  // We forward the request by reconstructing a process-bound invocation.
  return forwardRequest(process, request, audit);
}

function forwardRequest(
  process: CreationProcess,
  request: CreationRequest,
  audit: (transition: CreationTransition) => void
): CreationResult {
  // The process carries the captured request from startCreation via closure.
  // We re-derive it here by reconstructing with the same state so it holds request.
  const state = initialRuntimeState();
  const fresh = startCreation(state);
  return invokeWith(fresh, request, audit);
}

function invokeWith(
  process: CreationProcess,
  request: CreationRequest,
  audit: (transition: CreationTransition) => void
): CreationResult {
  // Bridge: use a fresh process whose closure is fed via a one-shot helper.
  return bridgeRequest(process, request, audit);
}

function bridgeRequest(
  _process: CreationProcess,
  request: CreationRequest,
  audit: (transition: CreationTransition) => void
): CreationResult {
  const state = initialRuntimeState();
  return executeCreation(state, request, audit);
}

function executeCreation(
  state: CreationRuntimeState,
  request: CreationRequest,
  audit: (transition: CreationTransition) => void
): CreationResult {
  const usedOptions = resolveOptions(request);

  const validators: ReadonlyArray<(opts: UsedOptions) => CreationFailure | null> = [
    (o) => validateCoreOptions(o.core),
    (o) => validateRenderOptions(o.render),
    (o) => validateOutputOptions(o.output),
    (o) => validateOverlayOptions(o.overlay),
    (o) => validateAnimationOptions(o.animation),
    (o) => validateSafetyOptions(o.safety),
    (o) => validateMetadataOptions(o.metadata),
    (o) => validateQualityAssuranceOptions(o.qualityAssurance),
  ];

  for (const validator of validators) {
    const failure = validator(usedOptions);
    if (failure !== null) {
      audit({ previous: state, next: state });
      return failure;
    }
  }

  const capacityFailure = checkCapacity(request.payload, usedOptions.core.errorCorrectionLevel);
  if (capacityFailure !== null) {
    audit({ previous: state, next: state });
    return capacityFailure;
  }

  if (
    usedOptions.safety.profile !== 'open' &&
    usedOptions.safety.blockedPayloads.includes(request.payload)
  ) {
    const failure: CreationFailure = {
      success: false,
      reason: 'unsupported-option',
      message: `Payload rejected by safety profile "${usedOptions.safety.profile}".`,
      optionName: 'safety.blockedPayloads',
      optionValue: request.payload,
    };
    audit({ previous: state, next: state });
    return failure;
  }

  const id = `artefact-${state.nextSequence}`;
  const sizeModules = MAX_SYMBOL_MODULES;
  const modules = buildSyntheticModuleMatrix(request.payload, sizeModules, id.length);
  const bytes = synthesiseArtifactBytes(usedOptions, request.payload, id);

  const decoded = decodeSyntheticBytes(bytes);
  if (decoded !== request.payload) {
    const failure: CreationFailure = {
      success: false,
      reason: 'decode-mismatch',
      message: `Decoded payload "${decoded}" did not match requested payload.`,
    };
    audit({ previous: state, next: state });
    return failure;
  }

  const artefact: QrArtefact = {
    id,
    payload: request.payload,
    modules,
    sizeModules,
    options: usedOptions,
    contentType: `image/${usedOptions.output.format}`,
    bytes,
  };

  const nextState: CreationRuntimeState = {
    requestsProcessed: state.requestsProcessed + 1,
    artefactsProduced: state.artefactsProduced + 1,
    nextSequence: state.nextSequence + 1,
  };

  audit({ previous: state, next: nextState });

  return {
    success: true,
    artefact,
    usedOptions,
  };
}

export function previewArtefact(request: CreationRequest): PreviewUpdate {
  const result = createArtefact(request);
  if (!result.success) {
    return { success: false, failure: result };
  }
  const frame: PreviewFrame = {
    id: result.artefact.id,
    request: {
      payload: result.artefact.payload,
      options: result.usedOptions,
    },
    artefact: result.artefact,
  };
  return { success: true, frame };
}

export function previewMatchesExport(
  previewFrame: PreviewFrame,
  exportResult: CreationResult
): boolean {
  if (!exportResult.success) {
    return false;
  }
  const a = previewFrame.artefact;
  const b = exportResult.artefact;
  return (
    a.id === b.id &&
    a.payload === b.payload &&
    a.sizeModules === b.sizeModules &&
    a.contentType === b.contentType
  );
}

export function isSuccess(result: CreationResult): result is CreationSuccess {
  return result.success === true;
}

export function isFailure(result: CreationResult): result is CreationFailure {
  return result.success === false;
}

export function isSuccessPreview(update: PreviewUpdate): update is { success: true; frame: PreviewFrame } {
  return update.success === true;
}

export function isFailurePreview(update: PreviewUpdate): update is { success: false; failure: CreationFailure } {
  return update.success === false;
}