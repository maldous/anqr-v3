// artefactmetadataembedding.ts
// Carry authorship, licence and provenance inside the artefact file rather than
// beside it. Attribution that travels with the file is the difference between a
// shared asset and an orphaned one.

export type FieldName =
  | "title" | "description" | "author" | "copyright" | "licence"
  | "creationTime" | "custom" | "pixelsPerMetre";

export type FieldType = "text" | "instant" | "pairs" | "integer";

export interface FieldSpec {
  readonly name: FieldName;
  readonly type: FieldType;
  /** Containers whose own format can carry this field. */
  readonly carriedBy: readonly ContainerName[];
}

export type ContainerName = "png" | "svg" | "gif";

/**
 * What each container can actually carry.
 *
 * PNG has typed text and physical-dimension chunks; SVG has a metadata element
 * and no notion of physical resolution; GIF has only a plain comment extension,
 * so structured pairs and a resolution have nowhere to go. These are format
 * facts, not policy, and refusing is the honest response to them.
 */
export const FIELDS: readonly FieldSpec[] = [
  { name: "title", type: "text", carriedBy: ["png", "svg", "gif"] },
  { name: "description", type: "text", carriedBy: ["png", "svg", "gif"] },
  { name: "author", type: "text", carriedBy: ["png", "svg", "gif"] },
  { name: "copyright", type: "text", carriedBy: ["png", "svg", "gif"] },
  { name: "licence", type: "text", carriedBy: ["png", "svg"] },
  { name: "creationTime", type: "instant", carriedBy: ["png", "svg"] },
  { name: "custom", type: "pairs", carriedBy: ["png", "svg"] },
  { name: "pixelsPerMetre", type: "integer", carriedBy: ["png"] },
];

export const CONTAINERS: readonly ContainerName[] = ["png", "svg", "gif"];

export interface Metadata {
  readonly title?: string;
  readonly description?: string;
  readonly author?: string;
  readonly copyright?: string;
  readonly licence?: string;
  readonly creationTime?: number;
  readonly custom?: Readonly<Record<string, string>>;
  readonly pixelsPerMetre?: number;
}

export function specFor(name: FieldName): FieldSpec {
  const spec = FIELDS.find((field) => field.name === name);
  if (spec === undefined) throw new Error(`No declared metadata field ${name}`);
  return spec;
}

export function canCarry(container: ContainerName, name: FieldName): boolean {
  return specFor(name).carriedBy.includes(container);
}

/** Which declared fields the chosen container will keep, for the UI to state. */
export function keptBy(container: ContainerName): readonly FieldName[] {
  return FIELDS.filter((field) => field.carriedBy.includes(container)).map((field) => field.name);
}

export function droppedBy(container: ContainerName): readonly FieldName[] {
  return FIELDS.filter((field) => !field.carriedBy.includes(container)).map((field) => field.name);
}

export interface EmbedRefusal {
  readonly ok: false;
  readonly field: FieldName;
  readonly container: ContainerName;
  readonly detail: string;
}

export interface EmbedSuccess {
  readonly ok: true;
  /** The container's own metadata records, as name and encoded value. */
  readonly records: readonly (readonly [string, string])[];
}

export type EmbedOutcome = EmbedSuccess | EmbedRefusal;

function present(metadata: Metadata): readonly FieldName[] {
  return FIELDS.map((field) => field.name).filter((name) => (metadata as Record<string, unknown>)[name] !== undefined);
}

function encode(name: FieldName, value: unknown): string {
  switch (specFor(name).type) {
    case "instant": return new Date(Number(value)).toISOString();
    case "integer": return String(Math.trunc(Number(value)));
    case "pairs": return Object.entries(value as Record<string, string>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${key}=${entry}`).join(";");
    default: return String(value);
  }
}

/**
 * Write metadata into a container's own records.
 *
 * A container that cannot carry a declared field refuses, naming both the field
 * and the container. Silently discarding it would be the worse failure: the
 * user would believe attribution travelled when it did not.
 */
export function embed(container: ContainerName, metadata: Metadata): EmbedOutcome {
  for (const name of present(metadata)) {
    if (!canCarry(container, name)) {
      return {
        ok: false,
        field: name,
        container,
        detail: `The ${container} container cannot carry ${name}; it would be silently discarded.`,
      };
    }
  }
  const records = present(metadata).map((name) =>
    [name, encode(name, (metadata as Record<string, unknown>)[name])] as const);
  return { ok: true, records };
}

/** Read records back, so an embed can be verified rather than assumed. */
export function extract(records: readonly (readonly [string, string])[]): Readonly<Record<string, string>> {
  return Object.fromEntries(records.map(([name, value]) => [name, value]));
}

/**
 * Round-trip verification: every declared value must be recoverable from the
 * produced records by a reader that knows only the format.
 */
export function verifyRoundTrip(container: ContainerName, metadata: Metadata): boolean {
  const outcome = embed(container, metadata);
  if (!outcome.ok) return false;
  const read = extract(outcome.records);
  return present(metadata).every((name) => read[name] === encode(name, (metadata as Record<string, unknown>)[name]));
}

/**
 * The disclosure posture: metadata entry is a disclosed section rather than a
 * default-visible one, because it is optional detail on a surface whose primary
 * outcome is an artefact.
 */
export const UI_SECTION = {
  role: "disclosure",
  defaultExpanded: false,
  statesKeptFields: true,
} as const;
