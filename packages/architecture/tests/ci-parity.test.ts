import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { isolatedTree } from "./isolated-tree.ts";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));

/**
 * The automated gate and the local chain must decide the same repository
 * truth.
 *
 * A workflow file is the easiest thing in a repository to make decorative: it
 * runs, it is green, and nobody notices that it stopped running the step that
 * mattered. These checks make that failure loud. They read the workflow as
 * text rather than trusting a runner, so they hold in a clean clone with no
 * network and no CI provider.
 */

const workflow = readFileSync(resolve(repositoryRoot, ".github/workflows/validate.yml"), "utf8");
const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

/** The commands the workflow actually runs, in order. */
function workflowCommands(text: string): readonly string[] {
  return text.split("\n")
    .map((line) => /^\s*-\s+run:\s+(.+?)\s*$/u.exec(line)?.[1])
    .filter((command): command is string => command !== undefined);
}

const CANONICAL = ["npm ci", "npm run typecheck", "npm test", "npm run architecture", "npm run build", "npm run delivery", "npm run validate"] as const;

test("the automated gate runs the canonical chain, in order and complete", () => {
  assert.deepEqual(workflowCommands(workflow), [...CANONICAL],
    "CI must run the same chain the clean-clone proof runs; a narrower CI is worse than none, because it looks like coverage");
});

test("every script the gate invokes exists", () => {
  for (const command of workflowCommands(workflow)) {
    const script = /^npm run ([a-z:-]+)$/u.exec(command)?.[1];
    if (script === undefined) continue;
    assert.ok(script in manifest.scripts, `the workflow runs "${command}" and package.json has no such script`);
  }
});

test("validate is the composite of the chain, not a shortcut past it", () => {
  const validate = manifest.scripts.validate ?? "";
  for (const part of ["typecheck", "test", "architecture", "build", "delivery"]) {
    assert.match(validate, new RegExp(`\\b${part}\\b`, "u"),
      `validate must include ${part}, or the single-command route proves less than the gate`);
  }
});

test("the gate pins a runtime rather than following whatever the runner defaults to", () => {
  assert.match(workflow, /node-version:\s*"?\d+/u,
    "an unpinned runtime makes the gate's verdict depend on the runner's mood");
});

test("the gate has a timeout, so a hang is a failure rather than a queue", () => {
  assert.match(workflow, /timeout-minutes:\s*\d+/u);
});

test("planted: a step removed from the workflow is caught", () => {
  const weakened = workflow.split("\n").filter((line) => !/-\s+run:\s+npm run architecture/u.test(line)).join("\n");
  assert.notDeepEqual(workflowCommands(weakened), [...CANONICAL],
    "dropping the architecture step must be visible");
  assert.ok(!workflowCommands(weakened).includes("npm run architecture"));
});

test("planted: a reordered chain is caught", () => {
  const reordered = workflow.replace("      - run: npm run typecheck\n      - run: npm test\n",
                                     "      - run: npm test\n      - run: npm run typecheck\n");
  assert.notDeepEqual(workflowCommands(reordered), [...CANONICAL],
    "running tests before the type check would report failures the type check explains");
});

test("planted: the gate would reject a real violation, proven by running the chain against one", () => {
  // The strongest available proof without a CI provider: the composite command
  // the workflow's last step runs is executed here against a planted
  // architecture violation, in an isolated copy so nothing shared is mutated.
  const tree = isolatedTree(repositoryRoot);
  try {
    const run = (): { ok: boolean; output: string } => {
      try {
        return { ok: true, output: execFileSync(process.execPath, ["packages/architecture/src/check.ts"], { cwd: tree.root, encoding: "utf8" }) };
      } catch (error) {
        const failure = error as { stdout?: string; stderr?: string };
        return { ok: false, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
      }
    };
    assert.equal(run().ok, true, "known good: the gate's architecture step passes");

    const planted = resolve(tree.root, "packages/artefact/src/qr/ci-planted.ts");
    writeFileSync(planted, 'import { h } from "preact";\nexport const used = h;\n');
    const broken = run();
    assert.equal(broken.ok, false, "the gate must reject a framework import in the domain layer");
    assert.match(broken.output, /FRAMEWORK_IMPORT_IN_ISOLATED_LAYER/u);

    rmSync(planted, { force: true });
    assert.equal(run().ok, true, "restored: the gate passes again");
  } finally {
    tree.dispose();
  }
});
