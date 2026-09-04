// controlsurfacesearch.ts
// Let a user find one control among hundreds by name. A capability nobody can
// find is a capability nobody buys.

export interface Control {
  readonly id: string;
  readonly label: string;
  readonly panel: string;
  /** Alternative words a user might reach for. */
  readonly synonyms: readonly string[];
}

/** What is searchable: a control's own label, its panel and its synonyms. */
export const SEARCHABLE_FIELDS: readonly string[] = ["label", "panel", "synonyms"];

export interface Match {
  readonly control: Control;
  /** The panel context is kept, so a revealed control is not orphaned. */
  readonly panel: string;
  /** Index ranges in the label that matched, for highlighting. */
  readonly highlights: readonly (readonly [number, number])[];
  /** Revealed in place rather than moved into a results list. */
  readonly revealedInPlace: true;
  /** The highlight is announced rather than being colour alone. */
  readonly announcement: string;
}

export interface NoMatch {
  readonly matched: false;
  readonly term: string;
  /** Stated, not silent. */
  readonly detail: string;
  /** The surface is left intact rather than emptied. */
  readonly surfaceIntact: true;
}

export type SearchOutcome = { readonly matched: true; readonly matches: readonly Match[] } | NoMatch;

function highlightsIn(label: string, term: string): readonly (readonly [number, number])[] {
  const haystack = label.toLowerCase();
  const needle = term.toLowerCase();
  if (needle === "") return [];
  const ranges: (readonly [number, number])[] = [];
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    ranges.push([index, index + needle.length] as const);
    index = haystack.indexOf(needle, index + needle.length);
  }
  return ranges;
}

function matchesTerm(control: Control, term: string): boolean {
  const needle = term.toLowerCase();
  return control.label.toLowerCase().includes(needle)
    || control.panel.toLowerCase().includes(needle)
    || control.synonyms.some((synonym) => synonym.toLowerCase().includes(needle));
}

/**
 * Search the control surface.
 *
 * Results are revealed in place: each match carries its panel, so the user does
 * not lose the context that tells them what the control belongs to. A term with
 * no match states the absence rather than emptying the surface, because an
 * empty surface looks like a broken application.
 */
export function search(controls: readonly Control[], term: string): SearchOutcome {
  const trimmed = term.trim();
  if (trimmed === "") return { matched: true, matches: [] };
  const matches = controls.filter((control) => matchesTerm(control, trimmed)).map((control) => ({
    control,
    panel: control.panel,
    highlights: highlightsIn(control.label, trimmed),
    revealedInPlace: true as const,
    announcement: `${control.label}, in ${control.panel}`,
  }));
  if (matches.length === 0) {
    return { matched: false, term: trimmed, detail: `No control matches "${trimmed}".`, surfaceIntact: true };
  }
  return { matched: true, matches };
}

/** Every declared control must be findable by its own label. */
export function everyControlFindable(controls: readonly Control[]): readonly string[] {
  return controls.filter((control) => {
    const outcome = search(controls, control.label);
    return !outcome.matched || !outcome.matches.some((match) => match.control.id === control.id);
  }).map((control) => control.id);
}
