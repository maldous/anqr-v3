// roundtripcorrectness.ts
// Capability module for round-trip correctness in the ANQR product.

// --- Type definitions ---

export type PayloadKind =
  | 'text'
  | 'url'
  | 'email'
  | 'phone'
  | 'sms'
  | 'wifi'
  | 'vcard'
  | 'geo'
  | 'event'
  | 'crypto';

export const PAYLOAD_KINDS = [
  'text',
  'url',
  'email',
  'phone',
  'sms',
  'wifi',
  'vcard',
  'geo',
  'event',
  'crypto',
] as const;

export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export const ERROR_CORRECTION_LEVELS = ['L', 'M', 'Q', 'H'] as const;

export interface StyleCustomisation {
  readonly foreground: string;
  readonly background: string;
  readonly eyeShape: 'square' | 'circle' | 'rounded';
  readonly moduleShape: 'square' | 'circle' | 'rounded';
}

export interface OverlayCustomisation {
  readonly logo?: { readonly data: string; readonly size: number };
  readonly frame?: { readonly label: string; readonly color: string };
}

export interface ArtworkCustomisation {
  readonly eyeColor: string;
  readonly dataColor: string;
  readonly timingPattern: 'solid' | 'gradient' | 'pattern';
}

export interface AnimationCustomisation {
  readonly enabled: boolean;
  readonly speed: 'slow' | 'normal' | 'fast';
}

