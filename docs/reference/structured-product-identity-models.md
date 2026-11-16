# Structured payload and product identity models

These are two independent in-process models, not a shared schema, QR encoder,
barcode scanner, GS1 certification service or deployed API. This reference binds
to accepted `maldous/anqr-v3` commit
`036a403ab1e7f82b72e3c6006937532e1657f2a3`, tree
`f05910bb9af8742c6ebc0d832f9f3f85d62e9759`. It does not adopt another candidate
or change either model.

| Source | Consumer contract |
| --- | --- |
| [structuredpayloadrepresentation.ts](../../src/capabilities/payload/structuredpayloadrepresentation.ts) | 21 field-based payload kinds, editing/presentation state, string encoding and heuristic classification. |
| [productidentitypayload.ts](../../src/capabilities/payload/productidentitypayload.ts) | HTTP(S) path-key recognition and several result/predicate wrappers around a local Digital Link parser. |

The names overlap but the values do not: structured `product_identity` holds
`{ code, format }` and encodes a string such as `EAN13:<code>`. The other module
accepts selected HTTP(S) paths as `gs1_digital_link`, with `plain_url` used by
constructors and negative classification wrappers. Neither calls the other.
Use separate module namespaces when importing their identically named types or
`parsePayload`/`validatePayload`-like operations. The
[artifact package](../../packages/artefact/README.md) has its own production and
export results; neither model produces its image bytes.

## Structured fields: declared schema is not complete validation

`Payload` contains `kind` and string-valued `values`; `PayloadState` adds the
literal state identifier and a separate presentation object. `getPayloadSchema`
returns a new wrapper around the shared fields array; `getFieldsForKind` returns
that array directly. The following lists the exact declared field names, with
required fields in the middle column. Optional means absence or `''` is allowed.

| Kind | Required fields | Optional fields |
| --- | --- | --- |
| `plain_text` | `text` | None |
| `url` | `url` | None |
| `tel` | `number` | None |
| `email` | `address` | `subject`, `body` |
| `sms` | `number` | `message` |
| `geo` | `latitude`, `longitude` | None |
| `vcard` | `name` | `organization`, `title`, `phone`, `email`, `url`, `address` |
| `mecard` | `name` | `phone`, `email`, `url`, `address` |
| `bizcard` | `name`, `company` | `title`, `phone`, `email`, `url`, `address` |
| `wifi` | `ssid`, `security` | `password`, `hidden` |
| `app_link` | `platform`, `url` | `fallback` |
| `event` | `title`, `start` | `end`, `location`, `description` |
| `event_rsvp` | `event_id`, `response` | None |
| `calendar_subscription` | `url` | None |
| `social_profile` | `network`, `username` | None |
| `messaging_link` | `service`, `handle` | None |
| `short_link` | `url` | None |
| `utm_link` | `url`, `source`, `medium`, `campaign` | None |
| `custom` | `content` | None |
| `payment` | `scheme`, `address` | `amount`, `currency` |
| `product_identity` | `code`, `format` | None |

`validatePayload` visits declared fields in schema order and returns the first
`field_error` or `format_error`, or `{ success: true, kind }`. It neither rejects
extra fields nor validates an unknown runtime kind before iterating its schema.
Required checks reject only `undefined` and the empty string, not whitespace in
general. Property access, getters, wrong runtime types or unknown kinds can
throw. TypeScript string/readonly declarations are not a hostile-input boundary.

Format checks dispatch by **field name**, not a complete per-kind standard:

- `url` uses an HTTP(S), no-whitespace regex, except `app_link`, which permits a
  scheme followed by `://`. This validator does not run the classifier's URL
  parser, check reachability or establish a trusted destination. `fallback` has
  no corresponding URL check.
- `number`/`phone` allow an optional leading `+` and 3–20 digits, spaces,
  hyphens or parentheses. `email` uses a simple address regex, but the `email`
  kind's required field is named `address`, so it does **not** get that check.
  An address can validate here and fail later `mailto:` classification.
