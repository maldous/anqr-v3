import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";

// ANQR architecture enforcement.
//
// Every rule this checker evaluates is read from rules.json, which is generated
// from the USF semantic graph. Nothing architectural is hard-coded here: this
// file knows how to check, not what is true. A drift check proves the generated
// rules still equal the graph.
//
// Design notes that exist because of specific failure classes:
//
//   Enumeration is recursive and covers the whole repository, not just the
//   declared component locations. A check that only looked inside declared
//   components could never see a violation placed anywhere else, which makes
//   the prohibited state unreachable by construction.
//
//   Every source file is assigned to a component by longest-prefix match, and
//   files matching no component are reported rather than skipped. Silence about
//   unassigned files is how a hiding place forms.
//
//   Discovery reads the tree as it is at invocation. A file created since the
//   last run is found, because the walk has no notion of a previously known
//   set. The planted-violation tests assert exactly this by adding new files.

export interface Rules {
  readonly authority: Readonly<Record<string, string>>;
  readonly layers: readonly { readonly name: string; readonly ordinal: number; readonly iri: string }[];
  readonly components: readonly {
    readonly name: string; readonly layer: string; readonly location: string;
    readonly status: string; readonly iri: string;
  }[];
  readonly ports: readonly {
    readonly name: string; readonly direction: string; readonly contractLocation: string;
    readonly servedBy: readonly string[]; readonly iri: string;
  }[];
  readonly adapters: readonly {
    readonly name: string; readonly layer: string;
    readonly implementsPort: readonly string[]; readonly iri: string;
  }[];
  readonly dependencyRules: readonly {
    readonly kind: string; readonly from: string; readonly to: string;
    readonly reason: string; readonly iri: string;
  }[];
  readonly isolation: readonly {
    readonly layers: readonly string[]; readonly technologies: readonly string[];
    readonly reason: string; readonly iri: string;
  }[];
  readonly cyclePolicy: readonly { readonly scope: string; readonly permitted: boolean; readonly iri: string }[];
  readonly moduleBoundaries: readonly {
    readonly name: string; readonly scope: readonly string[];
    readonly forbids: readonly string[]; readonly reason: string; readonly iri: string;
  }[];
  readonly facets: readonly {
    readonly name: string; readonly iri: string; readonly statement: string;
    readonly expected: string; readonly verificationClass: string;
    readonly severity: string; readonly stage: string; readonly scope: string;
  }[];
}

export interface Finding {
  readonly facet: string;
  readonly facetIri: string;
  readonly code: string;
  readonly file: string;
  readonly detail: string;
  readonly ruleIri?: string;
}

export type FacetVerdict = "satisfied" | "violated" | "not-checkable";

export interface FacetResult {
  readonly facet: string;
  readonly facetIri: string;
  readonly verificationClass: string;
  readonly severity: string;
  readonly verdict: FacetVerdict;
  readonly mechanism: string;
  readonly subjectCount: number;
  readonly findings: readonly Finding[];
  readonly notCheckableReason?: string;
}

export interface CheckReport {
  readonly schema: "urn:anqr:architecture-check:1";
  readonly authority: Readonly<Record<string, string>>;
  readonly rulesDigest: string;
  readonly sourceFileCount: number;
  readonly assignedFileCount: number;
  readonly unassignedFiles: readonly string[];
  /** Sources outside the component model that a declared boundary accounts for. */
  readonly declaredExcludedFiles: readonly string[];
  /** Sources neither assigned nor excluded. Must be empty: an unaccounted
   *  source is a hiding place, and this is the number that must never grow. */
  readonly unaccountedFiles: readonly string[];
  readonly facets: readonly FacetResult[];
  readonly blockingViolationCount: number;
  readonly conforming: boolean;
}

const SOURCE_EXTENSION = ".ts";
const SKIP_DIRECTORIES = new Set(["node_modules", ".git", "dist", "coverage", ".usf"]);

/** Recursive enumeration of every source file, so nothing is out of view. */
export function enumerateSources(root: string): readonly string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    let entries;
    try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        walk(join(directory, entry.name));
      } else if (entry.name.endsWith(SOURCE_EXTENSION)) {
        found.push(relative(root, join(directory, entry.name)).split(sep).join("/"));
      }
    }
  };
  walk(root);
  return found.sort();
}

