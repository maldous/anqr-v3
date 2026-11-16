# ANQR artifact package

This directory contains an in-process TypeScript QR producer and its raster,
container and clock adapters. It is not a deployed application, HTTP endpoint,
MCP server or separately published npm package.

Use the application entry point in
[`src/application/produce-artefact.ts`](src/application/produce-artefact.ts).
The application accepts supplied values, validates their combination, builds a
QR symbol, checks its internal grid against the requested text, and produces a
frame. Exporting that frame to encoded bytes is a separate operation.

## Produce and export a PNG

The following imports are relative to a TypeScript file at the repository root.
Use the repository's [pinned toolchain](../../docs/toolchain.md); no new runtime
dependency is required.

```ts
import {
  createArtefactProducer,
  type ExportResult,
} from './packages/artefact/src/application/produce-artefact.ts';
import {
  pngContainer,
  pngRasterSurface,
} from './packages/artefact/src/adapters/png-container.ts';
import { fixedClock } from './packages/artefact/src/adapters/system-clock.ts';

const producer = createArtefactProducer({
  containerFor(format) {
    if (format !== 'png') throw new Error('This example exports PNG only.');
    return pngContainer;
  },
  surfaceFor: pngRasterSurface,
  clock: fixedClock(0),
});

async function makePng(payload: string): Promise<ExportResult> {
  const produced = await producer.produce({
    payload,
    errorCorrectionLevel: 'M',
    outputFormat: 'png',
  });
  if (!produced.ok) return produced;

  const exported = await producer.exportArtefact(produced.artefact);
  if (!exported.ok) return exported;
  return exported;
}

// The caller decides where bytes or feedback go. Nothing is saved or sent here.
const result = await makePng('café 東京🙂');
if (result.ok) {
  // result.bytes is Uint8Array; result.mediaType is image/png.
  // result.byteLength describes the encoded bytes, not the pixel buffer.
} else if (result.refusal.kind === 'inadmissible') {
  // Each refusal has code, parameter and detail for input-specific feedback.
  const invalidParameters = result.refusal.refusals.map(item => item.parameter);
  void invalidParameters;
} else {
  // unsafe or production-failed: do not offer bytes as a successful export.
  const failureKind = result.refusal.kind;
  void failureKind;
}
```

`fixedClock(0)` makes this example deterministic. Use the provided `systemClock`
or your own `ClockPort` when a real timestamp is needed. The caller must also
handle promise rejection: malformed JavaScript inputs and exceptions from
injected raster/clock dependencies are not all converted to refusal results.
Types and result unions are not an untrusted-input boundary.

## Inputs and refusal results

The application re-exports `SuppliedValues`, `ArtefactSpecification`,
`OutputFormat` and the join-refusal types. Required supplied fields are
`payload`, `errorCorrectionLevel` and `outputFormat`. The
[specification join](src/model/artefact-specification.ts) checks combinations
rather than silently changing a requested setting.

| Input | Current choices and default |
|---|---|
| `payload` | Nonempty string; exact text is preserved. Capacity depends on encoding, version and ECC. |
| `errorCorrectionLevel` | Required: `L`, `M`, `Q` or `H`. |
| `outputFormat` | Required: `svg`, `png` or `gif`. The injected container must match. |
| `symbolVersion` | `auto` by default, or an integer in the supported QR version range. A forced version too small for the complete payload is refused. |
| `maskPattern` | `auto` by default, or an integer from 0 to 7. |
| `moduleSizePx` | Integer from 1 to 64; default 6. |
| `quietZoneModules` | Integer from 0 to 16; default 4. Acceptance of a value is not independent scan qualification. |
| Colours | Six-digit `#RRGGBB`; defaults black foreground and white background. The join enforces a contrast-ratio floor of 4.5. |

Both operations return a discriminated `ok` result. Refusals are:

- `inadmissible`: a list of parameter-specific join failures.
- `unsafe`: internal symbol verification failed, or export was offered a result
  whose scan-safety verdict was not `scannable`.
- `production-failed`: caught encoding or container failures, with detail.

A successful `produce` returns a specification, structure, internal scan-safety
result, RGBA frame and timestamp. It does **not** return encoded file bytes.
A successful `exportArtefact` returns `bytes`, `mediaType` and `byteLength`.
Keep these two success checks separate. Pass through results produced by this
application; export's verdict check is not an authenticity check on arbitrary
caller-constructed objects.

## Adapters and interface boundaries

- [`pngContainer`](src/adapters/png-container.ts) exports PNG; its companion
  `pngRasterSurface` supplies the raster surface used in the example.
- [`svgContainer`](src/adapters/svg-container.ts) exports one SVG frame and
  refuses animation rather than flattening it.
- [`gifContainer`](src/adapters/gif-container.ts) is a GIF container adapter.
  The application shown above produces and exports one frame. Adapter animation
  support does not turn that API into an animation workflow.
- [`ContainerEncoderPort`](src/ports/container-encoder.ts),
  [`RasterSurfacePort`](src/ports/raster-surface.ts) and
  [`ClockPort`](src/ports/clock.ts) are the injected dependencies.

The similarly named types in
[`ports/produce-artefact.ts`](src/ports/produce-artefact.ts) and
[`ports/inspect-artefact.ts`](src/ports/inspect-artefact.ts) are separate port
contracts. They have no implementing source consumer in this accepted edition.
Their `ProducedArtefact` and `ProduceResult` shapes are not interchangeable with
the application's types. Do not infer an installed inspection service from an
interface declaration.

The separate [`src/capabilities`](../../src/capabilities/) tree contains product
capability models and conformance contracts. Its render/delivery/inspection
names do not imply that it uses this package or exposes a working service.

## What the evidence establishes

Production's `scanSafety` check decodes the internal module grid before the
injected raster/container stages. Its `scannable` label is that internal check,
not independent decoding of the final exported file or a camera measurement.
`damageMarginCodewords` is derived from the selected ECC block layout; it is not
an observed tolerance for arbitrary damage, logos or customisation.

The [selected SVG output evidence](../../docs/validation/svg-output-633f023/README.md)
separately records final files and independent decoding for its stated source
and payload/ECC matrix. Preserve that historical evidence and its limitations.
It does not qualify every adapter, device, browser or arbitrary image.

Run source checks from the repository root using the
[documented toolchain](../../docs/toolchain.md): `npm run typecheck`, `npm test`
and `npm run test:conformance`. The full test command includes package tests;
capability conformance overlaps the full suite. No application build, server
start or production deployment command is supplied by this package.
