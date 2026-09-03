// Build the ANQR web surface.
//
// esbuild only, from declared dependencies, with no global tool. The bundle is
// written to the location the implementation pack declares, and the build fails
// on any unresolved import rather than emitting a partial artefact.

import { build } from "esbuild";
import { cp, mkdir, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(here, "dist");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const result = await build({
  entryPoints: [resolve(here, "src/main.ts")],
  outfile: resolve(outputDirectory, "main.js"),
  bundle: true,
  format: "esm",
  target: "es2022",
  platform: "browser",
  minify: true,
  // Deterministic: no timestamp, no build id, no absolute path in the output.
  sourcemap: false,
  legalComments: "none",
  absWorkingDir: here,
  logLevel: "warning",
  metafile: true,
});

await cp(resolve(here, "index.html"), resolve(outputDirectory, "index.html"));
await cp(resolve(here, "styles.css"), resolve(outputDirectory, "styles.css"));

const bundle = await stat(resolve(outputDirectory, "main.js"));
const inputs = Object.keys(result.metafile.inputs).length;
process.stdout.write(`ANQR web build\n  bundle apps/web/dist/main.js ${bundle.size} bytes from ${inputs} inputs\n  index.html and styles.css copied\n`);