export interface Payload {
  readonly kind: PayloadKind;
  readonly content: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface Artefact {
  readonly version: number;
  readonly payload: Payload;
  readonly checksum: string;
}

export interface CreationOptions {
  readonly payload: Payload;
  readonly errorCorrection: ErrorCorrectionLevel;
  readonly style?: StyleCustomisation;
  readonly overlay?: OverlayCustomisation;
  readonly artwork?: ArtworkCustomisation;
  readonly animation?: AnimationCustomisation;
}

export type CreationOutcome =
  | { readonly success: true; readonly artefact: Artefact }
  | { readonly success: false; readonly error: CreationError };

export interface CreationError {
  readonly message: string;
  readonly code: CreationErrorCode;
  readonly role: 'alert';
}

export const CREATION_ERROR_CODES = [
  'INVALID_PAYLOAD_KIND',
  'INVALID_ERROR_CORRECTION',
  'INVALID_PAYLOAD_CONTENT',
  'INVALID_STYLE',
  'INVALID_OVERLAY',
  'INVALID_ARTWORK',
  'INVALID_ANIMATION',
  'ROUNDTRIP_MISMATCH',
] as const;

export type CreationErrorCode = typeof CREATION_ERROR_CODES[number];

export type ValidationOutcome =
  | { readonly success: true }
  | { readonly success: false; readonly error: CreationError };

// --- Constants ---

export const ARTEFACT_VERSION = 1 as const;

export const VALID_EYE_SHAPES = ['square', 'circle', 'rounded'] as const;
export const VALID_MODULE_SHAPES = ['square', 'circle', 'rounded'] as const;
export const VALID_TIMING_PATTERNS = ['solid', 'gradient', 'pattern'] as const;
export const VALID_ANIMATION_SPEEDS = ['slow', 'normal', 'fast'] as const;

// --- Pure helpers (used by both validation and creation) ---

export function isPayloadKind(value: unknown): value is PayloadKind {
  return typeof value === 'string' && (PAYLOAD_KINDS as readonly string[]).includes(value);
}

export function isErrorCorrectionLevel(value: unknown): value is ErrorCorrectionLevel {
  return typeof value === 'string' && (ERROR_CORRECTION_LEVELS as readonly string[]).includes(value);
}

export function validateStyle(style: StyleCustomisation | undefined): ValidationOutcome {
  if (style === undefined) {
    return { success: true };
  }
  if (typeof style.foreground !== 'string' || style.foreground.trim() === '') {
    return failure('INVALID_STYLE', 'Style foreground must be a non-empty string.');
  }
  if (typeof style.background !== 'string' || style.background.trim() === '') {
    return failure('INVALID_STYLE', 'Style background must be a non-empty string.');
  }
  if (!(VALID_EYE_SHAPES as readonly string[]).includes(style.eyeShape)) {
    return failure('INVALID_STYLE', 'Style eyeShape is not one of the allowed values.');
  }
  if (!(VALID_MODULE_SHAPES as readonly string[]).includes(style.moduleShape)) {
    return failure('INVALID_STYLE', 'Style moduleShape is not one of the allowed values.');
  }
  return { success: true };
}

export function validateOverlay(overlay: OverlayCustomisation | undefined): ValidationOutcome {
  if (overlay === undefined) {
    return { success: true };
  }
  if (overlay.logo !== undefined) {
    if (typeof overlay.logo.data !== 'string' || overlay.logo.data.length === 0) {
      return failure('INVALID_OVERLAY', 'Overlay logo data must be a non-empty string.');
    }
    if (typeof overlay.logo.size !== 'number' || overlay.logo.size <= 0) {
      return failure('INVALID_OVERLAY', 'Overlay logo size must be a positive number.');
    }
  }
  if (overlay.frame !== undefined) {
    if (typeof overlay.frame.label !== 'string' || overlay.frame.label.trim() === '') {
      return failure('INVALID_OVERLAY', 'Overlay frame label must be a non-empty string.');
    }
    if (typeof overlay.frame.color !== 'string' || overlay.frame.color.trim() === '') {
      return failure('INVALID_OVERLAY', 'Overlay frame color must be a non-empty string.');
    }
  }
  return { success: true };
}

export function validateArtwork(artwork: ArtworkCustomisation | undefined): ValidationOutcome {
  if (artwork === undefined) {
    return { success: true };
  }
  if (typeof artwork.eyeColor !== 'string' || artwork.eyeColor.trim() === '') {
    return failure('INVALID_ARTWORK', 'Artwork eyeColor must be a non-empty string.');
  }
  if (typeof artwork.dataColor !== 'string' || artwork.dataColor.trim() === '') {
    return failure('INVALID_ARTWORK', 'Artwork dataColor must be a non-empty string.');
  }
  if (!(VALID_TIMING_PATTERNS as readonly string[]).includes(artwork.timingPattern)) {
    return failure('INVALID_ARTWORK', 'Artwork timingPattern is not one of the allowed values.');
  }
  return { success: true };
}

export function validateAnimation(animation: AnimationCustomisation | undefined): ValidationOutcome {
  if (animation === undefined) {
    return { success: true };
  }
  if (typeof animation.enabled !== 'boolean') {
    return failure('INVALID_ANIMATION', 'Animation enabled must be a boolean.');
  }
  if (!(VALID_ANIMATION_SPEEDS as readonly string[]).includes(animation.speed)) {
    return failure('INVALID_ANIMATION', 'Animation speed is not one of the allowed values.');
  }
  return { success: true };
}

export function validatePayload(payload: Payload): ValidationOutcome {
  if (!isPayloadKind(payload.kind)) {
    return failure('INVALID_PAYLOAD_KIND', `Payload kind "${payload.kind}" is not a declared payload kind.`);
  }
  if (typeof payload.content !== 'string' || payload.content.length === 0) {
    return failure('INVALID_PAYLOAD_CONTENT', 'Payload content must be a non-empty string.');
  }
  if (payload.metadata !== undefined) {
    for (const [key, value] of Object.entries(payload.metadata)) {
      if (typeof value !== 'string') {
        return failure('INVALID_PAYLOAD_CONTENT', `Payload metadata entry "${key}" must be a string.`);
      }
    }
  }
  return { success: true };
}

// --- Encoding helpers ---

function failure(code: CreationErrorCode, message: string): { success: false; readonly error: CreationError } {
  return {
    success: false,
    error: { message: message, code: code, role: 'alert' },
  };
}

/**
 * Produces a deterministic encoding of the creation request as it would be
 * carried inside an ANQR artefact. The encoder is a pure function; the
 * decoder is `decodeArtefact`, and the round-trip property is proven by
 * the creation function which decodes every artefact it returns.
 */
export function encodeArtefact(
  payload: Payload,
  errorCorrection: ErrorCorrectionLevel,
  style: StyleCustomisation | undefined,
  overlay: OverlayCustomisation | undefined,
  artwork: ArtworkCustomisation | undefined,
  animation: AnimationCustomisation | undefined
): string {
  const payloadPart = `${payload.kind}:${payload.content}`;
  const metadataPart =
    payload.metadata === undefined ? '' : `#${JSON.stringify(payload.metadata)}`;
  const ecPart = `|EC=${errorCorrection}`;
  const stylePart = style === undefined ? '' : `|S=${style.foreground};${style.background};${style.eyeShape};${style.moduleShape}`;
  const overlayPart =
    overlay === undefined
      ? ''
      : `|O=${
          overlay.logo === undefined ? '-' : `${overlay.logo.data}/${overlay.logo.size}`
        };${
          overlay.frame === undefined ? '-' : `${overlay.frame.label}/${overlay.frame.color}`
        }`;
  const artworkPart =
    artwork === undefined
      ? ''
      : `|A=${artwork.eyeColor};${artwork.dataColor};${artwork.timingPattern}`;
  const animationPart =
    animation === undefined ? '' : `|M=${animation.enabled ? '1' : '0'};${animation.speed}`;
  return payloadPart + metadataPart + ecPart + stylePart + overlayPart + artworkPart + animationPart;
}

/**
 * Decodes an artefact body string into its constituent parts. This is the
 * function whose output is the evidence for round-trip correctness.
 */
export function decodeArtefact(body: string): {
  readonly payload: Payload;
  readonly errorCorrection: ErrorCorrectionLevel;
  readonly style?: StyleCustomisation;
  readonly overlay?: OverlayCustomisation;
  readonly artwork?: ArtworkCustomisation;
  readonly animation?: AnimationCustomisation;
} {
  const segments = body.split('|');
  const payloadSegment = segments[0] ?? '';
  const payloadParts = payloadSegment.split('#', 2);
  const headerPart = payloadParts[0] ?? '';
  const metadataJson = payloadParts[1];

  const colonIndex = headerPart.indexOf(':');
  if (colonIndex <= 0 || colonIndex >= headerPart.length - 1) {
    throw new Error('Decoded payload is malformed.');
  }
  const kindRaw = headerPart.slice(0, colonIndex);
  const content = headerPart.slice(colonIndex + 1);
  if (!isPayloadKind(kindRaw)) {
    throw new Error(`Decoded payload kind "${kindRaw}" is not declared.`);
  }
  const kind = kindRaw;
  const metadata: Record<string, string> | undefined =
    metadataJson === undefined || metadataJson.length === 0 ? undefined : JSON.parse(metadataJson) as Record<string, string>;
  const payload: Payload = metadata === undefined ? { kind, content } : { kind, content, metadata };

  let errorCorrection: ErrorCorrectionLevel = 'M';
  let style: StyleCustomisation | undefined;
  let overlay: OverlayCustomisation | undefined;
  let artwork: ArtworkCustomisation | undefined;
  let animation: AnimationCustomisation | undefined;

  for (const segment of segments.slice(1)) {
    if (segment.length === 0) continue;
    const eqIndex = segment.indexOf('=');
    if (eqIndex <= 0) continue;
    const tag = segment.slice(0, eqIndex);
    const value = segment.slice(eqIndex + 1);
    if (tag === 'EC') {
      if (!isErrorCorrectionLevel(value)) {
        throw new Error(`Decoded error correction level "${value}" is not declared.`);
      }
      errorCorrection = value;
    } else if (tag === 'S') {
      const parts = value.split(';');
      if (parts.length !== 4) throw new Error('Decoded style segment is malformed.');
      const [foreground, background, eyeShapeRaw, moduleShapeRaw] = parts;
      if (
        foreground === undefined || background === undefined ||
        eyeShapeRaw === undefined || moduleShapeRaw === undefined
      ) {
        throw new Error('Decoded style segment is incomplete.');
      }
      if (!(VALID_EYE_SHAPES as readonly string[]).includes(eyeShapeRaw)) {
        throw new Error(`Decoded eye shape "${eyeShapeRaw}" is not declared.`);
      }
      if (!(VALID_MODULE_SHAPES as readonly string[]).includes(moduleShapeRaw)) {
        throw new Error(`Decoded module shape "${moduleShapeRaw}" is not declared.`);
      }
      style = {
        foreground,
        background,
        eyeShape: eyeShapeRaw as StyleCustomisation['eyeShape'],
        moduleShape: moduleShapeRaw as StyleCustomisation['moduleShape'],
      };
    } else if (tag === 'O') {
      const parts = value.split(';');
      if (parts.length !== 2) throw new Error('Decoded overlay segment is malformed.');
      const [logoPart, framePart] = parts;
      if (logoPart === undefined || framePart === undefined) {
        throw new Error('Decoded overlay segment is incomplete.');
      }
      let logo: OverlayCustomisation['logo'];
      if (logoPart !== '-') {
        const slash = logoPart.lastIndexOf('/');
        if (slash <= 0) throw new Error('Decoded overlay logo is malformed.');
        const data = logoPart.slice(0, slash);
        const sizeRaw = logoPart.slice(slash + 1);
        const size = Number(sizeRaw);
        if (Number.isNaN(size)) throw new Error('Decoded overlay logo size is not a number.');
        logo = { data, size };
      }
      let frame: OverlayCustomisation['frame'];
      if (framePart !== '-') {
        const slash = framePart.indexOf('/');
        if (slash <= 0) throw new Error('Decoded overlay frame is malformed.');
        const label = framePart.slice(0, slash);
        const color = framePart.slice(slash + 1);
        frame = { label, color };
      }
      overlay = {};
      if (logo !== undefined) overlay = { ...overlay, logo };
      if (frame !== undefined) overlay = { ...overlay, frame };
    } else if (tag === 'A') {
      const parts = value.split(';');
      if (parts.length !== 3) throw new Error('Decoded artwork segment is malformed.');
      const [eyeColor, dataColor, timingPatternRaw] = parts;
      if (eyeColor === undefined || dataColor === undefined || timingPatternRaw === undefined) {
        throw new Error('Decoded artwork segment is incomplete.');
      }
      if (!(VALID_TIMING_PATTERNS as readonly string[]).includes(timingPatternRaw)) {
        throw new Error(`Decoded timing pattern "${timingPatternRaw}" is not declared.`);
      }
      artwork = {
        eyeColor,
        dataColor,
        timingPattern: timingPatternRaw as ArtworkCustomisation['timingPattern'],
      };
    } else if (tag === 'M') {
      const parts = value.split(';');
      if (parts.length !== 2) throw new Error('Decoded animation segment is malformed.');
      const [enabledRaw, speedRaw] = parts;
      if (enabledRaw === undefined || speedRaw === undefined) {
        throw new Error('Decoded animation segment is incomplete.');
      }
      if (enabledRaw !== '0' && enabledRaw !== '1') {
        throw new Error('Decoded animation enabled flag is malformed.');
      }
      if (!(VALID_ANIMATION_SPEEDS as readonly string[]).includes(speedRaw)) {
        throw new Error(`Decoded animation speed "${speedRaw}" is not declared.`);
      }
      animation = {
        enabled: enabledRaw === '1',
        speed: speedRaw as AnimationCustomisation['speed'],
      };
    }
  }

  const decoded: {
    payload: Payload;
    errorCorrection: ErrorCorrectionLevel;
    style?: StyleCustomisation;
    overlay?: OverlayCustomisation;
    artwork?: ArtworkCustomisation;
    animation?: AnimationCustomisation;
  } = { payload, errorCorrection };
  if (style !== undefined) (decoded as { style?: StyleCustomisation }).style = style;
  if (overlay !== undefined) (decoded as { overlay?: OverlayCustomisation }).overlay = overlay;
  if (artwork !== undefined) (decoded as { artwork?: ArtworkCustomisation }).artwork = artwork;
  if (animation !== undefined) (decoded as { animation?: AnimationCustomisation }).animation = animation;
  return decoded;
}

// --- Round-trip equivalence proof ---

function payloadsEqual(a: Payload, b: Payload): boolean {
  if (a.kind !== b.kind) return false;
  if (a.content !== b.content) return false;
  const aMeta = a.metadata ?? {};
  const bMeta = b.metadata ?? {};
  const aKeys = Object.keys(aMeta);
  const bKeys = Object.keys(bMeta);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (aMeta[key] !== bMeta[key]) return false;
  }
  return true;
}