/**
 * Relative and bare import specifiers, static and dynamic.
 *
 * Known limitation, recorded rather than hidden: this is a regular-expression
 * scanner, so it cannot distinguish an import expression from a string that
 * contains one. A source that quotes import syntax is read as importing it.
 * The consequence is over-reporting, never under-reporting, so it can produce a
 * false finding but cannot conceal a real dependency — which is the safe
 * direction for a boundary check. Replacing it with a real parse over the
 * TypeScript AST would remove the false-positive class.
 */
export function importsOf(source: string): readonly string[] {
  const specifiers: string[] = [];
  const patterns = [
    /(?:^|\n)\s*import\s+[^;'"]*from\s*["']([^"']+)["']/g,
    /(?:^|\n)\s*import\s*["']([^"']+)["']/g,
    /(?:^|\n)\s*export\s+[^;'"]*from\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1] as string);
  }
  return [...new Set(specifiers)];
}

/**
 * A port's interface name, derived from its canonical name: kebab-case to
 * PascalCase plus the Port suffix. Every declared port file follows this, and a
 * port whose interface is named otherwise fails the annotation check, which is
 * the intended signal rather than a silent pass.
 */
export function portInterfaceName(portName: string): string {
  return `${portName.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("")}Port`;
}

/** The single source path an adapter must occupy, derived from its layer's component. */
export function adapterSourcePath(
  adapter: Rules["adapters"][number],
  rules: Rules,
): string | null {
  const component = rules.components.find((entry) => entry.layer === adapter.layer);
  return component === undefined ? null : `${component.location}${adapter.name}.ts`;
}

function componentOf(file: string, rules: Rules): Rules["components"][number] | undefined {
  let best: Rules["components"][number] | undefined;
  for (const component of rules.components) {
    if (!file.startsWith(component.location)) continue;
    if (best === undefined || component.location.length > best.location.length) best = component;
  }
  return best;
}

function resolveRelative(file: string, specifier: string, root: string): string | null {
  const target = normalize(join(dirname(file), specifier)).split(sep).join("/");
  return existsSync(resolve(root, target)) ? target : null;
}

const facetByName = (rules: Rules, name: string): Rules["facets"][number] => {
  const facet = rules.facets.find((entry) => entry.name === `architecture${name}`);
  if (facet === undefined) throw new Error(`ARCHITECTURE_FACET_UNKNOWN:${name}`);
  return facet;
};

/** Evaluate every architecture facet the rules declare against the source tree. */
export function checkArchitecture(root: string, rules: Rules): CheckReport {
  const files = enumerateSources(root);
  const assignment = new Map<string, Rules["components"][number] | undefined>();
  const importsByFile = new Map<string, readonly string[]>();
  for (const file of files) {
    assignment.set(file, componentOf(file, rules));
    importsByFile.set(file, importsOf(readFileSync(resolve(root, file), "utf8")));
  }
  const unassigned = files.filter((file) => assignment.get(file) === undefined);
  // Declared exclusions come from the graph's module boundaries, so the set of
  // sources allowed to sit outside the component model is authority rather
  // than a hard-coded allowance in this file.
  const excludedPrefixes = rules.moduleBoundaries.flatMap((boundary) =>
    boundary.scope.flatMap((text) => text.match(/[A-Za-z0-9_./-]+\//g) ?? []));
  const declaredExcluded = unassigned.filter((file) => excludedPrefixes.some((prefix) => file.startsWith(prefix)));
  const unaccounted = unassigned.filter((file) => !excludedPrefixes.some((prefix) => file.startsWith(prefix)));
  const layerOf = new Map(rules.components.map((component) => [component.name, component.layer]));
  void layerOf;

  const results: FacetResult[] = [];
  const add = (
    name: string, mechanism: string, subjectCount: number, findings: readonly Finding[], notCheckableReason?: string,
  ): void => {
    const facet = facetByName(rules, name);
    results.push({
      facet: facet.name, facetIri: facet.iri, verificationClass: facet.verificationClass,
      severity: facet.severity,
      verdict: notCheckableReason !== undefined ? "not-checkable" : findings.length > 0 ? "violated" : "satisfied",
      mechanism, subjectCount, findings,
      ...(notCheckableReason === undefined ? {} : { notCheckableReason }),
    });
  };
  const finding = (name: string, code: string, file: string, detail: string, ruleIri?: string): Finding => {
    const facet = facetByName(rules, name);
    return { facet: facet.name, facetIri: facet.iri, code, file, detail, ...(ruleIri === undefined ? {} : { ruleIri }) };
  };

  // ---------------------------------------------------- dependency direction
  const forbidden = rules.dependencyRules.filter((rule) => rule.kind === "forbids");
  const required = rules.dependencyRules.filter((rule) => rule.kind === "requires");
  const directionFindings: Finding[] = [];
  let directionSubjects = 0;
  for (const file of files) {
    const from = assignment.get(file);
    if (from === undefined) continue;
    for (const specifier of importsByFile.get(file) ?? []) {
      if (!specifier.startsWith(".")) continue;
      const target = resolveRelative(file, specifier, root);
      if (target === null) continue;
      const to = assignment.get(target) ?? componentOf(target, rules);
      if (to === undefined || to.layer === from.layer) continue;
      directionSubjects += 1;
      const rule = forbidden.find((entry) => entry.from === from.layer && entry.to === to.layer);
      if (rule !== undefined) {
        directionFindings.push(finding("dependencydirection", "FORBIDDEN_LAYER_DEPENDENCY", file,
          `${from.name} (${from.layer}) imports ${to.name} (${to.layer}), which the architecture forbids: ${rule.reason}`, rule.iri));
      }
    }
  }
  // A required edge whose subject exists but whose object is absent is also a
  // violation; an adapter implementing no declared port has no reason to exist.
  for (const rule of required) {
    const fromComponents = rules.components.filter((component) => component.layer === rule.from);
    for (const component of fromComponents) {
      if (!files.some((file) => file.startsWith(component.location))) continue;
      directionSubjects += 1;
      const satisfies = files.filter((file) => file.startsWith(component.location))
        .some((file) => (importsByFile.get(file) ?? []).some((specifier) => {
          if (!specifier.startsWith(".")) return false;
          const target = resolveRelative(file, specifier, root);
          return target !== null && (componentOf(target, rules)?.layer === rule.to);
        }));
      if (!satisfies) {
        directionFindings.push(finding("dependencydirection", "REQUIRED_LAYER_DEPENDENCY_ABSENT", component.location,
          `${component.name} (${rule.from}) must depend on the ${rule.to} layer and does not: ${rule.reason}`, rule.iri));
      }
    }
  }
  add("dependencydirection", "architecture checker: layer edge evaluation over recursive source enumeration", directionSubjects, directionFindings);

  // -------------------------------------------------------------- no cycles
  const cycleFindings: Finding[] = [];
  const policy = rules.cyclePolicy[0];
  if (policy !== undefined && !policy.permitted) {
    const edges = new Map<string, readonly string[]>();
    for (const file of files) {
      edges.set(file, (importsByFile.get(file) ?? [])
        .filter((specifier) => specifier.startsWith("."))
        .map((specifier) => resolveRelative(file, specifier, root))
        .filter((target): target is string => target !== null));
    }
    // Iterative three-colour depth-first search: recursion would blow the stack
    // on a large tree and, worse, would make the failure look like a defect.
    const colour = new Map<string, 0 | 1 | 2>();
    for (const file of files) colour.set(file, 0);
    for (const start of files) {
      if (colour.get(start) !== 0) continue;
      const stack: { node: string; path: readonly string[] }[] = [{ node: start, path: [start] }];
      colour.set(start, 1);
      const pending: string[] = [start];
      while (pending.length > 0) {
        const node = pending[pending.length - 1] as string;
        const entry = stack.find((item) => item.node === node);
        const path = entry?.path ?? [node];
        const next = (edges.get(node) ?? []).find((target) => colour.get(target) !== 2 && !path.includes(target) && colour.get(target) === 0);
        const backEdge = (edges.get(node) ?? []).find((target) => path.includes(target));
        if (backEdge !== undefined) {
          cycleFindings.push(finding("nodependencycycles", "DEPENDENCY_CYCLE", node,
            `cycle: ${[...path.slice(path.indexOf(backEdge)), backEdge].join(" -> ")}`, policy.iri));
          colour.set(node, 2);
          pending.pop();
          continue;
        }
        if (next !== undefined) {
          colour.set(next, 1);
          stack.push({ node: next, path: [...path, next] });
          pending.push(next);
          continue;
        }
        colour.set(node, 2);
        pending.pop();
      }
    }
  }
  add("nodependencycycles", "architecture checker: iterative three-colour depth-first search over the module graph", files.length, cycleFindings);

  // --------------------------------------------------- framework isolation
  const isolationFindings: Finding[] = [];
  let isolationSubjects = 0;
  for (const rule of rules.isolation) {
    for (const file of files) {
      const component = assignment.get(file);
      if (component === undefined || !rule.layers.includes(component.layer)) continue;
      isolationSubjects += 1;
      for (const specifier of importsByFile.get(file) ?? []) {
        const offending = rule.technologies.find((technology) =>
          specifier === technology || specifier.startsWith(`${technology}/`));
        if (offending !== undefined) {
          isolationFindings.push(finding("frameworkisolation", "FRAMEWORK_IMPORT_IN_ISOLATED_LAYER", file,
            `${component.layer} layer imports "${specifier}", and "${offending}" is isolated from that layer: ${rule.reason}`, rule.iri));
        }
      }
    }
  }
  add("frameworkisolation", "architecture checker: forbidden technology specifiers in isolated layers", isolationSubjects, isolationFindings);

  // ------------------------------------ domain has no runtime dependency
  const domainFindings: Finding[] = [];
  let domainSubjects = 0;
  for (const file of files) {
    const component = assignment.get(file);
    if (component === undefined || component.layer !== "domain") continue;
    domainSubjects += 1;
    for (const specifier of importsByFile.get(file) ?? []) {
      if (specifier.startsWith(".") || specifier.startsWith("node:")) continue;
      domainFindings.push(finding("domainhasnoruntimedependency", "THIRD_PARTY_IMPORT_IN_DOMAIN", file,
        `the domain layer imports "${specifier}"; only the language standard library is admissible so the centre stays reusable on every surface`));
    }
  }
  add("domainhasnoruntimedependency", "architecture checker: non-relative, non-stdlib specifiers beneath domain components", domainSubjects, domainFindings);

  // ------------------------------------------- port/adapter conformance
  //
  // Strengthened after a probe showed the earlier form was worthless: it asked
  // whether ANY file existed beneath the adapters component, so one adapter
  // satisfied all six, deleting an adapter entirely went undetected, and an
  // empty file passed. An existing file is not conformance.
  //
  // Each declared adapter is now resolved to its own derived path, must import
  // every port it claims, and must bind a type-annotated export naming that
  // port's interface. The last of those is what engages the type checker: with
  // the annotation present, tsc decides structural conformance, and an
  // incompatible or empty implementation fails typecheck rather than needing
  // this scanner to understand types it cannot see.
  const portFindings: Finding[] = [];
  const outboundPorts = rules.ports.filter((port) => port.direction === "outbound");
  for (const port of rules.ports) {
    if (!existsSync(resolve(root, port.contractLocation))) {
      portFindings.push(finding("portimplementationconformance", "PORT_CONTRACT_ABSENT", port.contractLocation,
        `port ${port.name} is declared at ${port.contractLocation} and that file does not exist`, port.iri));
    }
  }
  for (const port of outboundPorts) {
    const implementers = rules.adapters.filter((adapter) => adapter.implementsPort.includes(port.name));
    if (implementers.length === 0) {
      portFindings.push(finding("portimplementationconformance", "PORT_HAS_NO_ADAPTER", port.contractLocation,
        `outbound port ${port.name} has no declared adapter`, port.iri));
    }
  }
  for (const adapter of rules.adapters) {
    if (adapter.implementsPort.length === 0) {
      portFindings.push(finding("portimplementationconformance", "ADAPTER_IMPLEMENTS_NO_PORT", adapter.name,
        `adapter ${adapter.name} implements no declared port`, adapter.iri));
      continue;
    }
    const expected = adapterSourcePath(adapter, rules);
    if (expected === null) {
      portFindings.push(finding("portimplementationconformance", "ADAPTER_LAYER_HAS_NO_COMPONENT", adapter.name,
        `adapter ${adapter.name} is declared in layer ${adapter.layer}, which has no component to hold it`, adapter.iri));
      continue;
    }
    if (!existsSync(resolve(root, expected))) {
      portFindings.push(finding("portimplementationconformance", "ADAPTER_NOT_REALISED", expected,
        `adapter ${adapter.name} implements ${adapter.implementsPort.join(", ")} and ${expected} does not exist`, adapter.iri));
      continue;
    }
    // Ownership: the source must be assigned to a component in the adapter's
    // declared layer, so an implementation cannot sit in the wrong place.
    const owning = assignment.get(expected) ?? componentOf(expected, rules);
    if (owning === undefined || owning.layer !== adapter.layer) {
      portFindings.push(finding("portimplementationconformance", "ADAPTER_WRONG_COMPONENT", expected,
        `adapter ${adapter.name} must be owned by a component in layer ${adapter.layer}; ${expected} is owned by ${owning?.name ?? "no component"}`, adapter.iri));
    }
    const source = readFileSync(resolve(root, expected), "utf8");
    const specifiers = importsByFile.get(expected) ?? importsOf(source);
    for (const portName of adapter.implementsPort) {
      const port = rules.ports.find((entry) => entry.name === portName);
      if (port === undefined) {
        portFindings.push(finding("portimplementationconformance", "ADAPTER_PORT_UNKNOWN", expected,
          `adapter ${adapter.name} claims port ${portName}, which is not declared`, adapter.iri));
        continue;
      }
      // Bypass check: the adapter must reach its port's contract, not
      // reimplement the shape and hope it matches.
      const importsPort = specifiers.some((specifier) => {
        if (!specifier.startsWith(".")) return false;
        const target = resolveRelative(expected, specifier, root);
        return target === port.contractLocation;
      });
      if (!importsPort) {
        portFindings.push(finding("portimplementationconformance", "ADAPTER_DOES_NOT_IMPORT_PORT", expected,
          `adapter ${adapter.name} claims port ${portName} without importing its contract at ${port.contractLocation}, so nothing binds the two`, port.iri));
      }
      // Compiler engagement: an annotated binding means tsc decides
      // conformance. Without it, this scanner would be the only judge and it
      // cannot read types.
      const interfaceName = portInterfaceName(port.name);
      // An EXPORTED annotated binding, not merely any occurrence of the name.
      // A probe showed that an internal helper's return type satisfied the
      // looser form, so a file could annotate something it never exported and
      // still pass while offering the application layer nothing to inject.
      const annotated = new RegExp(
        `export\\s+(?:const|let|var|function|class)\\s+[A-Za-z0-9_$]+[^=;{]*:\\s*${interfaceName}\\b`,
      ).test(source);
      if (!annotated) {
        portFindings.push(finding("portimplementationconformance", "ADAPTER_EXPORT_NOT_PORT_TYPED", expected,
          `adapter ${adapter.name} has no export annotated as ${interfaceName}, so the type checker never decides whether it satisfies ${portName}`, port.iri));
      }
    }
  }
  add("portimplementationconformance",
    "architecture checker: per-adapter source resolution, component ownership, port-contract import and type-annotated binding, with tsc deciding structural conformance",
    rules.ports.length + rules.adapters.length, portFindings);

  // ------------------------------------------------------- imports resolve
  const resolveFindings: Finding[] = [];
  for (const file of files) {
    for (const specifier of importsByFile.get(file) ?? []) {
      if (!specifier.startsWith(".")) continue;
      if (resolveRelative(file, specifier, root) === null) {
        resolveFindings.push(finding("importsresolve", "IMPORT_UNRESOLVED", file,
          `the relative import "${specifier}" resolves to no file`));
      }
    }
  }
  add("importsresolve", "architecture checker: relative specifier resolution over every enumerated source", files.length, resolveFindings);

  // ------------------------------------------- declared dependencies agree
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>; devDependencies?: Record<string, string>;
  };
  const declared = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})]);
  const dependencyFindings: Finding[] = [];
  const importedPackages = new Set<string>();
  for (const file of files) {
    for (const specifier of importsByFile.get(file) ?? []) {
      if (specifier.startsWith(".") || specifier.startsWith("node:")) continue;
      const name = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0] as string;
      importedPackages.add(name);
      if (!declared.has(name)) {
        dependencyFindings.push(finding("declareddependenciesagree", "UNDECLARED_DEPENDENCY", file,
          `imports "${specifier}" but package.json declares no dependency "${name}"`));
      }
    }
  }
  if (!existsSync(resolve(root, "package-lock.json"))) {
    dependencyFindings.push(finding("declareddependenciesagree", "LOCKFILE_ABSENT", "package-lock.json",
      "a clean clone cannot reproduce the dependency closure without a lockfile"));
  }
  const scripts = (JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).scripts ?? {}) as Record<string, string>;
  const scriptText = Object.values(scripts).join(" ");
  for (const name of declared) {
    if (importedPackages.has(name)) continue;
    // A dependency may legitimately be used without ever being imported: a
    // tool is invoked by its BINARY name, which need not resemble the package
    // name. typescript provides tsc, so matching the package name against the
    // script text reports a false violation. Read the package's declared bin
    // names instead. A @types package is consumed by the type checker through
    // the tsconfig types field rather than by import or by script.
    if (name.startsWith("@types/")) continue;
    const installed = resolve(root, "node_modules", name, "package.json");
    if (!existsSync(installed)) {
      // Without an install there is no bin metadata to read, so this specific
      // check is not decidable. Saying so is better than guessing either way.
      continue;
    }
    const bin = (JSON.parse(readFileSync(installed, "utf8")) as { bin?: string | Record<string, string> }).bin;
    const binNames = typeof bin === "string" ? [name] : Object.keys(bin ?? {});
    const usedByScript = binNames.some((binary) => new RegExp(`(^|[\\s"'/])${binary}([\\s"']|$)`).test(scriptText));
    if (!usedByScript) {
      dependencyFindings.push(finding("declareddependenciesagree", "DECLARED_DEPENDENCY_UNUSED", "package.json",
        `"${name}" is declared, imported nowhere, and neither it nor any binary it provides (${binNames.join(", ") || "none"}) is named by a script`));
    }
  }
  add("declareddependenciesagree", "architecture checker: package manifest, lockfile presence and resolved import agreement", declared.size + importedPackages.size, dependencyFindings);

  // ------------------------------------------------------ module boundary
  // Folded into dependency direction's facet family, but evaluated separately
  // so the released capability convention is a named boundary rather than an
  // unchecked hole. Reported under the dependency-direction facet because that
  // is the invariant it protects.
  for (const boundary of rules.moduleBoundaries) {
    const prefixes = boundary.scope.flatMap((text) => text.match(/[A-Za-z0-9_./-]+\//g) ?? []);
    for (const file of files) {
      const component = assignment.get(file);
      if (component === undefined) continue;
      for (const specifier of importsByFile.get(file) ?? []) {
        if (!specifier.startsWith(".")) continue;
        const target = resolveRelative(file, specifier, root);
        if (target === null) continue;
        if (prefixes.some((prefix) => target.startsWith(prefix))) {
          directionFindings.push(finding("dependencydirection", "MODULE_BOUNDARY_CROSSED", file,
            `${component.name} imports ${target}, crossing the ${boundary.name} boundary: ${boundary.forbids[0] ?? boundary.reason}`, boundary.iri));
        }
      }
    }
  }

  // --------------------------------- facets this checker does not decide
  const delegated: Readonly<Record<string, string>> = {
    statictypecorrectness: "tsc --noEmit under the repository's declared strict configuration; a separate mechanism because a type checker is the only thing that can decide it",
    artefactroundtrip: "node --test over the codec round-trip matrix; a runtime behaviour rather than a source property",
    deterministicartefact: "node --test over repeated production of one specification",
  };
  const notCheckable: Readonly<Record<string, string>> = {
    buildcorrectness: "No delivery surface is realised, so there is no declared build command to run. The facet stays unsatisfied rather than vacuously satisfied.",
    localeparity: "No locale resource exists in the product repository yet, so there is no key set to compare against a reference. The 86-locale denominator is declared in the graph and unrealised here.",
    accessibilityconformance: "No rendered surface exists, so there is nothing to evaluate for accessible name, role, state, focus order or keyboard operability.",
    parameterjoinadmissibility: "The 23 declared conditional-joining rules have no implemented validator, so no specification can be admitted or refused yet.",
    surfaceparity: "One delivery surface is realised. A parity obligation over a single surface is trivially true and would prove nothing.",
  };
  for (const [name, mechanism] of Object.entries(delegated)) {
    add(name, mechanism, 1, [], undefined);
    // Delegated facets are decided by their own mechanism, not here. Mark the
    // verdict as not-checkable *by this checker* so a passing architecture run
    // is never mistaken for a passing type check.
    const index = results.findIndex((entry) => entry.facet === `architecture${name}`);
    const existing = results[index] as FacetResult;
    results[index] = { ...existing, verdict: "not-checkable", notCheckableReason: `decided by ${mechanism}` };
  }
  for (const [name, reason] of Object.entries(notCheckable)) add(name, "none", 0, [], reason);

  const blocking = results.filter((result) => result.severity === "blocking" && result.verdict === "violated");
  const blockingViolationCount = blocking.reduce((total, result) => total + result.findings.length, 0);

  return {
    schema: "urn:anqr:architecture-check:1",
    authority: rules.authority,
    rulesDigest: rulesDigest(root),
    sourceFileCount: files.length,
    assignedFileCount: files.length - unassigned.length,
    unassignedFiles: unassigned,
    declaredExcludedFiles: declaredExcluded,
    unaccountedFiles: unaccounted,
    facets: results.sort((left, right) => left.facet.localeCompare(right.facet)),
    blockingViolationCount,
    conforming: blockingViolationCount === 0,
  };
}

function rulesDigest(root: string): string {
  const bytes = readFileSync(resolve(root, "packages/architecture/rules.json"), "utf8");
  let hash = 0n;
  for (const byte of Buffer.from(bytes)) hash = (hash * 131n + BigInt(byte)) % (2n ** 64n);
  return `fnvlike:${hash.toString(16).padStart(16, "0")}`;
}

/**
 * Structural integrity of the projected rules themselves.
 *
 * The graph is authority and the USF-side drift check is what compares this
 * file against it. That check needs both repositories. This one needs only the
 * product, and it exists because the realistic way to weaken enforcement from
 * inside the product is to edit the projection: drop a facet, drop an adapter,
 * or point an adapter at a port that is no longer declared. Those are all
 * detectable here without any access to the graph.
 *
 * It cannot detect a coordinated edit that keeps the file internally
 * consistent. Only the authority comparison can, and that is stated rather
 * than papered over.
 */
export function rulesIntegrity(rules: Rules): readonly string[] {
  const problems: string[] = [];
  const expectedFacets = 15;
  if (rules.facets.length !== expectedFacets) {
    problems.push(`RULES_FACET_COUNT: expected ${expectedFacets} architecture facets, found ${rules.facets.length}`);
  }
  for (const facet of rules.facets) {
    if (!facet.iri.startsWith("urn:anqr:delivery-facet:")) problems.push(`RULES_FACET_IRI_INVALID: ${facet.name}`);
    if (facet.verificationClass.length === 0) problems.push(`RULES_FACET_CLASS_MISSING: ${facet.name}`);
    if (facet.severity.length === 0) problems.push(`RULES_FACET_SEVERITY_MISSING: ${facet.name}`);
  }
  const layers = new Set(rules.layers.map((layer) => layer.name));
  for (const component of rules.components) {
    if (!layers.has(component.layer)) problems.push(`RULES_COMPONENT_LAYER_UNKNOWN: ${component.name} -> ${component.layer}`);
    if (!component.location.endsWith("/")) problems.push(`RULES_COMPONENT_LOCATION_INVALID: ${component.name}`);
  }
  const portNames = new Set(rules.ports.map((port) => port.name));
  for (const adapter of rules.adapters) {
    if (adapter.implementsPort.length === 0) problems.push(`RULES_ADAPTER_NO_PORT: ${adapter.name}`);
    for (const port of adapter.implementsPort) {
      if (!portNames.has(port)) problems.push(`RULES_ADAPTER_PORT_UNKNOWN: ${adapter.name} -> ${port}`);
    }
    if (!layers.has(adapter.layer)) problems.push(`RULES_ADAPTER_LAYER_UNKNOWN: ${adapter.name} -> ${adapter.layer}`);
  }
  for (const port of rules.ports.filter((entry) => entry.direction === "outbound")) {
    if (!rules.adapters.some((adapter) => adapter.implementsPort.includes(port.name))) {
      problems.push(`RULES_OUTBOUND_PORT_UNSERVED: ${port.name}`);
    }
  }
  for (const rule of rules.dependencyRules) {
    if (!layers.has(rule.from) || !layers.has(rule.to)) problems.push(`RULES_DEPENDENCY_LAYER_UNKNOWN: ${rule.kind} ${rule.from} -> ${rule.to}`);
  }
  if (rules.moduleBoundaries.length === 0) problems.push("RULES_NO_MODULE_BOUNDARY: every source would be unaccounted");
  return problems;
}

export function loadRules(root: string): Rules {
  return JSON.parse(readFileSync(resolve(root, "packages/architecture/rules.json"), "utf8")) as Rules;
}

export function repositoryRoot(): string {
  let candidate = resolve(import.meta.dirname);
  while (!existsSync(join(candidate, "package.json")) || !existsSync(join(candidate, "packages"))) {
    const parent = dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  return candidate;
}

if (import.meta.filename === process.argv[1] || process.argv[1]?.endsWith("check.ts")) {
  const root = repositoryRoot();
  const rules = loadRules(root);
  const integrity = rulesIntegrity(rules);
  if (integrity.length > 0) {
    // The rules are the product's copy of authority. If they are incoherent,
    // every verdict below would be computed from a weakened rule set, so this
    // refuses before checking anything rather than reporting a green result
    // derived from a mutilated projection.
    for (const problem of integrity) process.stderr.write(`${problem}\n`);
    process.stderr.write("architecture rules failed their integrity check; regenerate them from the semantic graph\n");
    process.exitCode = 1;
  }
  const report = checkArchitecture(root, rules);
  const summary = report.facets.map((facet) => {
    const mark = facet.verdict === "satisfied" ? "pass" : facet.verdict === "violated" ? "FAIL" : "n/a ";
    return `  ${mark}  ${facet.facet.replace("architecture", "").padEnd(28)} ${facet.verificationClass.padEnd(34)} ${facet.findings.length} finding(s)`;
  }).join("\n");
  process.stdout.write(`ANQR architecture check\n${summary}\n\n`);
  process.stdout.write(`  sources ${report.sourceFileCount}, assigned ${report.assignedFileCount}, declared-excluded ${report.declaredExcludedFiles.length}, unaccounted ${report.unaccountedFiles.length}\n`);
  if (report.unaccountedFiles.length > 0) {
    for (const file of report.unaccountedFiles) process.stderr.write(`UNACCOUNTED_SOURCE ${file}: belongs to no component and no declared boundary\n`);
    process.exitCode = 1;
  }
  process.stdout.write(`  blocking violations ${report.blockingViolationCount}, conforming ${report.conforming}\n`);
  if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.conforming) {
    for (const facet of report.facets) {
      for (const item of facet.findings) {
        process.stderr.write(`${item.code} ${item.file}: ${item.detail}\n`);
      }
    }
    process.exitCode = 1;
  }
  if (statSync(resolve(root, "package.json")).isFile() === false) process.exitCode = 1;
}
