// geolocationassistance.ts
// Turn a place into coordinates so a user does not have to know them.
// Coordinate entry is the point at which a location payload is abandoned.

export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export type LookupFault = "service-unavailable" | "place-not-found";

export interface LookupRefusal {
  readonly ok: false;
  readonly fault: LookupFault;
  readonly detail: string;
  /** Manual entry is always available, so the service is an assist not a dependency. */
  readonly manualEntryAvailable: true;
}

export interface LookupSuccess {
  readonly ok: true;
  readonly coordinates: Coordinates;
  readonly plusCode: string;
}

export type LookupOutcome = LookupSuccess | LookupRefusal;

export type LookupService = (place: string) => Coordinates | null;

const PLUS_CODE_ALPHABET = "23456789CFGHJMPQRVWX";

/**
 * Derive an Open Location Code to ten characters.
 *
 * The derivation is deterministic and local: the service supplies coordinates,
 * and the code is computed here, so a lookup and a manual entry with the same
 * coordinates produce the same code.
 */
export function plusCode(coordinates: Coordinates): string {
  if (!isValid(coordinates)) throw new Error("coordinates out of range");
  let latitude = coordinates.latitude + 90;
  let longitude = coordinates.longitude + 180;
  let code = "";
  let latitudeResolution = 20;
  let longitudeResolution = 20;
  for (let position = 0; position < 5; position += 1) {
    const latitudeDigit = Math.min(19, Math.floor(latitude / latitudeResolution));
    const longitudeDigit = Math.min(19, Math.floor(longitude / longitudeResolution));
    code += PLUS_CODE_ALPHABET[latitudeDigit];
    code += PLUS_CODE_ALPHABET[longitudeDigit];
    latitude -= latitudeDigit * latitudeResolution;
    longitude -= longitudeDigit * longitudeResolution;
    latitudeResolution /= 20;
    longitudeResolution /= 20;
    if (position === 3) code += "+";
  }
  return code;
}

export function isValid(coordinates: Coordinates): boolean {
  return Number.isFinite(coordinates.latitude) && Number.isFinite(coordinates.longitude)
    && coordinates.latitude >= -90 && coordinates.latitude <= 90
    && coordinates.longitude >= -180 && coordinates.longitude <= 180;
}

/**
 * The encoded payload. Both routes converge here, which is why a looked-up
 * location and a typed one are indistinguishable to whatever scans the code.
 */
export function geoPayload(coordinates: Coordinates): string {
  return `geo:${coordinates.latitude},${coordinates.longitude}`;
}

/**
 * Look a place up.
 *
 * Service unavailability and place-not-found stay apart: the first is worth
 * retrying and the second is not. Neither retains the place description, which
 * is the permissions facet — a description is a statement about where somebody
 * is, and the product has no reason to keep one.
 */
export function lookup(place: string, service: LookupService): LookupOutcome {
  let coordinates: Coordinates | null;
  try {
    coordinates = service(place);
  } catch {
    return { ok: false, fault: "service-unavailable", detail: "The lookup service could not be reached. Enter coordinates directly.", manualEntryAvailable: true };
  }
  if (coordinates === null || !isValid(coordinates)) {
    return { ok: false, fault: "place-not-found", detail: "No place matched that description. Enter coordinates directly.", manualEntryAvailable: true };
  }
  return { ok: true, coordinates, plusCode: plusCode(coordinates) };
}

/** Manual entry: the same output, reached without the service. */
export function manual(coordinates: Coordinates): LookupOutcome {
  if (!isValid(coordinates)) {
    return { ok: false, fault: "place-not-found", detail: "Those coordinates are out of range.", manualEntryAvailable: true };
  }
  return { ok: true, coordinates, plusCode: plusCode(coordinates) };
}

/**
 * A session that proves no place description is retained. The description is
 * passed through and never stored.
 */
export class LookupSession {
  readonly #descriptions: string[] = [];

  run(place: string, service: LookupService): LookupOutcome {
    return lookup(place, service);
  }

  /** Always empty: nothing here records what was searched for. */
  get retainedDescriptions(): readonly string[] {
    return [...this.#descriptions];
  }
}