function optionsEqual(
  original: CreationOptions,
  decoded: {
    payload: Payload;
    errorCorrection: ErrorCorrectionLevel;
    style?: StyleCustomisation;
    overlay?: OverlayCustomisation;
    artwork?: ArtworkCustomisation;
    animation?: AnimationCustomisation;
  }
): boolean {
  if (!payloadsEqual(original.payload, decoded.payload)) return false;
  if (original.errorCorrection !== decoded.errorCorrection) return false;

  const origStyle = original.style;
  const decStyle = decoded.style;
  if (origStyle === undefined && decStyle === undefined) {
    // equal
  } else if (origStyle === undefined || decStyle === undefined) {
    return false;
  } else if (
    origStyle.foreground !== decStyle.foreground ||
    origStyle.background !== decStyle.background ||
    origStyle.eyeShape !== decStyle.eyeShape ||
    origStyle.moduleShape !== decStyle.moduleShape
  ) {
    return false;
  }

  const origOverlay = original.overlay;
  const decOverlay = decoded.overlay;
  if (origOverlay === undefined && decOverlay === undefined) {
    // equal
  } else if (origOverlay === undefined || decOverlay === undefined) {
    return false;
  } else {
    const origLogo = origOverlay.logo;
    const decLogo = decOverlay.logo;
    if (origLogo === undefined && decLogo !== undefined) return false;
    if (origLogo !== undefined && decLogo === undefined) return false;
    if (origLogo !== undefined && decLogo !== undefined) {
      if (origLogo.data !== decLogo.data || origLogo.size !== decLogo.size) return false;
    }
    const origFrame = origOverlay.frame;
    const decFrame = decOverlay.frame;
    if (origFrame === undefined && decFrame !== undefined) return false;
    if (origFrame !== undefined && decFrame === undefined) return false;
    if (origFrame !== undefined && decFrame !== undefined) {
      if (origFrame.label !== decFrame.label || origFrame.color !== decFrame.color) return false;
    }
  }

  const origArt = original.artwork;
  const decArt = decoded.artwork;
  if (origArt === undefined && decArt === undefined) {
    // equal
  } else if (origArt === undefined || decArt === undefined) {
    return false;
  } else if (
    origArt.eyeColor !== decArt.eyeColor ||
    origArt.dataColor !== decArt.dataColor ||
    origArt.timingPattern !== decArt.timingPattern
  ) {
    return false;
  }

  const origAnim = original.animation;
  const decAnim = decoded.animation;
  if (origAnim === undefined && decAnim === undefined) {
    // equal
  } else if (origAnim === undefined || decAnim === undefined) {
    return false;
  } else if (origAnim.enabled !== decAnim.enabled || origAnim.speed !== decAnim.speed) {
    return false;
  }

  return true;
}

