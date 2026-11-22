# Custom and payment payload capability models

This consumer reference covers
[`custompayloaddefinition.ts`](../../src/capabilities/payload/custompayloaddefinition.ts)
and [`paymentpayloadrepresentation.ts`](../../src/capabilities/payload/paymentpayloadrepresentation.ts)
at accepted ANQR commit `036a403ab1e7f82b72e3c6006937532e1657f2a3`.
They are separate in-process string/record models, not QR encoders, payment
processors, national-standard implementations or evidence of a safe destination.
For actual QR production, use the [artifact package](../../packages/artefact/README.md).
The structured-payload and product-identity modules have different contracts and
are not described by this reference.

## Custom payload: unchanged strings, not encoded bytes

`CustomPayload` contains `value: string`. `PayloadResult` is either
`{ success: true, payload: { value } }` or
`{ success: false, error: { message, code } }`.

`createCustomPayload(value)` performs these checks in order:

1. Refuse `value.length > MAX_PAYLOAD_LENGTH` with `CAPACITY_EXCEEDED`.
   The limit is 1,000 JavaScript UTF-16 code units, not Unicode code points,
   encoded bytes or the capacity of a selected QR version/ECC combination.
2. Refuse NUL and code units below 32 except tab, line feed and carriage return,
   with `INVALID_CHARACTER_SET`. Other control ranges and lone surrogates are
   not rejected by this loop. It does not normalize or inspect URL schemes.
3. Compare the result of `decodePayload(encodePayload(value))` to `value`;
   a mismatch would return `ROUND_TRIP_FAILURE`.

Both `encodePayload(value)` and `decodePayload(encoded)` simply return their
input string. The comparison therefore establishes identity through these
two helpers for ordinary string input, not UTF-8 conversion, QR/image decoding,
byte equality after export or an independent round-trip proof. Empty strings
are admitted. A URL-like string is not parsed, rewritten or classified.

The three independent validation functions have deliberately narrower scopes:

| Function | Actual check |
| --- | --- |
| `validateCapacity(value)` | Only the 1,000-code-unit limit. Does not check characters. |
| `validateCharacterSet(value)` | Only the control-code loop. Does not check length. |
| `validateRoundTrip(value)` | Only the identity-helper comparison. Does not check length or characters. |

Each returns the same `PayloadResult` shape. A successful narrow validator is
not equivalent to `createCustomPayload` acceptance.

`auditPayload(value)` calls capacity, character-set and round-trip validation
in that order, stopping on a refusal and returning a boolean.
`createCustomPayloadWithAudit(value, audit = auditPayload)` first calls the
selected audit. A falsey result produces `ROUND_TRIP_FAILURE` with
`Payload failed audit check.`; otherwise it still calls the full
`createCustomPayload` validator. A permissive custom audit cannot bypass its
capacity/character checks. The callback is not sandboxed, and thrown errors
propagate rather than becoming a `PayloadResult`.

These functions expect their declared string inputs. They do not provide a
general untrusted-runtime schema, logging/redaction policy, immutable objects
or a boundary around caller callbacks.

## Payment records: declared fields versus verified standards

`PaymentPayload` contains `scheme: PaymentKind` and an ordered array of
`{ name: string, value: string }` fields. `DECLARED_PAYMENT_KINDS` lists 21
names, but a declared name is not a supported or independently verified payment
implementation. `createSchemeRegistry()` starts with an empty map and no
registered vectors.

`validatePayload(payload)` looks up the scheme in the module's required-field
table, then checks only whether each required **field name** occurs in the
input. The first missing name yields `field_required`; an unknown scheme yields
`unsupported_scheme`. Errors name the scheme and missing field, not their
associated values. Success returns the original payload reference.

