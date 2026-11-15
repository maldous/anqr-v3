import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createArtefactProducer } from '../packages/artefact/src/application/produce-artefact.ts';
import { createPixelSurface } from '../packages/artefact/src/adapters/pixel-surface.ts';
import { svgContainer } from '../packages/artefact/src/adapters/svg-container.ts';

if (!process.argv[2]) throw new Error('Usage: node scripts/validate-svg-output.mjs OUTPUT_DIRECTORY');
const root = path.resolve(process.argv[2]);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
const producer = createArtefactProducer({
  containerFor(format) { if (format !== 'svg') throw new Error('SVG only'); return svgContainer; },
  surfaceFor: createPixelSurface,
  clock: { nowMs: () => 0 },
});
const inputs = [
  { name: 'ascii', payload: 'ANQR INDEPENDENT PNG 12345' },
  { name: 'multibyte', payload: 'café 東京' },
  { name: 'emoji', payload: 'ANQR🙂🚀' },
];
const results = [];
for (const level of ['L', 'M', 'Q', 'H']) {
  for (const input of inputs) {
    const id = `${level}-${input.name}`;
    const row = { id, requestedLevel: level, payload: input.payload, expectedHex: Buffer.from(input.payload, 'utf8').toString('hex') };
    try {
      const produced = await producer.produce({ payload: input.payload, errorCorrectionLevel: level, outputFormat: 'svg' });
      if (!produced.ok) { results.push({ ...row, produced: false, refusal: produced.refusal }); continue; }
      const exported = await producer.exportArtefact(produced.artefact);
      if (!exported.ok) { results.push({ ...row, produced: true, exported: false, refusal: exported.refusal }); continue; }
      const filename = `artifacts/${id}.svg`;
      await fs.writeFile(path.join(root, filename), exported.bytes);
      results.push({ ...row, produced: true, exported: true, filename,
        mediaType: exported.mediaType, byteLength: exported.byteLength,
        sha256: crypto.createHash('sha256').update(exported.bytes).digest('hex'),
        prefixBytes: Buffer.from(exported.bytes.subarray(0, 8)).toString('hex'),
        structure: produced.artefact.structure, internalScanSafety: produced.artefact.scanSafety,
      });
    } catch (error) { results.push({ ...row, threw: true, error: String(error) }); }
  }
}
await fs.writeFile(path.join(root, 'production-results.json'), JSON.stringify({
  source: sourceRevision, node: process.version,
  contract: 'Final SVG qualification; independent rasterisation required; internal scanSafety is not independent evidence', results,
}, null, 2) + '\n');
console.log(JSON.stringify({ total: results.length, exported: results.filter(r => r.exported).length, refused: results.filter(r => r.refusal).length, threw: results.filter(r => r.threw).length }));

const sourceFiles = [];
async function recordSource(directory) {
  for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) { await recordSource(filename); continue; }
    if (!entry.name.endsWith('.ts')) continue;
    const relative = path.relative(repositoryRoot, filename).split(path.sep).join('/');
    const bytes = await fs.readFile(filename);
    const committed = execFileSync('git', ['show', `${sourceRevision}:${relative}`], { cwd: repositoryRoot });
    if (!bytes.equals(committed)) throw new Error(`Uncommitted artifact source: ${relative}`);
    sourceFiles.push({ path: relative, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      git_blob: crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex') });
  }
}
await recordSource(path.join(repositoryRoot, 'packages/artefact/src'));
await fs.writeFile(path.join(root, 'source-manifest.json'), JSON.stringify({ head: sourceRevision,
  tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: repositoryRoot, encoding: 'utf8' }).trim(), files: sourceFiles }, null, 2) + '\n');
if (results.length !== 12 || results.some((result) => !result.exported)) process.exitCode = 1;
