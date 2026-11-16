# Container encoding interfaces

This reference covers the existing PNG, SVG and GIF adapters at accepted source
`08056f0418673f4125355c2af57d4d15c7035ed6`, tree
`3bcdeed2662609bfd365bef6d5c3ba4dac9c373c`. These are in-process encoders,
not file writers, downloads, HTTP endpoints or independent scan-safety checks.
For the ordinary QR produce/export flow, start with the
[artifact guide](../../packages/artefact/README.md).

## One port, distinct runtime checks

[`ContainerEncoderPort`](../../packages/artefact/src/ports/container-encoder.ts)
declares `mediaType`, `supportsAnimation` and
`encode(frames: readonly Frame[]): Promise<EncodedContainer>`.
Each `Frame` carries `width`, `height`, row-major RGBA `pixels: Uint8Array`
and `durationMs`. `EncodedContainer` has only `bytes` and `mediaType`.

Direct adapter calls do **not** return an `ok`/refusal union. Their promises
reject on declared validation failures and can reject for runtime/allocation
errors. The application's export result is a different contract that wraps
selected failures. Do not read `ok`, `refusal` or `byteLength` from this port's
result; use `bytes.byteLength` when the encoded length is needed.

This source-checked call pattern is relative to a TypeScript file at repository
root. It accepts an existing frame; it acquires, saves and transmits nothing:

```ts
import { pngContainer } from './packages/artefact/src/adapters/png-container.ts';
import type { Frame } from './packages/artefact/src/ports/container-encoder.ts';

async function encodeExistingFrame(frame: Frame) {
  // The caller must handle rejection before offering bytes as a successful file.
  const encoded = await pngContainer.encode([frame]);
  return { bytes: encoded.bytes, mediaType: encoded.mediaType };
}
```

The common TypeScript port is not comprehensive runtime validation of arbitrary
JavaScript objects, nor a promise that each adapter admits the same values.

## Format-specific behavior

| Adapter | Selection and admitted frames | Encoded behavior / limits |
| --- | --- | --- |
| [`pngContainer`](../../packages/artefact/src/adapters/png-container.ts) | `image/png`, animation false, exactly one frame. Checks positive integer dimensions and exact `width * height * 4` pixel-array length. | Writes eight-bit RGBA PNG with filter 0 scanlines, zlib-wrapped deflate and chunk CRCs. Uses the runtime's `CompressionStream('deflate')`. Frame duration is not encoded. This is not APNG support. |
| [`svgContainer`](../../packages/artefact/src/adapters/svg-container.ts) | `image/svg+xml`, animation false, exactly one frame. Checks pixel-array length; unlike PNG/GIF it does not independently enforce positive integer dimensions. | Encodes horizontal equal-colour pixel runs as rectangles. Fully transparent runs are omitted; partial alpha is represented with three-decimal fill opacity. Frame duration is not encoded. It is a pixel-derived SVG, not an arbitrary vector-art/animation renderer. |
| [`gifContainer`](../../packages/artefact/src/adapters/gif-container.ts) | `image/gif`, animation true, one or more same-sized frames. Dimensions must be positive integers at most 65,535. Pixel length must match RGBA and every alpha byte must be 255. | Exact global RGB palette across all frames, at most 256 colours; refuses overflow rather than quantizing. Frame delay is rounded from milliseconds to centiseconds and must fit 16 bits. Multiple frames receive the source's indefinite-loop extension. Adapter animation is not an application animation workflow. |

The PNG/GIF modules also expose `pngRasterSurface` / `gifRasterSurface`, which
delegate to the same pixel-surface implementation. A raster surface supplies
pixels; it is not an encoded file or an image decoder. PNG input decoding uses
the separate [PNG input adapter](png-input.md) with a different result shape.

## Declared rejection conditions

The current source throws these `Error` messages. They describe the inspected
edition, not a newly versioned external error protocol or a guarantee that every
JavaScript failure becomes one of these messages:

| Message | Current source condition |
| --- | --- |
| `CONTAINER_NO_FRAMES` | All three adapters reject an empty frame list. |
| `CONTAINER_ANIMATION_UNSUPPORTED` | PNG/SVG reject more than one frame instead of flattening it. |
| `CONTAINER_FRAME_MALFORMED` | A frame's pixel length differs from `width * height * 4`. |
| `CONTAINER_FRAME_DIMENSIONS_INVALID` | PNG checks positive integers; GIF additionally enforces the 16-bit dimension limit. SVG has no corresponding explicit dimension check. |
| `CONTAINER_FRAME_DURATION_INVALID` | GIF rejects nonfinite/negative milliseconds or a rounded delay above 65,535 centiseconds. PNG/SVG do not encode the duration. |
| `CONTAINER_ALPHA_UNSUPPORTED` | GIF encounters any alpha byte other than 255. No implicit flattening is performed. |
| `CONTAINER_FRAME_SIZE_MISMATCH` | GIF frame dimensions disagree with the first frame. |
| `CONTAINER_PALETTE_EXCEEDED` | GIF would need more than 256 RGB colours across the supplied frame set. |

## Resource, determinism and qualification boundaries

The port provides no cancellation API, output-byte cap, total-frame-count cap or
common per-request memory quota. Encoding holds input pixels plus intermediate
buffers/text and output. Do not reuse the PNG **decoder's** pixel limit as an
encoder admission rule: it is not enforced by this port. Choose resource bounds
in the actual consuming application rather than treating format-field widths
as a safe workload recommendation.

PNG compression is only claimed deterministic within the selected runtime;
different compression implementations may produce different valid bytes. A
`supportsAnimation` flag, byte equality or a successful encode is not proof of
QR payload recovery, temporal scan safety, browser/device display, camera
behavior or production readiness. Directly supplied pixels have not been
authenticated or independently validated by choosing a container.

The accepted [adapter-test source](../../packages/artefact/tests/adapters.test.ts)
contains existing format/header, validation, palette/alpha/delay, LZW and
determinism cases. The separate
[historical SVG output evidence](../validation/svg-output-633f023/README.md)
records independent final-file observations for its selected cases only.
Neither is a new execution result from writing this reference, and neither
qualifies all animations, malformed frames or delivery environments.
