// Brand overlay capability module for ANQR presentation domain
// Implements overlay modes, types, watermarks with validation and application

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

export interface OverlayConfig {
  mode: OverlayMode;
  type: OverlayType;
  watermark?: WatermarkType;
  url?: string;
  maxBytes?: number;
  maxMs?: number;
}

export interface OverlaySuccess {
  status: 'success';
  payload: string;
  overlayApplied: OverlayMode;
}

export interface OverlayFailure {
  status: 'failure';
  reason: 'fetch' | 'decode' | 'place';
  detail: string;
}

export type OverlayOutcome = OverlaySuccess | OverlayFailure;

export interface OverlayPreview {
  status: 'success' | 'failure';
  previewData?: string;
  reason?: string;
}

export interface ModeValidation {
  mode: OverlayMode;
  valid: boolean;
  payload?: string;
}

// URL validation helpers
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
  return ((parseInt(parts[0]) << 24) |
          (parseInt(parts[1]) << 16) |
          (parseInt(parts[2]) << 8) |
          parseInt(parts[3])) >>> 0;
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

// Pure validation functions
export function validateOverlayConfig(config: OverlayConfig): OverlayFailure | null {
  if (!overlayModes.includes(config.mode)) {
    return { status: 'failure', reason: 'decode', detail: `Invalid mode: ${config.mode}` };
  }
  if (!overlayTypes.includes(config.type)) {
    return { status: 'failure', reason: 'decode', detail: `Invalid type: ${config.type}` };
  }
  if (config.watermark && !watermarkTypes.includes(config.watermark)) {
    return { status: 'failure', reason: 'decode', detail: `Invalid watermark: ${config.watermark}` };
  }
  if (config.url && !validateUrl(config.url)) {
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

// Audit function for mutation ordering
export type OverlayAudit = (config: OverlayConfig) => OverlayFailure | null;

// Mutation function that respects audit ordering
export function applyOverlay(
  artefact: string,
  config: OverlayConfig,
  audit: OverlayAudit
): OverlayOutcome {
  const auditResult = audit(config);
  if (auditResult) return auditResult;

  // Simulate overlay application
  return {
    status: 'success',
    payload: `${artefact}[overlay:${config.mode}]`,
    overlayApplied: config.mode
  };
}

// Preview function showing export result
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

// Mode validation with representative artefacts
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
  if (auditResult) {
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

// Redirect validation helper
export function validateRedirects(redirectChain: readonly string[]): boolean {
  return validateRedirectChain(redirectChain);
}

// URL validation helper
export function isUrlSafe(url: string): boolean {
  return validateUrl(url);
}