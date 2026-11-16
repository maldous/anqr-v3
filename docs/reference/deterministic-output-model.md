# Deterministic-output capability model

This reference describes
[`deterministicoutput.ts`](../../src/capabilities/quality/deterministicoutput.ts)
at accepted ANQR commit `15560f7de102788784aa68f02769ab73b40c2bd2`.
It is a **seeded byte-sequence model**, not an image/QR encoder, renderer,
cryptographic random generator or production artifact pipeline. For actual
in-process QR production and container encoding, use the
[artifact package](../../packages/artefact/README.md) and
[container reference](container-exports.md).

## Declared request and factory

`DeterministicRequest` contains `artwork`, numeric `seed`, `format` and `quality`,
with optional `animation` and `dithering`. Artwork declares colors, dimensions
and style; animation declares duration/easing/loop; dithering declares
algorithm/intensity. These types are not a runtime schema validator.

`createDeterministicRequest(artwork, seed, format, quality, animation, dithering)`:

- Defaults format to `png` and quality to `85` (`DEFAULT_FORMAT` and
  `DEFAULT_QUALITY`). `SUPPORTED_FORMATS` lists `png`, `jpeg`, `webp`, `gif`.
- Rejects a format outside that list and quality below 1 or above 100. These are
  range comparisons, not a finite-number or integer check: fractions in range
  pass, and `NaN` is not rejected by those comparisons.
- If supplied, checks animation easing against `linear`, `ease-in`, `ease-out`,
  `ease-in-out`, and dithering algorithm against `none`, `floyd-steinberg`,
  `ordered`. The corresponding exported arrays/type aliases expose these values.
- Returns the declared fields, including truthy optional objects, with original
  artwork/animation/dithering references. It does not validate the seed's finite/
  integer domain, artwork structure, duration, dimensions, loop or intensity.

No default or listed format makes the returned bytes a valid image of that type.
The request, nested objects and output arrays are not frozen by readonly types.

## Processing, bytes and result shape

`processDeterministicRequest(request, auditFn?)` first calls the optional audit
with the original request. If `passed` is false, it returns
`{ success: false, error: { code: 'AUDIT_FAILURE', message, undeclaredInput } }`.
The message joins the reported violations; `undeclaredInput` is their first entry.
This callback can inspect or mutate the request and can throw; no snapshot,
same-reference check, exception-to-result conversion or rollback is provided.

Processing then requires `typeof seed === 'number'` and truthy artwork. It rejects
the first extra **own enumerable string key** outside artwork/animation/dithering/
seed/format/quality, returning `UNDECLARED_INPUT` and the offending field name.
This does not inspect symbols/non-enumerable or inherited properties, validate
all nested values, or repeat the factory's format/quality/easing checks.
`typeof number` alone does not reject nonfinite seeds.

On success, the shape is `{ success: true, output }`, where `output` has:

- `bytes`: a new `Uint8Array` of **exactly 1,024 bytes** from the numeric seed.
- `checksum`: eight lowercase hexadecimal characters from a 32-bit FNV-1a checksum
  of those bytes, not a cryptographic digest or uniqueness guarantee.
- `metadata`: `format:...`, `quality:...`, `seed:...`, `checksum:...` strings.
  These labels are not verified image properties or a privacy-filtered record.

The generator serializes artwork/animation/dithering/format/quality with
`JSON.stringify`, but the resulting `paramString` is **not used** to generate the
bytes. Only the seed drives the recurrence and byte extraction. With stable
ordinary inputs and an unchanged seed, changing those other fields does not
change the generated sequence, although metadata, audit or serialization may
differ or fail. No artwork rendering, animation, dithering or image compression
is performed. Serialization/getter/`toJSON` errors are not caught.

## The optional audit is a heuristic

`auditDeterministicSurface(request)` lowercases the serialized request and looks
for substrings: timestamp, date, random, Math.random, performance, process.hrtime,
Date.now and crypto.getRandomValues, case-insensitively. Matches in **values as
well as keys** become violations, including innocent text containing a substring.
It additionally checks the named easing/algorithm of truthy animation/dithering.
It returns `{ passed: violations.length === 0, violations }`.

The audit does not intercept clocks/random sources, authenticate declared inputs,
detect all nondeterminism, check nested ranges or establish a secure sandbox. Direct processing skips it unless a callback is explicitly supplied.
Its serialization and property accesses can throw or invoke caller behavior.

## Byte comparison and checksum repetition are different

`validateByteIdenticalOutput(requests)` processes every request with the built-in
`auditDeterministicSurface`. A processing refusal throws `Processing failed: ...`;
other thrown errors also propagate. On completion it returns
`{ identical, outputs }`, retaining all successful generated outputs.

Identity compares each byte array's length and contents against the first array,
**not checksums, metadata or complete request equality**. Empty and single-request
collections return `identical: true`; an empty collection has no outputs. A byte
mismatch sets false but does not stop later processing. Thus equal bytes with
different metadata still count as identical, while a checksum collision cannot
hide different bytes. Caller collection size is not bounded here.

`repeatableDeterminismTest(baseRequest, iterations = 3)` repeatedly processes the
request with the same audit, collecting **checksums only**. It throws on a refusal
with the iteration number and message, otherwise returns `{ consistent,
checksums }` by comparing checksum strings with the first. It is not the byte-
comparison helper and supplies no collision resistance or real workload benchmark.

The iteration argument is not validated: the integer counter uses `i < iterations`.
Zero/negative/`NaN` cause no iterations and vacuous consistency; a positive fraction
can cause a rounded-up number of iterations. An unbounded value can prevent
completion. Callers must supply their own finite, suitably bounded iteration count;
no pathological-input execution is needed to rely on this source-level warning.

## Retained qualification and limits

The [conformance source](../../tests/conformance/quality/deterministicoutput.conformance.test.ts)
contains five existing cases: same-request byte identity, undeclared top-level
input refusal, selected factory variants, a fixed FNV checksum collision with
unequal bytes, and empty/equal/different collections. The collision fixture uses
seeds 58813 and 130364 with checksum `7930afb9`; it is retained source evidence,
not a newly run test or checksum-uniqueness promise.

This guide changes no implementation, test, seed policy or format support and
replays no accepted checks. It does not establish real image validity, QR
scannability, security/privacy, cross-runtime artifact equivalence or deployed
behavior. Those product/source obligations remain in
[UIF-205](https://linear.app/maldous/issue/UIF-205); this bounded consumer-reference
increment belongs to [UIF-265](https://linear.app/maldous/issue/UIF-265), not original
native creation/scannability or reserved state-machine receiving work.