- Coordinates need signed decimal text and latitude/longitude range checks.
  Date/time fields need only the stated digit layout, not a real date, timezone,
  chronological order or calendar validity. Amounts permit negative decimals;
  currency checks only three uppercase letters, not a registered currency.
- Wi-Fi security is exactly `WPA`, `WEP` or `nopass`; hidden is `true`/`false`.
  Platforms are `ios`/`android`/`web`; RSVP values are `yes`/`no`/`maybe`.
  Barcode format is one of `EAN13`, `EAN8`, `UPCA`, `UPCE`, `CODE128`, `CODE39`.
  Code digits, lengths, check digits, product ownership and GS1 rules are not
  checked. Payment address alone has an additional nonblank check for payment.

Errors carry `kind`, a namespaced `identifier`, `field` and `reason`.
`selectKind` can return `unknown_kind`; `applyFieldValue` can return
`undeclared_field`. Those guards do not make every other helper runtime-safe.
The undeclared-field error includes the supplied field name and current kind;
do not treat selected non-value-echoing messages as a general redaction policy.

## Editing, presentation and callback order

| Callable exports | Actual behavior |
| --- | --- |
| `createEmptyPayload`, `createPayloadState` | Empty values or a state wrapper; no whole-payload validation. State retains the supplied presentation/payload references. |
| `setField` | Shallow-copy values and set any name, without declaration/format checks; optional audit receives original and candidate before return. |
| `selectKind` | Check kind membership, discard all old values, retain presentation, then optionally audit old/new payload. It does not fill or validate required fields. |
| `applyFieldValue` | Check declaration and only that field's value, shallow-copy values, optionally audit, then return a new state. Other required fields can still be missing. |
| `createPresentation` | Defaults: black foreground, white background, medium module size, ECC M. Colors must be nonblank; module/ECC values are only truthiness-checked at runtime. No CSS, contrast, QR geometry or enum membership validation. |
| `withPresentation` | Run updater first on the original presentation, then optional presentation audit; retain payload. |
| `changePresentation` | Run optional payload audit first with the same payload twice, then presentation updater; retain payload. This audit is not a before/after presentation audit. |
| `presentFields` | Return one new entry per declared field, with shared field metadata, current value or `''`, and `visible: true`. No UI is rendered. |
| `getPayloadSchema`, `getFieldsForKind`, `isPayloadKind` | Shared schema discovery and current exported-list membership, not safe schema parsing of arbitrary values. |

These optional audit callbacks return `void`, not an acceptance result. Exceptions
propagate; there is no rollback of callback effects or mutation of referenced
objects. Fresh outer state/value objects are not deep copies. No helper freezes
schemas, exported vectors, presentation, payload or audit inputs at runtime.

## String encoding and classification are different checks

`encodePayload` does not call validation or encode a QR symbol. It returns text
using the supplied fields, substituting empty strings for missing values. Plain
text and URL-like kinds can be returned directly; other branches assemble
`tel:`, `mailto:`, `smsto:`, `geo:`, contact/event blocks, Wi-Fi text, generic
social/messaging pairs, `CUSTOM:`, payment or barcode-like strings.

It does not generally escape delimiters or newlines. The UTM branch uses
`URLSearchParams` for its three parameter values, but appends a new `?` to the
unmodified base instead of merging an existing query/fragment. Email subject/body
and app fallback are declared fields but omitted by their encoder branches.
Presentation is not consumed by this encoder. No output length budget,
standards-conformance guarantee or safe arbitrary-string round trip is supplied.

`classifyEncoded` trims input, runs ordered heuristics and always returns
`{ success: true, kind, matches }`. `kind` is the first match, defaulting to
`plain_text`; empty/whitespace input has that default with an empty `matches`
array. A nonempty unrecognized string gets `plain_text` as a match. Successful
classification is not validation or proof of an original kind.

