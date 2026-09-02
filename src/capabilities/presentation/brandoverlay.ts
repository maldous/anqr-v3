export const overlayModes = [
  'center', 'blend', 'halftone', 'halftone-dithered', 'mosaic', 'gapfill',
  'brightness', 'duotone', 'subpixel', 'dithered', 'blue-noise', 'pixelate',
  'outline', 'wave', 'subpixel-size', 'dither', 'extreme', 'artwork'
] as const;
export type OverlayMode = typeof overlayModes[number];

export const overlayTypes = ['static', 'gif', 'apng', 'webp_anim', 'video'] as const;
export type OverlayType = typeof overlayTypes[number];

export const watermarkTypes = ['text', 'image', 'pattern'] as const;
export type WatermarkType = typeof watermarkTypes[number];

export const overlayFailureReasons = ['fetch', 'decode', 'place'] as const;
export type OverlayFailureReason = typeof overlayFailureReasons[number];

export interface OverlayConfig {
  readonly mode: OverlayMode;
  readonly type: OverlayType;
  readonly watermark?: WatermarkType;
  readonly url?: string;
  readonly maxBytes?: number;
  readonly maxMs?: number;
}

export interface OverlaySuccess {
  readonly status: 'success';
  readonly payload: string;
  readonly overlayApplied: OverlayMode;
}

export interface OverlayFailure {
  readonly status: 'failure';
  readonly reason: OverlayFailureReason;
  readonly detail: string;
}

export type OverlayOutcome = OverlaySuccess | OverlayFailure;

export interface OverlayPreview {
  readonly status: 'success' | 'failure';
  readonly previewData?: string;
  readonly reason?: string;
}

export interface ModeValidation {
  readonly mode: OverlayMode;
  readonly valid: boolean;
  readonly payload?: string;
}

const PRIVATE_RANGES = [
  { start: '10.0.0.0', end: '10.255.255.255' },
  { start: '172.16.0.0', end: '172.31.255.255' },
  { start: '192.168.0.0', end: '192.168.255.255' },
  { start: '127.0.0.0', end: '127.255.255.255' },
  { start: '169.254.0.0', end: '169.254.255.255' },
  { start: '169.254.169.254', end: '169.254.169.254' }
];

function ipToNumber(ip: string): number {
  const parts = ip.split('.');
  return ((parseInt(parts[0], 10) << 24) |
          (parseInt(parts[1], 10) << 16) |
          (parseInt(parts[2], 10) << 8) |
          parseInt(parts[3], 10)) >>> 0;
}

function isPrivateIp(hostname: string): boolean {
  if (!hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) return false;
  const ipNum = ipToNumber(hostname);
  for (const range of PRIVATE_RANGES) {
    const startNum = ipToNumber(range.start);
    const endNum = ipToNumber(range.end);
    if (ipNum >= startNum && ipNum <= endNum) return true;
  }
  return false;
}

function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (isPrivateIp(parsed.hostname)) return false;
    if (parsed.hostname === 'localhost' || parsed.hostname === '0.0.0.0') return false;
    return true;
  } catch {
    return false;
  }
}

function validateRedirectChain(urls: readonly string[]): boolean {
  for (const url of urls) {
    if (!validateUrl(url)) return false;
  }
  return true;
}

export function validateOverlayConfig(config: OverlayConfig): OverlayFailure | null {
  if (!overlayModes.includes(config.mode)) {
    return { status: 'failure', reason: 'decode', detail: `Invalid mode: ${config.mode}` };
  }
  if (!overlayTypes.includes(config.type)) {
    return { status: 'failure', reason: 'decode', detail: `Invalid type: ${config.type}` };
  }
  if (config.watermark !== undefined && !watermarkTypes.includes(config.watermark)) {
    return { status: 'failure', reason: 'decode', detail: `Invalid watermark: ${config.watermark}` };
  }
  if (config.url !== undefined && !validateUrl(config.url)) {
    return { status: 'failure', reason: 'fetch', detail: 'URL validation failed' };
  }
  if (config.maxBytes !== undefined && config.maxBytes <= 0) {
    return { status: 'failure', reason: 'fetch', detail: 'Invalid byte bound' };
  }
  if (config.maxMs !== undefined && config.maxMs <= 0) {
    return { status: 'failure', reason: 'fetch', detail: 'Invalid time bound' };
  }
  return null;
}

export type OverlayAudit = (config: OverlayConfig) => OverlayFailure | null;

function buildOverlayOutput(artefact: string, config: OverlayConfig): string {
  return `${artefact}[overlay:${config.mode}]`;
}

export function applyOverlay(
  artefact: string,
  config: OverlayConfig,
  audit: OverlayAudit
): OverlayOutcome {
  const auditResult = audit(config);
  if (auditResult !== null) {
    return auditResult;
  }

  return {
    status: 'success',
    payload: buildOverlayOutput(artefact, config),
    overlayApplied: config.mode
  };
}

export function previewOverlay(
  artefact: string,
  config: OverlayConfig,
  audit: OverlayAudit
): OverlayPreview {
  const result = applyOverlay(artefact, config, audit);
  if (result.status === 'failure') {
    return { status: 'failure', reason: result.detail };
  }
  return { status: 'success', previewData: result.payload };
}

const modeArtefacts: Record<OverlayMode, string> = {
  center: 'base[center]',
  blend: 'base[blend]',
  halftone: 'base[halftone]',
  'halftone-dithered': 'base[halftone-dithered]',
  mosaic: 'base[mosaic]',
  gapfill: 'base[gapfill]',
  brightness: 'base[brightness]',
  duotone: 'base[duotone]',
  subpixel: 'base[subpixel]',
  dithered: 'base[dithered]',
  'blue-noise': 'base[blue-noise]',
  pixelate: 'base[pixelate]',
  outline: 'base[outline]',
  wave: 'base[wave]',
  'subpixel-size': 'base[subpixel-size]',
  dither: 'base[dither]',
  extreme: 'base[extreme]',
  artwork: 'base[artwork]'
};

export function validateMode(mode: OverlayMode): ModeValidation {
  if (!overlayModes.includes(mode)) {
    return { mode, valid: false };
  }
  const config: OverlayConfig = {
    mode,
    type: 'static',
    url: 'https://example.com/overlay.png'
  };
  const auditResult = validateOverlayConfig(config);
  if (auditResult !== null) {
    return { mode, valid: false };
  }
  const result = applyOverlay(modeArtefacts[mode], config, validateOverlayConfig);
  if (result.status === 'failure') {
    return { mode, valid: false };
  }
  return { mode, valid: true, payload: result.payload };
}

export function validateAllModes(): ModeValidation[] {
  return overlayModes.map(mode => validateMode(mode));
}

export function refuseOverlay(
  reason: OverlayFailureReason,
  detail: string
): OverlayFailure {
  if (!overlayFailureReasons.includes(reason)) {
    return { status: 'failure', reason: 'decode', detail: `Unknown refusal reason: ${detail}` };
  }
  return { status: 'failure', reason, detail };
}

export function refuseFetch(detail: string): OverlayFailure {
  return refuseOverlay('fetch', detail);
}

export function refuseDecode(detail: string): OverlayFailure {
  return refuseOverlay('decode', detail);
}

export function refusePlace(detail: string): OverlayFailure {
  return refuseOverlay('place', detail);
}

export function validateRedirects(redirectChain: readonly string[]): boolean {
  return validateRedirectChain(redirectChain);
}

export function isUrlSafe(url: string): boolean {
  return validateUrl(url);
}