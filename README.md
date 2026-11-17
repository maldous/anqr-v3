# ANQR V3

This TypeScript repository contains ANQR's product capability source and conformance tests.

[Matthew Aldous](https://aldous.info/) · [ANQR website](https://anqr.link/) · [Earlier ANQR monorepo](https://github.com/maldous/anqr) · [Translations](https://github.com/maldous/anqr-i18n)

## Explore the source

[`src/capabilities/`](src/capabilities/) organises work into payload, creation, presentation, analysis, distribution, experience, localisation, quality, trust and enterprise capabilities. [`tests/conformance/`](tests/conformance/) contains the corresponding conformance work.

Directory names describe the scope of the implementation; they do not establish that every capability is production-ready or deployed on the public website.

## Artifact package

[`packages/artefact/`](packages/artefact/) provides an in-process TypeScript QR
producer with injected raster, container and clock ports. The selected package
comes from this repository's `92ba820dd63e7461928bdeddfd8a430c4cc10a74`
source, with UTF-8 ECI and capacity corrections from
`590d00a7d5e9c878735595b4fe3839da69a4482b` and subsequent PNG-input and
exact-text corrections. This selects the package only;
the historical application and architecture projections are separate.

```ts
import { createArtefactProducer } from './packages/artefact/src/application/produce-artefact.ts';
import { pngContainer, pngRasterSurface } from './packages/artefact/src/adapters/png-container.ts';

const producer = createArtefactProducer({
  containerFor: () => pngContainer,
  surfaceFor: pngRasterSurface,
  clock: { nowMs: () => Date.now() },
});
const result = await producer.produce({
  payload: 'café 東京🙂', outputFormat: 'png', errorCorrectionLevel: 'M',
});
if (result.ok) {
  const exported = await producer.exportArtefact(result.artefact);
  // Check exported.ok before consuming exported.bytes.
}
```

The PNG adapter uses standard `CompressionStream`/`DecompressionStream` APIs;
the package has no third-party runtime imports. Numeric, alphanumeric and UTF-8
byte encoding are supported; non-ASCII byte payloads declare UTF-8 ECI 26.
The internal grid decoder accepts that single ECI byte segment and rejects
other ECI assignments. It preserves the existing no-ECI UTF-8 decoding behavior.
A forced version that cannot hold the full header and payload is refused.
Leading U+FEFF characters are preserved as payload. PNG input inflation is
bounded by the declared scanline size, and malformed compressed data refuses
without unhandled stream errors. PNG transparency keys (`tRNS`) are explicitly
unsupported; RGBA and greyscale-alpha pixels retain their alpha channels.
The GIF adapter accepts opaque frames only and refuses transparency instead
of silently flattening it. Dimensions must fit its 16-bit fields, and frame
delays must be finite, nonnegative and fit 16-bit centiseconds after rounding.

Selected final PNG outputs have been independently decoded for exact bytes,
text and ECC. Internal grid round trips and package tests do not establish
camera, browser accessibility, arbitrary image decoding, animation/customisation
safety or production acceptance. This package is not a deployed service and
does not replace the separate capability modules.

[SVG output qualification](docs/validation/svg-output-633f023/README.md)
records the selected source, final files, independent decoding results and
optional reproduction tools. These tools are separate from the product's
runtime and core source checks.

## Development

Requires **Node.js 22 or later** and TypeScript tooling. The package provides these scripts:

```sh
npm run typecheck
npm test
npm run test:conformance
```

Use the pinned Node/npm versions and locked installation in [`docs/toolchain.md`](docs/toolchain.md). See [`package.json`](package.json) for the exact commands and [`tsconfig.json`](tsconfig.json) for compiler settings. These source checks use this checkout and its locked development dependencies, with no sibling project checkout or running service required.

This checkout provides capability source and conformance tests, with no application build, start or deployment command. It is not a standalone deployment of the ANQR web application. The current development source is this repository's `develop` branch for the capability modules and selected in-process artifact package. [Source selection](docs/source-selection.md) records that settled scope, the retained-history boundaries and the no-transfer decision; it does not grant new redistribution rights or adopt the historical application. Source checks do not establish working browser/API/MCP journeys or staging/production readiness.
