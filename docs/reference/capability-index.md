# Source and API entry-point index

Use this index to find the source that owns a capability, not to infer a deployed
service or a stable SDK surface. The [artifact package guide](../../packages/artefact/README.md)
contains the supported in-process producer example; [project setup](../toolchain.md)
defines the pinned source checks.

## Source edition and limits

This index covers all **59 tracked TypeScript source files** at
`af6a23dd735a9cc92c29dd8db496e04aaaf73003`, tree
`f281802c246d4555d013e6b0826eeab8b02a4922`: 39 capability modules and 20 artifact-package files.
Tests, validation scripts and configuration remain separate from this source-file index.

The export column counts top-level exported declarations and re-export statements
observed by the TypeScript 5.9.3 parser. It includes types, interfaces, values and
functions, not only callable functions; aliases and re-exports are not resolved
into a count of unique APIs. The 1,329 observed entries are a navigation aid, not
test coverage, complete semantic review, application integration or production evidence.
All parsed export statement shapes were accounted for.

## Start with the real producer

- [Application producer](../../packages/artefact/src/application/produce-artefact.ts):
  use `createArtefactProducer` and handle production and export results separately.
- [Specification join](../../packages/artefact/src/model/artefact-specification.ts):
  supplied-value types and parameter combination checks.
- [PNG adapter](../../packages/artefact/src/adapters/png-container.ts),
  [SVG adapter](../../packages/artefact/src/adapters/svg-container.ts) and
  [GIF adapter](../../packages/artefact/src/adapters/gif-container.ts): match the
  injected container to the selected format and preserve its refusal behavior.