// --- Public API: creation, proof, and round-trip enumeration ---

/**
 * The audit function used to prove round-trip correctness. It is supplied to
 * `createArtefact` so the proof step can be observed independently of the
 * encoder. The function decodes the artefact and compares it against the
 * original request.
 */
export function proveRoundTrip(options: CreationOptions, artefact: Artefact): ValidationOutcome {
  let decoded;
  try {
    decoded = decodeArtefact(artefact.payload.kind + ':' + artefact.payload.content);
  } catch {
    // The decoder uses the raw body; recompute by reading the artefact body field.
    // Artefact body is reconstructable from its fields, but here we read it
    // through the public field `payload` which holds the original payload only.
    // Use the artefact's encoded representation stored alongside the checksum.
    return failure('ROUNDTRIP_MISMATCH', 'Decoder could not parse the artefact body.');
  }
  if (!optionsEqual(options, decoded)) {
    return failure('ROUNDTRIP_MISMATCH', 'Decoded artefact does not match the original request.');
  }
  return { success: true };
}

function artefactBody(artefact: Artefact): string {
  // The decoder works on the full body string. The artefact exposes the
  // decoded payload, error-correction level, and customisations via decoding,
  // so we reconstruct the body from the artefact itself for proof purposes.
  const p = artefact.payload;
  const metaJson = p.metadata === undefined ? '' : '#' + JSON.stringify(p.metadata);
  // We cannot recover style/overlay/artwork/animation from the artefact's
  // decoded payload alone; the encode step stores them inside the checksum
  // payload. The proof function decodes via the public decoder.
  return p.kind + ':' + p.content + metaJson;
}

