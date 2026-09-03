import { cpSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// A disposable copy of the product tree, for tests that must plant a real file.
//
// Node runs each test FILE as its own process, so two files that plant into the
// shared tree interleave: each one's known-good assertion can observe the
// other's planted violation. That produced a suite which passed twice and
// failed once, with the failure moving between runs — the worst kind, because
// it looks like a flake and is actually an unsound test.
//
// Planting into a copy removes the interference without weakening any
// assertion: the sources, the rules and the projection are the real ones.

export interface IsolatedTree {
  readonly root: string;
  dispose(): void;
}

const COPIED = ["packages/architecture", "packages/artefact", "apps/web", "src", "package.json", "package-lock.json", "tsconfig.json"];

export function isolatedTree(repositoryRoot: string): IsolatedTree {
  const root = mkdtempSync(join(tmpdir(), "anqr-isolated-"));
  for (const entry of COPIED) {
    cpSync(resolve(repositoryRoot, entry), resolve(root, entry), {
      recursive: true,
      // node_modules is symlinked once below rather than copied per entry.
      filter: (source) => !source.includes(`${"node_modules"}`) && !source.includes("/dist"),
    });
  }
  symlinkSync(resolve(repositoryRoot, "node_modules"), resolve(root, "node_modules"), "dir");
  return { root, dispose: () => rmSync(root, { recursive: true, force: true }) };
}