Several matches can coexist: UTM, known short-link host and `.ics` path matches
precede generic URL; generic social and messaging matches share a regex. The
short-host list is fixed, not a network lookup or reputation decision. Contact
heuristics require selected nonempty fields, not complete document grammar;
payment recognizes only uppercase `BITCOIN`, `ETH`, `PAY`, while barcode
classification checks a known prefix and nonblank remainder, not check digits.
Thus a valid schema value need not classify back, and membership in `matches`
does not prove lossless recovery of values. There is no decoder here.

`fingerprintPayload` computes SHA-256 of `encodePayload(payload)` using
`node:crypto`. It does not include presentation or all declared fields, salt or
authenticate the hash, conceal low-entropy payloads, or establish equality of
the original objects. Encoder collisions/omitted fields retain that limitation.

### Vector helpers and import-time work

| Callable exports | Which source oracle is used |
| --- | --- |
| `verifyValidationVectors`, `demo` | Current representative/near-miss map; representative validation then encoded-kind membership, and near-miss validation failure or absence of its kind from matches. |
| `verifyPayloadVectors` | Separate valid/invalid map; valid encoding/classification without first validating it, plus invalid validation or classification rejection. |
| `selfCheckPassed`, `selfCheckReport`, `selfCheckFailures` | Results captured once by module-level `runSelfCheck()` at import, not a fresh recheck on each call. Report returns the retained array. |
| `assertValidationVectors`, `runValidationSubtest` | Fresh representative acceptance, representative kind membership and near-miss rejection rows. The name does not mean the function throws on a false row. |
| `validationAssertionsPassed`, `validationAssertionFailures`, `validationSubtestPassed`, `validationSubtestFailures` | Fresh aggregation of those assertion rows; no independent scanner, artifact or service check. |

Importing this module executes its self-check over the declared 21-kind matrix.
Its names describe selected representative oracles, not exhaustive semantic
coverage. Mutable runtime exports/references can make retained self-check
results differ from a later fresh vector evaluation. This documentation pass
does not import the module or rerun those checks.

## Product identity: what the URI parser actually accepts

`parsePayload` returns `{ success: true, payload }` only for its Digital Link
subset, otherwise `{ success: false, error }`. Despite their names,
`parsePayloadAllowingPlainUrl` and its alias `classifyPayloadKind` still call that
same parser; they do **not** successfully parse ordinary URLs as `plain_url`.
`isWellFormedUri` is a separate HTTP(S)-prefix plus `URL` construction check.

Parsing checks a nonempty HTTP(S) prefix case-insensitively, uses `URL`, splits
the normalized pathname, drops empty path segments, and decodes each remaining
segment with `decodeURIComponent`. If percent decoding throws, it keeps that
segment unchanged rather than refusing it. It requires at least two remaining
segments and an even count, then reads key/value pairs. Query and fragment are
not identifier sources. The returned `uri` is the original supplied string,
not a newly serialized canonical identifier.

Recognized keys are exactly `gtin`, `itip`, `gmn`, `cpid`, `srn`, `giai`, `gln`,
`sscc`, `grai`, `gdti`, `gsrnp`, `gcn`, `csp`, `01`, `10`, `lot`. Key matching is
case-sensitive after decoding. An unknown key or empty value refuses; duplicate
keys overwrite their earlier value while retaining first insertion order in
`identifierKeys`. Every one of these keys is also in `PRIMARY_KEYS`, including
`10` and `lot`. Primary selection uses that fixed set order, not URI order.
It does not require `gtin`/`01`, validate identifier lengths/check digits,
qualifier relationships, canonical numeric-AI mappings or a GS1 resolver host.

`missing_identifier` is a declared branch after primary selection. With the
unaltered current recognized-key and primary sets, accepted nonempty pairs
already provide a primary; do not assume the existing odd-path test exercises
that branch. It fails the earlier `not_digital_link` shape check instead.
Exported key arrays are not runtime-frozen, while the private primary set is
constructed separately; mutation is not a supported way to extend the contract.