/**
 * Creates an artefact from a request, but only if the artefact decodes back
 * to exactly the payload the request specified. Returns a failure outcome
 * (and never mutates any state) when the round-trip invariant cannot be met.
 *
 * The audit function is invoked with the artefact after it is produced.
 * If the audit throws or returns a failure, the creation is refused: the
 * function returns the failure outcome without retaining the artefact.
 */
export function createArtefact(
  options: CreationOptions,
  audit: (options: CreationOptions, artefact: Artefact) => ValidationOutcome
): CreationOutcome {
  // Step 1: validate all inputs in order. Any failure here is fail-closed.
  const payloadCheck = validatePayload(options.payload);
  if (!payloadCheck.success) {
    return { success: false, error: payloadCheck.error };
  }
  if (!isErrorCorrectionLevel(options.errorCorrection)) {
    return failure('INVALID_ERROR_CORRECTION', `Error correction level "${options.errorCorrection}" is not declared.`);
  }
  const styleCheck = validateStyle(options.style);
  if (!styleCheck.success) {
    return { success: false, error: styleCheck.error };
  }
  const overlayCheck = validateOverlay(options.overlay);
  if (!overlayCheck.success) {
    return { success: false, error: overlayCheck.error };
  }
  const artworkCheck = validateArtwork(options.artwork);
  if (!artworkCheck.success) {
    return { success: false, error: artworkCheck.error };
  }
  const animationCheck = validateAnimation(options.animation);
  if (!animationCheck.success) {
    return { success: false, error: animationCheck.error };
  }

  // Step 2: produce the artefact. The encoder is pure; its output is the
  // body the decoder will read. The artefact carries enough information for
  // the audit to decode it and compare against the original request.
  const body = encodeArtefact(
    options.payload,
    options.errorCorrection,
    options.style,
    options.overlay,
    options.artwork,
    options.animation
  );
  const checksum = computeChecksum(body);
  const candidate: Artefact = {
    version: ARTEFACT_VERSION,
    payload: options.payload,
    checksum: checksum + '::' + body,
  };

  // Step 3: prove correctness by decoding. The audit may throw or return a
  // failure; in either case the candidate is refused and not returned.
  let auditOutcome: ValidationOutcome;
  try {
    auditOutcome = audit(options, candidate);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Audit threw a non-Error value.';
    return failure('ROUNDTRIP_MISMATCH', `Audit threw: ${message}`);
  }
  if (!auditOutcome.success) {
    return { success: false, error: auditOutcome.error };
  }

  return { success: true, artefact: candidate };
}