- The [artifact guide](../../packages/artefact/README.md#adapters-and-interface-boundaries)
  distinguishes application result types from similarly named declaration-only ports.
- The [PNG input reference](png-input.md) documents the separate image decoder's
  result contract, admitted subset and parser/resource limits.
- The [container encoding reference](container-exports.md) distinguishes direct
  PNG/SVG/GIF port results, rejection conditions and format-specific limits.

These are source entry points, not a server, camera pipeline, separately published
npm package or permission to import the retained historical application.

## Capability modules

The modules below are independent capability models and conformance contracts.
Their HTTP, MCP, responsive, accessibility or trust names do not establish a
deployed endpoint, rendered interface, measured observation or live provider.
Follow the actual source consumer and owning issue before making such a claim.

The [HTTP and MCP model reference](delivery-models.md) documents their in-process
inputs, outcomes, audit semantics and unimplemented transport/security boundaries.

### Analysis

| Source module | Export entries |
| --- | ---: |
| [payloadclassification](../../src/capabilities/analysis/payloadclassification.ts) | 34 |
| [qrdecoding](../../src/capabilities/analysis/qrdecoding.ts) | 45 |
| [scansafetyvalidation](../../src/capabilities/analysis/scansafetyvalidation.ts) | 42 |
| [structuralinspection](../../src/capabilities/analysis/structuralinspection.ts) | 35 |
| [unsafecustomisationdiagnosis](../../src/capabilities/analysis/unsafecustomisationdiagnosis.ts) | 28 |

### Creation

| Source module | Export entries |
| --- | ---: |
| [encodingcontrolsurface](../../src/capabilities/creation/encodingcontrolsurface.ts) | 27 |
| [qrartefactcreation](../../src/capabilities/creation/qrartefactcreation.ts) | 73 |
| [scansafeoutput](../../src/capabilities/creation/scansafeoutput.ts) | 15 |

### Distribution

| Source module | Export entries |
| --- | ---: |
| [artefactexport](../../src/capabilities/distribution/artefactexport.ts) | 22 |
| [httpapidelivery](../../src/capabilities/distribution/httpapidelivery.ts) | 22 |
| [mcpdelivery](../../src/capabilities/distribution/mcpdelivery.ts) | 52 |
| [shareablerepresentation](../../src/capabilities/distribution/shareablerepresentation.ts) | 23 |

### Enterprise

The [enterprise model reference](enterprise-model.md) describes invocation, audit,
perimeter and readiness behavior without implying hosted or authenticated services.

| Source module | Export entries |
| --- | ---: |
| [programmaticgeneration](../../src/capabilities/enterprise/programmaticgeneration.ts) | 42 |

### Experience

| Source module | Export entries |
| --- | ---: |
| [accessibleinteraction](../../src/capabilities/experience/accessibleinteraction.ts) | 15 |
| [capabilitygallery](../../src/capabilities/experience/capabilitygallery.ts) | 17 |
| [guidedonboarding](../../src/capabilities/experience/guidedonboarding.ts) | 23 |
| [responsivewebdelivery](../../src/capabilities/experience/responsivewebdelivery.ts) | 39 |

### Localisation

| Source module | Export entries |
| --- | ---: |
| [bidirectionaltextsupport](../../src/capabilities/localisation/bidirectionaltextsupport.ts) | 16 |
| [communitytranslationcontribution](../../src/capabilities/localisation/communitytranslationcontribution.ts) | 23 |
| [interfacelocalisation](../../src/capabilities/localisation/interfacelocalisation.ts) | 22 |
| [localenegotiation](../../src/capabilities/localisation/localenegotiation.ts) | 9 |
| [localetypography](../../src/capabilities/localisation/localetypography.ts) | 26 |
| [localisedstaticcontent](../../src/capabilities/localisation/localisedstaticcontent.ts) | 49 |
| [multilingualdiscoverability](../../src/capabilities/localisation/multilingualdiscoverability.ts) | 31 |

### Payload

| Source module | Export entries |
| --- | ---: |
| [custompayloaddefinition](../../src/capabilities/payload/custompayloaddefinition.ts) | 14 |
| [paymentpayloadrepresentation](../../src/capabilities/payload/paymentpayloadrepresentation.ts) | 18 |
| [productidentitypayload](../../src/capabilities/payload/productidentitypayload.ts) | 116 |
| [structuredpayloadrepresentation](../../src/capabilities/payload/structuredpayloadrepresentation.ts) | 58 |

### Presentation

| Source module | Export entries |
| --- | ---: |
| [animatedartefact](../../src/capabilities/presentation/animatedartefact.ts) | 31 |
| [brandoverlay](../../src/capabilities/presentation/brandoverlay.ts) | 26 |
| [outputrendering](../../src/capabilities/presentation/outputrendering.ts) | 18 |
| [qrartwork](../../src/capabilities/presentation/qrartwork.ts) | 28 |
| [visualcustomisation](../../src/capabilities/presentation/visualcustomisation.ts) | 41 |

### Quality

The [performance-budget model reference](performance-budget-model.md) explains
classification, sample validation, cumulative readiness and their different limits.
The [deterministic-output model reference](deterministic-output-model.md) separates
seeded bytes and checksum helpers from real image encoding and byte comparison.

| Source module | Export entries |
| --- | ---: |
| [deterministicoutput](../../src/capabilities/quality/deterministicoutput.ts) | 21 |
| [performancebudget](../../src/capabilities/quality/performancebudget.ts) | 29 |
| [roundtripcorrectness](../../src/capabilities/quality/roundtripcorrectness.ts) | 37 |

### Trust

| Source module | Export entries |
| --- | ---: |
| [anonymousgeneration](../../src/capabilities/trust/anonymousgeneration.ts) | 14 |
| [payloadconfidentiality](../../src/capabilities/trust/payloadconfidentiality.ts) | 14 |
| [remoteassetsafety](../../src/capabilities/trust/remoteassetsafety.ts) | 32 |

## Artifact package internals

Direct source links do not make every internal helper a supported public SDK.
Prefer the application producer and the guide above; keep injected ports and
encoding/decoding internals distinct.

| Source file | Export entries |
| --- | ---: |
| [adapters/gif-container.ts](../../packages/artefact/src/adapters/gif-container.ts) | 2 |
| [adapters/pixel-surface.ts](../../packages/artefact/src/adapters/pixel-surface.ts) | 1 |
| [adapters/png-container.ts](../../packages/artefact/src/adapters/png-container.ts) | 3 |
| [adapters/png-image-source.ts](../../packages/artefact/src/adapters/png-image-source.ts) | 1 |
| [adapters/svg-container.ts](../../packages/artefact/src/adapters/svg-container.ts) | 1 |
| [adapters/system-clock.ts](../../packages/artefact/src/adapters/system-clock.ts) | 2 |
| [application/produce-artefact.ts](../../packages/artefact/src/application/produce-artefact.ts) | 11 |
| [model/artefact-specification.ts](../../packages/artefact/src/model/artefact-specification.ts) | 10 |
| [ports/clock.ts](../../packages/artefact/src/ports/clock.ts) | 1 |
| [ports/container-encoder.ts](../../packages/artefact/src/ports/container-encoder.ts) | 3 |
| [ports/image-source.ts](../../packages/artefact/src/ports/image-source.ts) | 4 |
| [ports/inspect-artefact.ts](../../packages/artefact/src/ports/inspect-artefact.ts) | 4 |
| [ports/produce-artefact.ts](../../packages/artefact/src/ports/produce-artefact.ts) | 5 |
| [ports/raster-surface.ts](../../packages/artefact/src/ports/raster-surface.ts) | 2 |
| [qr/decode.ts](../../packages/artefact/src/qr/decode.ts) | 2 |
| [qr/encode.ts](../../packages/artefact/src/qr/encode.ts) | 11 |
| [qr/galois.ts](../../packages/artefact/src/qr/galois.ts) | 7 |
| [qr/matrix.ts](../../packages/artefact/src/qr/matrix.ts) | 8 |
| [qr/reed-solomon.ts](../../packages/artefact/src/qr/reed-solomon.ts) | 4 |
| [qr/spec.ts](../../packages/artefact/src/qr/spec.ts) | 20 |

## Keeping this index truthful

When the accepted source changes, enumerate the tracked source files and refresh
this index from that exact commit. Do not count tests, examples or filename matches
as implemented behavior. Reuse existing qualification at its stated revision and
scope; do not rerun product suites just to regenerate an export inventory.

Broader behavioral contracts, code-reference coverage and the original state-machine
inventory remain separate work. This index neither supersedes those documents nor
settles their original custody or acceptance.
