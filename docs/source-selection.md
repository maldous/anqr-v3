# Current development source selection

## Selected scope

The current development source for ANQR's capability modules and selected
in-process artifact package is `maldous/anqr-v3`, on `develop`. The selection
was recorded against accepted development source
`a5d22b0c50216ba0d5c4823c4da382d25aa467e3`; later changes retain their own
source, review and qualification evidence. This completed choice is not held
behind an unspecified future whole-application or rights decision.

The selected package stays in [`packages/artefact/`](../packages/artefact/README.md).
Its incorporation through [PR16](https://github.com/maldous/anqr-v3/pull/16)
produced development commit `633f023d46affc185031aaf5ab7398874e067fe4`.
The [repository entrypoint](../README.md#artifact-package) identifies its
`92ba820dd63e7461928bdeddfd8a430c4cc10a74` source and the selected UTF-8 ECI,
capacity and later input/output corrections. The package is an in-process
TypeScript producer with injected raster, container and clock ports, not a
separately selected service or published npm distribution.

The capability modules and this package are distinct surfaces. Package
incorporation does not replace the capability modules or adopt the historical
application, architecture projections or deployment.

## Retained histories are not blanket adoption

The earlier V1 history at `25e5632d1a788d9e879fb6d0bdfc8337a4012c54`,
the V3 source at `92ba820dd63e7461928bdeddfd8a430c4cc10a74` and the
[translation repository](https://github.com/maldous/anqr-i18n) remain separate
provenance. Selecting the bounded package does not import every component of
those histories or establish their complete coverage, translation mapping or
current consumer applicability. Historical unavailable work remains
unfulfilled; no corpus or mapping is inferred from repository links.

## Transfer and rights boundaries

The selected package is retained in place. No external source transfer is
selected, and this development-source decision asserts no new redistribution
or licence grant. A repository link, ancestry, source check or clean tree is
not evidence of additional rights.

If a particular additional component is selected later, assess that component's
actual authorship, upstream revision, applicable notices and change obligations,
destination and current consumer. Record its concrete qualification needs in
that work. These component-specific questions do not reopen the already-settled
development source or package incorporation.

## Qualification boundary

Use the [pinned development checks](toolchain.md) for their recorded source
scope and the package's own documentation for its interfaces and limits.
Existing tests and independent artifact results keep their exact original
revisions and acceptance scope; this source-selection record does not rerun or
extend them.

This repository provides capability source, the selected package and conformance
tests. The selection does not establish a deployed ANQR application, working
camera/browser/API/MCP journeys, whole-product acceptance or staging/production
readiness. No dependency, product implementation or runtime change follows from
this documentation.