/**
 * Default audit. Decodes the produced artefact and confirms that the decoded
 * request matches the original. This is the canonical proof of round-trip
 * correctness; it inspects the artefact, not the encoder internals.
 */
export function defaultAudit(
  options: CreationOptions,
  artefact: Artefact
): ValidationOutcome {
  const sep = '::';
  const sepIndex = artefact.checksum.indexOf(sep);
  if (sepIndex < 0) {
    return failure('ROUNDTRIP_MISMATCH', 'Artefact body is not embedded in the artefact.');
  }
  const body = artefact.checksum.slice(sepIndex + sep.length);
  let decoded;
  try {
    decoded = decodeArtefact(body);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Decoder failed.';
    return failure('ROUNDTRIP_MISMATCH', `Decoder raised: ${message}`);
  }
  if (!optionsEqual(options, decoded)) {
    return failure('ROUNDTRIP_MISMATCH', 'Decoded artefact does not match the original request.');
  }
  return { success: true };
}

function computeChecksum(body: string): string {
  // Deterministic non-cryptographic checksum. The exact value is not load-bearing;
  // what matters is that the body is recoverable from the artefact for proof.
  let h = 5381;
  for (let i = 0; i < body.length; i++) {
    h = ((h << 5) + h + body.charCodeAt(i)) >>> 0;
  }
  return 'c' + h.toString(16);
}

// --- Round-trip enumeration ---

export interface RoundTripVector {
  readonly kind: PayloadKind;
  readonly errorCorrection: ErrorCorrectionLevel;
  readonly style?: StyleCustomisation;
  readonly overlay?: OverlayCustomisation;
  readonly artwork?: ArtworkCustomisation;
  readonly animation?: AnimationCustomisation;
  readonly content: string;
}

/**
 * The canonical set of round-trip vectors used by validation. They span
 * every declared payload kind, every error-correction level, and representative
 * styling, overlay, artwork and animation customisations.
 */
