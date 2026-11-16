# Round-trip correctness model

This reference describes the in-memory
[quality capability](../../src/capabilities/quality/roundtripcorrectness.ts), not
QR image encoding or an independent scanner. Its body is a delimited string,
stored inside an object field named `checksum`. A successful audit compares that
string's decoded request with the supplied options. It does not establish that
an emitted PNG, SVG, GIF, QR grid, camera frame or deployed service is correct.
The separate [artifact package](../../packages/artefact/README.md) has different
producer, container and decoding contracts.

## Types and entry points

`CreationOptions` contains a payload and an explicit ECC level (`L`, `M`, `Q` or
`H`), with optional style, overlay, artwork and animation. The ten declared
payload kinds are text, URL, email, phone, SMS, Wi-Fi, vCard, geo, event and
crypto. Their names do not imply that the content is parsed as those formats.

`createArtefact(options, audit)` returns either `{ success: true, artefact }` or
`{ success: false, error }`. An artefact has `version`, `payload` and `checksum`;
it is not a byte buffer, image or QR matrix. A failure error carries a code,
message and `role: 'alert'`. That role is data, not proof of a rendered alert.

| Public function | Actual scope |
| --- | --- |
| `isPayloadKind`, `isErrorCorrectionLevel` | Primitive string membership in the declared lists. |
| `validatePayload` | Declared kind, nonempty string content and string-valued enumerable metadata entries. |
| `validateStyle`, `validateOverlay`, `validateArtwork`, `validateAnimation` | Selected fields and enumerated values described below. |
| `encodeArtefact` | Serializes the supplied request; it does not call the validators. |
| `decodeArtefact` | Parses the model's string body; throws on selected malformed structures. |
| `createArtefact` | Ordered validation, encoding, candidate construction and the supplied audit callback. |
| `proveRoundTrip`, `defaultAudit` | The same canonical embedded-body comparison, not image decoding or cryptographic authentication. |
| `validateRoundTripVectors` | Creates each current vector with `defaultAudit` and returns individual outcomes. |

## Validation and creation order

Creation checks payload, ECC, style, overlay, artwork and animation in that order.
The first returned validation failure stops creation before encoding or audit.
Payload content is checked for nonzero length, not trimmed or semantically
validated. Metadata values must be strings; the helper does not define a schema
for metadata keys or validate a URL, payment address or contact document.

Style checks nonblank foreground/background strings and the declared eye/module
shapes. Artwork similarly checks nonblank color strings and its timing-pattern
name. Neither validates CSS syntax, contrast, geometry or scan safety. Animation
checks a boolean enabled flag and one of `slow`, `normal`, `fast`; it does not
render frames or measure their timing.

An overlay logo needs nonempty string data and numeric size greater than zero
under the current comparison. The validator does **not** require finite size:
`NaN` is not caught by `size <= 0`, and positive infinity is not excluded. The
decoder rejects a parsed `NaN`, and the canonical comparison may refuse a
non-round-tripping request, but that is not strict finite-input validation.
Frame label/color strings must be nonblank; logo data is not decoded as an image.

These are typed TypeScript helpers, not a complete runtime schema for arbitrary
objects. Nulls, wrong object shapes, getters or serialization errors may throw.
Only the audit invocation is wrapped by creation's exception handler; do not
assume every invalid runtime value becomes a declared failure outcome.

After validation, creation serializes the body and constructs an artefact with
version `1`, the **original payload reference**, and `<prefix>::<body>` in
`checksum`. The prefix is a deterministic, noncryptographic 32-bit rolling hash.
It is not a signature, MAC or collision-resistant integrity check.

The caller must supply the audit. Creation does not secretly run `defaultAudit`
in addition to it: a callback that always returns success can admit a candidate
without a proof. An audit failure's error is returned, while an audit exception
becomes `ROUNDTRIP_MISMATCH`. The callback receives the original options and
candidate, not frozen copies. It can retain or mutate references and perform
side effects; the creator cannot roll those back or guarantee purity.

## Body format and decoder limits

The encoder emits `kind:content`, optional `#<JSON metadata>`, `|EC=<level>` and
optional `|S=`, `|O=`, `|A=` and `|M=` segments. Nested customization fields use
semicolons and, for overlay fields, slashes. It does **not** escape delimiters.
A payload or metadata string containing `|` or `#`, or a customization string
containing a structural delimiter, may fail or change the parsed request. The
canonical audit refuses a resulting mismatch; this is not an arbitrary-string
round-trip guarantee or a versioned external interchange format.

`decodeArtefact` returns payload, ECC and any parsed customizations. Missing ECC
defaults to `M`. Unknown tags and segments without a usable `=` are ignored;
repeated recognized tags overwrite earlier values. Selected enum/field-count
errors and malformed metadata JSON throw. The decoder is not a strict validator
of every value it returns: metadata is type-asserted after JSON parsing, colors
are not validated, and parsed logo sizes are checked for `NaN`, not positivity
or finiteness. Direct decoding does not rerun creation's validators.

Do not feed unbounded hostile strings expecting allocation, recursion, parser
budget, authentication or denial-of-service guarantees from these helpers.
There is no input-size limit or external isolation boundary in this module.

## What the public proof audits compare

`proveRoundTrip` delegates to `defaultAudit`. The canonical audit finds the first
`::` in `artefact.checksum`, decodes the following body and compares it with the
**supplied request**. A missing separator, selected decoder exception or unequal
request yields `ROUNDTRIP_MISMATCH`. It does not reconstruct the body from the
artefact's public payload shadow.

Comparison checks payload kind/content, metadata entries, ECC and the declared
fields of every optional customization. Absent metadata and an empty metadata
record compare equally; metadata insertion order does not affect this comparison.
Optional customization absence versus presence is significant. Additional
undeclared object properties are not a separately validated contract.

The audit does not recalculate/authenticate the prefix, check artefact version,
compare its public payload shadow or inspect real image bytes. A matching body
with an arbitrary prefix or different version can pass. Treat this as local
request equivalence, not tamper evidence or proof of artifact provenance. The
[deterministic-output model](deterministic-output-model.md) has separate byte and
checksum helpers, also with explicitly bounded guarantees.

## Vector inventory and evidence

The declared matrix contains ten payload kinds and four ECC levels. Each pair
has one bare vector, three each for style/overlay/artwork/animation, and one
combined vector: 560 entries by source construction. These are representative
fixtures, not every string, customization combination, Unicode edge case,
malformed input or real output artifact. `readonly` types do not freeze the
exported lists, vectors or shared nested fixture objects at runtime.

`validateRoundTripVectors` iterates the current exported matrix, calls creation
with `defaultAudit`, and returns a report retaining each vector reference. It
does not aggregate a release verdict, repair failures, invoke a scanner or
protect a modified fixture matrix from throwing before audit.

The [existing conformance source](../../tests/conformance/quality/roundtripcorrectness.conformance.test.ts)
checks the declared matrix, selected decoded facets, failure/throwing audit
handling and kind/ECC/customization coverage. The
[new public-proof contracts](../../tests/conformance/quality/roundtrip-proof.conformance.test.ts)
exercise the embedded-body helper's positive and negative boundaries, including
its deliberate non-authentication limits. These descriptions identify source
oracles, not a new test run. Consult the exact issue/PR qualification receipts
for executed revisions and outcomes. No source test or this reference completes
independent image decoding, CRC/Reed–Solomon verification, camera/browser journeys,
the original native receiving work, or production ANQR acceptance.