| Scheme | Required field names |
| --- | --- |
| `epc_sepa` | `iban`, `beneficiary`, `amount` |
| `upi` | `pa`, `pn`, `am` |
| `paynow` | `payee`, `amount` |
| `promptpay` | `promptpay_id`, `amount` |
| `pix` | `pix_key`, `merchant`, `amount` |
| `swiss_qr_bill` | `iban`, `creditor`, `amount` |
| `qris`, `bharatqr`, `qrph`, `twqr`, `hkqr`, `jpqr`, `emv_generic` | `merchant_id`, `amount` |
| `duitnow` | `duitnow_id`, `amount` |
| `vietqr` | `bank_code`, `account`, `amount` |
| `auspaynet` | `bsb`, `account`, `amount` |
| `crypto` | `address`, `amount` |
| `lightning` | `lnurl`, `amount` |
| `ethereum_eip681` | `address`, `chain_id` |
| `paypal_me` | `handle` |
| `cashapp` | `handle`, `amount` |

This table describes code, not the authoritative specification of any scheme.
Validation does not check values, amounts/currencies, identifiers, duplicate or
extra fields, account existence, registry membership or conformance. An empty
value still supplies a required name. Do not use success as payment authorization
or as proof that another application will accept the result.

## Registry, audits and reporting are different gates

`registerScheme(registry, vector, audit)` audits the original `SchemeVector`
before constructing a new map. An audit throw or falsey `success` returns the
original registry unchanged. On acceptance the new map stores the original
vector under `vector.scheme`, replacing that key if already present.
`lookupScheme(registry, kind)` returns the stored vector reference or `null`.

`assertConformance(registry, kind, audit)` refuses an absent vector or an audit
throw/falsey `success` with `unverified_scheme`. Otherwise it returns
`{ success: true, scheme, claim }`. It delegates the substantive traceability
judgment to the caller's audit; it does not retrieve a published standard or
independently validate a representative. It also does not call `validatePayload`
or require the reporting checks below.

`reportSupported(registry)` and `reportUnverified(registry)` iterate the declared
scheme list. A vector with nonblank `representative` and `classification`
strings is reported supported; absent vectors or blank strings are unverified.
These functions do not rerun an audit or verify the strings' provenance. Their
reporting label alone is not conformance, interoperability or production evidence.
Conversely an accepting conformance audit can return a claim for a stored vector
whose blank strings would still make the reporting functions call it unverified.

Readonly types do not freeze the registry map, vectors, payloads or exported
arrays. Map copying is not deep copying, and callbacks receive original objects.
There is no rollback of caller mutation or external effects. Audit invocation
throws are handled as described, but malformed callback results, getters,
iteration or later property accesses are not a universal exception-to-result
boundary. Keep typed ordinary inputs distinct from untrusted runtime objects.

## Formatting is not validation or standard serialization

`formatPayload(payload, audit)` audits first. An audit throw or falsey `success`
returns `{ success: false, error: { kind: 'format_error', scheme, message } }`
without a `formatted` field. On acceptance it concatenates fields in their
original order as `name=value`, joined with `&`, and prefixes `scheme|`:

```text
scheme|name=value&other=value
```

It does not invoke `validatePayload`, inspect a registry, assert conformance,
escape delimiters or encode any national payment format. Duplicate/extra fields
are retained; embedded `|`, `&` or `=` characters can make this representation
ambiguous. No parser or round-trip guarantee is supplied for it.

The module has no network, account, payment execution or persistence operation.
That local observation is not an end-to-end confidentiality guarantee: the
returned string contains supplied values, and a caller/audit can retain or
transmit them. A successful audit does not provide a sandbox or erase data.

## Evidence and scope

The existing [custom-payload conformance source](../../tests/conformance/payload/custompayloaddefinition.conformance.test.ts)
contains three named cases, and the [payment conformance source](../../tests/conformance/payload/paymentpayloadrepresentation.conformance.test.ts)
contains five. They show selected identity, refusal, registry, audit and reporting
oracles, not exhaustive runtime-shape, Unicode, payment-standard or privacy
qualification. This reference was checked against those sources; it does not
report a new product test run or relabel accepted historical checks.

No source, tests, dependencies or payment semantics are changed by this guide.
It does not settle the separate reputation contract/implementation prerequisite,
native custody or whole-product acceptance. See the [documentation dispositions](../documentation-map.md)
and [source index](capability-index.md) for those independently owned boundaries.