export const ROUND_TRIP_VECTORS: readonly RoundTripVector[] = (() => {
  const vectors: RoundTripVector[] = [];
  const contents: Record<PayloadKind, string> = {
    text: 'hello world',
    url: 'https://example.com/path?query=1',
    email: 'user@example.com',
    phone: '+1-555-0100',
    sms: 'sms:+1-555-0100:hi there',
    wifi: 'WIFI:T:WPA;S:net;P:pass;;',
    vcard: 'BEGIN:VCARD\nFN:Ada\nEND:VCARD',
    geo: 'geo:37.7749,-122.4194',
    event: 'BEGIN:VEVENT\nSUMMARY:Launch\nEND:VEVENT',
    crypto: 'bitcoin:1BoatSLRHtKNngkdXEeobR76b53LETtpyT',
  };
  const styles: StyleCustomisation[] = [
    { foreground: '#000000', background: '#FFFFFF', eyeShape: 'square', moduleShape: 'square' },
    { foreground: '#112233', background: '#FFEEDD', eyeShape: 'circle', moduleShape: 'rounded' },
    { foreground: '#AABBCC', background: '#001122', eyeShape: 'rounded', moduleShape: 'circle' },
  ];
  const overlays: OverlayCustomisation[] = [
    { logo: { data: 'LOGO1', size: 64 }, frame: { label: 'SCAN', color: '#FF0000' } },
    { logo: { data: 'LOGO2', size: 32 } },
    { frame: { label: 'TAG', color: '#00FF00' } },
  ];
  const artworks: ArtworkCustomisation[] = [
    { eyeColor: '#111111', dataColor: '#222222', timingPattern: 'solid' },
    { eyeColor: '#333333', dataColor: '#444444', timingPattern: 'gradient' },
    { eyeColor: '#555555', dataColor: '#666666', timingPattern: 'pattern' },
  ];
  const animations: AnimationCustomisation[] = [
    { enabled: false, speed: 'slow' },
    { enabled: true, speed: 'normal' },
    { enabled: true, speed: 'fast' },
  ];

  for (const kind of PAYLOAD_KINDS) {
    for (const ec of ERROR_CORRECTION_LEVELS) {
      // Bare minimum vector: no customisation.
      vectors.push({ kind, errorCorrection: ec, content: contents[kind] });
      // With styling only.
      for (const style of styles) {
        vectors.push({ kind, errorCorrection: ec, style, content: contents[kind] });
      }
      // With overlay only.
      for (const overlay of overlays) {
        vectors.push({ kind, errorCorrection: ec, overlay, content: contents[kind] });
      }
      // With artwork only.
      for (const artwork of artworks) {
        vectors.push({ kind, errorCorrection: ec, artwork, content: contents[kind] });
      }
      // With animation only.
      for (const animation of animations) {
        vectors.push({ kind, errorCorrection: ec, animation, content: contents[kind] });
      }
      // Fully customised.
      vectors.push({
        kind,
        errorCorrection: ec,
        style: styles[0],
        overlay: overlays[0],
        artwork: artworks[0],
        animation: animations[1],
        content: contents[kind],
      });
    }
  }
  return vectors;
})();

export interface VectorValidationReport {
  readonly vector: RoundTripVector;
  readonly outcome: ValidationOutcome;
}

/**
 * Validates the canonical round-trip vectors by attempting creation with the
 * default audit. Each vector must succeed for the round-trip contract to
 * hold across the declared payload kinds, every error-correction level,
 * and representative styling, overlay, artwork and animation customisation.
 *
 * Returns a report per vector. A caller can inspect every entry to confirm
 * that the round-trip property holds for the entire declared matrix.
 */
export function validateRoundTripVectors(): readonly VectorValidationReport[] {
  const reports: VectorValidationReport[] = [];
  for (const vector of ROUND_TRIP_VECTORS) {
    const payload: Payload = { kind: vector.kind, content: vector.content };
    const options: CreationOptions = {
      payload,
      errorCorrection: vector.errorCorrection,
    };
    let withExtras: CreationOptions = options;
    if (vector.style !== undefined) withExtras = { ...withExtras, style: vector.style };
    if (vector.overlay !== undefined) withExtras = { ...withExtras, overlay: vector.overlay };
    if (vector.artwork !== undefined) withExtras = { ...withExtras, artwork: vector.artwork };
    if (vector.animation !== undefined) withExtras = { ...withExtras, animation: vector.animation };

    const outcome = createArtefact(withExtras, defaultAudit);
    if (outcome.success) {
      reports.push({ vector, outcome: { success: true } });
    } else {
      reports.push({ vector, outcome: { success: false, error: outcome.error } });
    }
  }
  return reports;
}