This is local string recognition, not a claim of compliance with the full GS1
Digital Link standard, product authenticity, HTTP safety, issuer authorization,
DNS/redirect/reputation checks or a network request. No external standard was
newly qualified by the parser's name or sample vectors.

## Product-identity callable families and result distinctions

The 68 exported functions include many wrappers, not 68 independent parsers.
Check the actual discriminator before accessing payload/keys; negative
`plain_url` wrappers can preserve an **invalid URI**, so that label is not a
well-formedness guarantee. The following accounts for every callable export.

| Entry points | Result / consuming distinction |
| --- | --- |
| `parsePayload`, `parsePayloadAllowingPlainUrl`, `classifyPayloadKind` | `success` with payload or error; strict subset as above, no successful plain-URL fallback. |
| `parseDigitalLinkPayload`, `recogniseDigitalLinkKeys` | `success` result, respectively payload/identifierKeys or keys; retain parser errors. |
| `isWellFormedUri` | HTTP(S) prefix/URL syntax only, no identifier parsing. |
| `assertDigitalLinkContract`, `recogniseDigitalLinkContract`, `acceptDigitalLinkContract`, `acceptDigitalLinkVector` | `accepted` union, not throwing assertions. All retain errors on refusal; the first omits URI/kind wrapper fields, recognition adds URI and accepted kind, acceptance adds negative `kind: plain_url`, vector acceptance uses `vectorKind` instead. |
| `reportDigitalLinkIdentifierKeys`, `reportDigitalLinkVectorKeys`, `getDigitalLinkVectorKeys`, `getDigitalLinkVectorParseKeys` | Parse through their respective wrapper, return keys or `[]`; empty keys alone lose the error/reason. |
| `getDigitalLinkVectorPayload`, `getDigitalLinkVectorParsePayload` | Parse through their wrapper, return Digital Link payload or `null`. |
| `rejectNonDigitalLinkUri` | True only for parser refusal with `not_digital_link`, not every failure such as `invalid_uri`. |
| `isPayloadError`, `isNotDigitalLinkError`, `isInvalidUriError`, `isMissingIdentifierError` | Selected error-shape/code guards; property access can still invoke getters. |
| `classifyProductIdentity`, `isProductIdentityVector` | Parse URI, yield classification string or its positive boolean. |
| `classifyPayloadVector`, `classifyUriVector`, `classifyUriVectorKind`, `classifyDigitalLinkUriVector` | `kind`/`classification` with a payload in both branches; latter three include keys only on success. `classifyUriVectorKind` delegates to `classifyUriVector`. No error retained. |
| `classifyDigitalLinkVector` | `kind`/`classification`, payload in both branches, successful keys and negative error. |
| `isDigitalLinkVector`, `isProductIdentityDigitalLinkVector`, `isProductIdentityDigitalLinkUriVector` | Positive booleans from those URI-parsing wrappers. |
| `classifyProductIdentityVectorByUri`, `isProductIdentityVectorByUri`, `isPlainUrlVectorByUri` | `outcome` plus `{ uri, kind }` vector, positive payload; predicates inspect that outcome. Negative predicate also includes invalid URIs. |
| `validateDigitalLinkVector` | `classification`/`kind`/URI; positive payload/keys, no negative payload or error. |
| `classifyDigitalLinkVectorByKind`, `classifyDigitalLinkVectorKind`, `parseDigitalLinkVector` | All parse the URI despite names: `vectorKind`, payload in both branches, positive keys; first/last use `isProductIdentity`, middle uses `classification`. No negative error. |
| `isDigitalLinkVectorByKind`, `isProductIdentityVectorByKind`, `isDigitalLinkVectorByKindKind`, `isProductIdentityVectorByKindKind`, `isProductIdentityDigitalLinkVectorParse`, `isDigitalLinkVectorParse` | Positive booleans from the corresponding parsing wrapper, not caller-provided kind validation. |
| `classifyDigitalLinkVectorResult`, `isProductIdentityDigitalLinkVectorResult`, `isNotProductIdentityDigitalLinkVectorResult`, `reportDigitalLinkVectorIdentifierKeys` | Parser returns `classification`/`kind`, payload both branches, positive keys. Other functions inspect a **supplied result**, without reparsing or validating its complete shape. |
| `validateDigitalLinkVectorKind`, `isAcceptedDigitalLinkVectorKind`, `isProductIdentityDigitalLinkVectorKind`, `isPlainUrlDigitalLinkVectorKind` | URI parsing yields `isAccepted`/`vectorKind`/`classification`, payload both branches, positive keys; predicates inspect those fields. Negative predicate includes invalid URIs. |
| `isProductIdentityPayload`, `isProductIdentityPayloadKind`, `classifyProductIdentityKind`, `classifyProductIdentityVector`, `classifyVectorByPayloadKind`, `isProductIdentityByVectorKind`, `isProductIdentityByVector`, `classifyPayloadKindVector` | Compare supplied kind with `gs1_digital_link`; vector URI/content is not parsed. The last returns kind plus `isProductIdentity`. |
| `classifyDigitalLinkPayload`, `classifyPlainUrlPayload`, `classifyPlainUrlVector`, `validatePlainUrlVector` | Unconditional positive/negative classification based on the chosen helper; do not validate the input. Plain-vector helper returns `isProductIdentity: false` plus vector; plain validation returns negative classification/kind/URI. |
| `isAcceptedDigitalLinkContract` | Tests only a supplied result's `accepted === true`, not URI or structural authenticity. |
| `makeDigitalLinkPayload`, `makePlainUrlPayload` | Unvalidated constructors, not parser aliases; Digital Link constructor builds a key map, skips empty extra values and retains supplied primary fields/URI without consistency checks. |
| `recordPayloadGuarded` | Caller-audited append described below, not a parser or persistent store. |

