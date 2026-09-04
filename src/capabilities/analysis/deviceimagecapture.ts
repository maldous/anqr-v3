// deviceimagecapture.ts
// Use what the camera sees, for artwork or for analysis, with each refusal
// cause distinguishable. The camera is the difference between analysing a code
// and typing a URL about one.

/** The longest edge a captured frame is reduced to before use. */
export const DOWNSCALE_MAX_EDGE = 1_280;

/**
 * The three refusal causes. They are kept apart because the user's next action
 * differs for each: grant permission, use another device, or reach the site
 * over a secure origin.
 */
export type RefusalCause = "permission-denied" | "no-device" | "insecure-context";

export const REFUSAL_CAUSES: readonly RefusalCause[] = ["permission-denied", "no-device", "insecure-context"];

export const REFUSAL_DETAIL: Readonly<Record<RefusalCause, string>> = {
  "permission-denied": "Camera access was refused. The file and link routes remain available.",
  "no-device": "No camera is present on this device. The file and link routes remain available.",
  "insecure-context": "A camera needs a secure origin. The file and link routes remain available.",
};

export interface Environment {
  readonly secureContext: boolean;
  readonly cameraPresent: boolean;
  readonly permissionGranted: boolean;
}

export interface Frame {
  readonly width: number;
  readonly height: number;
  /** Opaque pixel identity, sufficient to prove a frame was or was not kept. */
  readonly content: string;
}

export interface CaptureRefusal {
  readonly ok: false;
  readonly cause: RefusalCause;
  readonly detail: string;
  /** The other input routes, unaffected by any camera refusal. */
  readonly alternativeRoutes: readonly string[];
}

export interface CaptureSuccess {
  readonly ok: true;
  readonly frame: Frame;
  readonly downscaled: boolean;
  /** A captured frame never leaves the device. */
  readonly transmitted: false;
}

export type CaptureOutcome = CaptureSuccess | CaptureRefusal;

export const ALTERNATIVE_ROUTES: readonly string[] = ["file-upload", "remote-url"];

function refuse(cause: RefusalCause): CaptureRefusal {
  return { ok: false, cause, detail: REFUSAL_DETAIL[cause], alternativeRoutes: ALTERNATIVE_ROUTES };
}

/** Reduce the longest edge, preserving aspect ratio. */
export function downscale(frame: Frame): Frame {
  const longest = Math.max(frame.width, frame.height);
  if (longest <= DOWNSCALE_MAX_EDGE) return frame;
  const factor = DOWNSCALE_MAX_EDGE / longest;
  return {
    width: Math.max(1, Math.round(frame.width * factor)),
    height: Math.max(1, Math.round(frame.height * factor)),
    content: frame.content,
  };
}

/**
 * Capture a frame.
 *
 * The order of checks is the order the user can act on: an insecure context
 * cannot be fixed by granting permission, and a missing device cannot be fixed
 * by either.
 */
export function capture(environment: Environment, source: () => Frame): CaptureOutcome {
  if (!environment.secureContext) return refuse("insecure-context");
  if (!environment.cameraPresent) return refuse("no-device");
  if (!environment.permissionGranted) return refuse("permission-denied");
  const raw = source();
  const frame = downscale(raw);
  return { ok: true, frame, downscaled: frame.width !== raw.width || frame.height !== raw.height, transmitted: false };
}

/**
 * A session that holds no frame after use, so "not retained" is observable
 * rather than asserted.
 */
export class CaptureSession {
  #held: Frame | null = null;

  use<T>(outcome: CaptureOutcome, consume: (frame: Frame) => T): T | null {
    if (!outcome.ok) return null;
    this.#held = outcome.frame;
    try {
      return consume(outcome.frame);
    } finally {
      this.#held = null;
    }
  }

  get retained(): Frame | null {
    return this.#held;
  }
}
