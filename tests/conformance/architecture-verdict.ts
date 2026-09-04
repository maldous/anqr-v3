import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkArchitecture, loadExperience, loadRules } from "../../packages/architecture/src/check.ts";

/**
 * Architecture facets, evidenced by running the mechanism that decides them.
 *
 * These facets are declared on ANQR's architecture contracts and are admissible
 * as implementation conformance, so the evaluator looks for a subtest named for
 * each one. What it must not find is an assertion that merely restates the
 * facet: the subtest has to execute the thing that could fail. So the static
 * facets run the real checker over the real tree, and the two that no static
 * check can decide run the type checker and the build.
 */

export const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

let cached: ReturnType<typeof checkArchitecture> | null = null;

/** The real checker over the real tree, computed once per process. */
export function architectureReport(): ReturnType<typeof checkArchitecture> {
  cached ??= checkArchitecture(repositoryRoot, loadRules(repositoryRoot), loadExperience(repositoryRoot));
  return cached;
}

export function facetVerdict(facet: string): { verdict: string; findings: readonly { code: string; file: string }[] } {
  const entry = architectureReport().facets.find((candidate) => candidate.facet === facet);
  if (entry === undefined) throw new Error(`the architecture report declares no facet ${facet}`);
  return { verdict: entry.verdict, findings: entry.findings.map((finding) => ({ code: finding.code, file: finding.file })) };
}

/** Runs a declared npm script, returning whether it succeeded and its output. */
export function runScript(script: string): { ok: boolean; output: string } {
  try {
    return { ok: true, output: execFileSync("npm", ["run", script], { cwd: repositoryRoot, encoding: "utf8", stdio: "pipe" }) };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
  }
}

export const distMain = resolve(repositoryRoot, "apps/web/dist/main.js");