`recordPayloadGuarded(state, payload, audit)` calls audit with the original
payload reference. A returned failure or caught audit exception yields
`{ success: false, reason, state }` retaining the original state. An `Error`
exception contributes its message; a non-Error gets a generic string. Success
shallow-copies state and appends the same payload reference to a new `recorded`
array. It does not parse, freeze, persist or prevent audit side effects. Reading a
malformed outcome and building the success result occur outside the audit's
try/catch and can throw; refusal is not a universal exception wrapper.

Both modules can expose supplied values through encoded text, retained payloads,
callback inputs or projected URI/error fields. In particular, product parsing's
unknown-key message includes the decoded key, and guarded recording can expose
an audit exception message. These are not secret-redacting transports. Keep
sensitive payloads out of unapproved logs and destinations.

## Source oracles, evidence and remaining boundaries

The [structured conformance source](../../tests/conformance/payload/structuredpayloadrepresentation.conformance.test.ts)
contains five named cases covering declared kinds/schemas, selected errors,
state/presentation separation, field visibility and representative/near-miss
reports. Its “round trip” assertions are encoded-kind membership, not decoded
field equality. The [product-identity conformance source](../../tests/conformance/payload/productidentitypayload.conformance.test.ts)
contains three named cases for selected acceptance/key wrappers, error guards
and URI/kind classification. They do not exercise every wrapper or certify the
full identifier standard. Test comments and names are not stronger than their
actual assertions.

Both complete modules and these two complete test sources were inspected for
this guide. No product import, dependency install, typecheck, test, HTTP request,
native state access or accepted-suite replay was performed. Existing executed
receipts remain revision-bound; this reference adds no fresh pass claim.

This is bounded consumer documentation under
[UIF-265](https://linear.app/maldous/issue/UIF-265), not completion of the original
state-machine inventory, source-rights decisions, QR/image acceptance, hosted
journeys or production delivery. It changes no runtime, shared index, schema,
native ownership, publisher, dependency or release gate.
