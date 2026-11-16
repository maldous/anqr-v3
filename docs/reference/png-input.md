# PNG input adapter

This reference describes the existing in-process `pngImageSource` at source
`e60823ea37119c2e5cbed86e11d380dbfa50821f`, tree
`0453b0c6e38601f73461cc746f40595a2ab6987a`. Its implementation is
[`png-image-source.ts`](../../packages/artefact/src/adapters/png-image-source.ts),
implementing [`ImageSourcePort`](../../packages/artefact/src/ports/image-source.ts).
It turns caller-supplied PNG bytes into pixels. It does not decode a QR payload,
read a file, fetch an asset, inspect a camera frame or expose an HTTP/MCP service.

For producing/exporting a QR image instead, use the separate
[artifact package guide](../../packages/artefact/README.md). The producer does not
automatically invoke this image-input adapter. Likewise, a declaration in
`InspectArtefactPort` is not an implemented inspection application.

## Call and result contract

The only adapter method is:

```ts
decode(bytes: Uint8Array, declaredMediaType: string): Promise<DecodeImageResult>
```

Imports in this illustrative call pattern are relative to a TypeScript file at
the repository root. The bytes are already supplied by the caller; no acquisition,
storage or transmission is added:

```ts
import { pngImageSource } from './packages/artefact/src/adapters/png-image-source.ts';

async function decodeForCaller(bytes: Uint8Array) {
  const decoded = await pngImageSource.decode(bytes, 'image/png');
  if (!decoded.ok) {
    // Route decoded.reason and decoded.detail to the caller's own feedback.
    return decoded;
  }
  // decoded.image has width, height and row-major RGBA pixels.
  // Each pixel occupies four Uint8Array entries, including alpha.
  return decoded;
}
```

Success is `{ ok: true, image: { width, height, pixels } }`, with
`pixels.length === width * height * 4`. Greyscale is copied to R/G/B. Explicit
alpha is retained; images without an alpha channel receive alpha 255. There is
no colour-profile conversion or alpha premultiplication in this implementation.

Refusal is `{ ok: false, reason, detail }`. This is not the producer application's
`refusal.kind` shape, nor an inspection result. Check `ok` before reading `image`.
The TypeScript types are not runtime validation of arbitrary JavaScript values.
Callers must still handle promise rejection: allocations and operations outside
the inflation catch are not all converted into refusal results.

## Admitted input and refusals

| Boundary | Current implementation |
| --- | --- |
| Declared media type | Exactly `image/png`. A different or parameterized string is `UNSUPPORTED_FORMAT`; there is no MIME normalization or format fallback. |
| Signature/dimensions | Requires the PNG signature and usable positive dimensions. A missing signature, unusable dimensions, malformed IHDR size, overrun chunk or missing IDAT is `MALFORMED`. |
| Pixel count | At most `64 * 1024 * 1024` pixels, inclusive. A larger declared product of width and height is `TOO_LARGE`. This is not an independent bound on either dimension. |
| Channel depth/layout | Eight-bit greyscale, RGB, greyscale-alpha and RGBA: PNG colour types 0, 2, 4 and 6. Other depths/types, including palette input, are `UNSUPPORTED_FORMAT`. |
| Interlace | Only interlace value 0. Other values are `UNSUPPORTED_FORMAT`. |
| Transparency | Explicit alpha channels are supported. Any encountered `tRNS` chunk is refused as `UNSUPPORTED_FORMAT`, rather than silently dropping a transparency key. |
| Compressed data | Concatenated IDAT bytes are inflated through `DecompressionStream('deflate')`. Failed inflation or an expanded size different from the declared scanline size is `MALFORMED`. |
| Scanline filters | Reverses filter types 0–4. An unknown filter is `MALFORMED`. |

The expected inflated byte count is `(width * samplesPerPixel + 1) * height`.
The additional byte per row is its PNG filter selector. Inflated output exceeding
that expected size is refused while the stream is being drained; shorter output
is refused after completion. This bound does not make the adapter a full PNG
validator or a process-memory quota.

## Parser and resource limits

The source checks selected PNG fields and reconstructs supported pixels. It does
not verify chunk CRCs, enforce a complete PNG chunk-order/critical-chunk policy,
require an IEND terminator, or validate every IHDR method field. Unknown chunks
are skipped, and encountering IEND stops the chunk loop. A successful pixel
result therefore is not proof that the entire supplied file conforms to PNG,
that its metadata is trustworthy, or that trailing content has been validated.

The port supplies no compressed-input byte limit, cancellation API or caller-
specific admission budget. IDAT parts, the joined compressed buffer, inflated
chunks, unfiltered samples and RGBA output can coexist. At the pixel ceiling the
RGBA array alone is 256 MiB; the pixel/inflation limits are not an RSS guarantee.
Choose an appropriate input/resource boundary in the actual consuming application
rather than treating the adapter's maximum as a recommended request size.

The runtime must provide the standard `DecompressionStream` global used by the
source. Repository checks use the [pinned toolchain](../toolchain.md); the adapter
has no third-party runtime import. Source use of this API is not independent
browser/device compatibility, image-security or camera qualification.

## Existing evidence and separate responsibilities

The accepted [adapter tests](../../packages/artefact/tests/adapters.test.ts)
contain the matching call pattern and cases for sibling-container pixels,
all five filters, greyscale/RGB conversion, malformed deflate in a strict Node
child, excess/short inflated data, transparency-key refusal and selected
unsupported inputs. Those are retained source-specific tests, not new runs
performed for this reference. They do not constitute an exhaustive PNG corpus,
all alpha/metadata combinations or a hosted untrusted-image pipeline.

Image decoding is separate from QR-grid decoding, independent final-file QR
qualification, scan-safety measurement and the selected service contract. This
reference changes none of those implementations or their acceptance, and adds no
application, deployment command, runtime dependency or release gate.
