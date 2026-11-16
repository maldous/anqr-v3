# HTTP and MCP capability-model reference

This reference describes the in-process [HTTP model](../../src/capabilities/distribution/httpapidelivery.ts)
and [MCP model](../../src/capabilities/distribution/mcpdelivery.ts) at source
`b48615357edd2d9aff67f27b952e77c3c48127d8`, tree
`0e558459d9fceccae19275d008342668feb4d8ab`.
Neither module starts a server, binds routes, implements an MCP transport, fetches
an overlay or emits an encoded QR image. Names, advertised capabilities and
successful model results are not proof of those services or safety controls.
Use the separate [artifact producer guide](../../packages/artefact/README.md)
when actual in-process QR production and encoded export are needed.

## HTTP model

### Inputs and validation order

`createDeliveryPayload` packages values without validating them. `validatePayload`
returns the first `DeliveryError`, or `null`, in this order:

| Field | Admitted typed value |
| --- | --- |
| `size` | Finite number from 1 to 10,000 inclusive; fractions are allowed. This is not a request-body byte limit. |
| `errorCorrection` | Exactly `L`, `M`, `Q` or `H`. |
| `foreground` | Nonempty, non-whitespace string. No color syntax or contrast validation here. |
| `background` | The same nonempty-string rule, not a scan-safety measurement. |
| `format` | Exactly lowercase `png`, `jpeg`, `svg` or `pdf`. These names do not select working encoders. |
| `margin` | Finite nonnegative number, with no upper bound; factory default 4. Fractions are allowed. |

This model has no QR payload-text field. Its `DeliveryPayload` name does not mean
it accepts, encodes or validates arbitrary content. The function expects its
TypeScript-shaped input: missing objects or wrong runtime types can throw, for
example when a color value has no `trim` method. It is not an untrusted HTTP-body
parser, exception boundary or complete runtime schema.

### State, outcomes and audit

`createInitialApiState` sets `requestCount: 0`, `isReady: true`, and both route
arrays to `/api/delivery` and `/api/health`. These are model strings, not installed
routes. `checkContractAlignment` compares the arrays' lengths and entries in
order; it does not probe a service. `deliverPayload` checks this alignment before
payload validation. The `isReady` flag is not consulted by that delivery path.

- Misalignment returns `success: false` and `error.code: CONTRACT_DRIFT`.
- Input validation returns `success: false` and `error` with `CLIENT_ERROR`,
  `detail` and the offending `parameter`.
- Success returns `success: true` with `artefact: { artefact, metadata }`.
  The inner `artefact` is a `generated-` timestamp string; metadata has `size`,
  `format` and a timestamp. There are no encoded image bytes or media headers.

The `DeliveryResponse` interface makes `artefact` and `error` optional rather
than defining a discriminated result union. Check the intended branch and
required member before consuming a response from outside this model.
`createServerError` discards its supplied detail and returns `SERVER_ERROR` with
`Internal server error`; delivery itself does not catch arbitrary exceptions or
turn these error names into HTTP status codes.

`auditRequest` returns a new state with its counter incremented and retains the
other state fields, not the payload. `processDeliveryRequest` calls it before
attempting delivery, so rejected requests are counted too. Calling
`deliverPayload` directly does not increment the counter. No durable audit log,
authentication or authorization is implemented. `checkPublicAccess()` always
returns `true`. `testContractCoverage` only checks whether supplied numbers
include 200, 400 and 500; it ignores its `contract` argument and performs no route
or network test.

## MCP model

### Default configuration and input checks

`createDefaultConfig` declares `basic-generation` and `advanced-generation`.
Their shared fields are:

| Field | Default declared rule |
| --- | --- |
| `data` | Required string. Required means not `null`/`undefined`; an empty string is not refused by this declaration. |
| `format` | Required string; generation accepts exactly uppercase `PNG`, `SVG` or `JPEG`. |
| `size` | Optional number from 256 to 4096 inclusive. |
| `margin` | Optional number from 0 to 100 inclusive. |
| `errorCorrectionLevel` | Optional string; generation checks a truthy supplied value against `L`, `M`, `Q`, `H`. |
| `overlay` | Advanced tool only: optional object declaration, not a nested URL/position schema. |

Omitted `size`/`margin` are not filled with concrete defaults. Admitted finite
fractions are not rounded or made integers. Declared numeric validation rejects
nonfinite primitive numbers, after existing minimum/maximum checks; infinities
can therefore retain range-error messages. Generation also refuses nonfinite
primitive size/margin values when a custom tool omits their numeric declarations.

`validateToolInput` walks only the selected tool's parameter declarations in
order and returns the first `{ success: false, field, message }`, or
`{ success: true }`. It does not reject all extra fields, deeply validate objects
or implement JSON Schema. Optional `null` values skip declared checks; an object
type check does not exclude arrays. String `pattern` checks construct a regular
expression and can throw for an invalid configured pattern. Custom definitions,
configuration and caller runtime shapes are trusted inputs, not a newly qualified
coercion or security boundary.

### Generation and audit are different outcomes

`generateBasicQR` finds the basic tool, validates and audits that validation
result, then checks the configured format, truthy ECC value and supplied
size/margin ranges. A successful result is
`{ success: true, artefact: 'QR-' + base64(data) }`, not PNG/SVG/JPEG bytes.
A normal refusal is `{ success: false, field, message }` with no artefact.

`generateAdvancedQR` first validates/audits the advanced tool, then calls the
basic path, then checks a supplied overlay. Success changes the placeholder
prefix to `ADVANCED-QR-`. It does not composite, download or decode an image.
Both tool declarations must exist for the default advanced-to-basic flow.

An audit callback records **declared input validation**, not the final generation
or overlay outcome. A request can be audited as valid and still be refused later.
Successful advanced declaration plus a reached basic validation produces two
callbacks; an advanced declaration failure produces one, and a missing tool
returns before its callback. `invokeDeclaredTool` similarly validates/audits only;
its successful tool-name result is not generation. Callback and other unexpected
exceptions are not caught as `GenerationError` results.

### Overlay and capability helpers are not installed controls

The default allowed-origin list is the single literal `self`.
`checkOverlayPolicy(origin, config)` tests exact string membership. Advanced
generation passes `overlay.url` directly to it: it does not parse an origin from
a URL, resolve `self`, inspect content types, sandbox a fetch or execute one.
An ordinary same-origin HTTPS URL is not automatically equivalent to that literal.

`advertisedOverlayPolicy` derives `same-origin` only for exactly `[self]`, otherwise
`deny`. `validatePerimeterControls` checks that default-list shape and its
advertised policy, but generation does not automatically call it. These helpers
are model predicates, not authentication, anonymity or network-isolation proof.
The advertised `no-execution`, `sandboxed-fetch` and `content-type-validation`
strings do not implement or qualify those protections.

`deriveCapabilitiesFromConfig` returns the configured object itself, not a frozen
snapshot. `validateCapabilitiesAgainstConfig` compares ordered tool names,
descriptions and parameter names/types/required flags, exact size/margin ranges
and the overlay-policy string. Format, ECC and safety lists are checked for
advertised entries absent from the configured set, not full set equality;
parameter minimum/maximum/pattern values are not compared there. A successful
alignment result is not a full configuration/schema equivalence or live check.

## Verification and scope

The [HTTP conformance source](../../tests/conformance/distribution/httpapidelivery.conformance.test.ts)
and [MCP conformance source](../../tests/conformance/distribution/mcpdelivery.conformance.test.ts)
record model assertions. The separately accepted finite-measurement corrections
and their focused source-bound receipts do not establish hosted service, wire
protocol, image, browser, overlay-security or production acceptance. This guide
adds no new execution evidence and requires no replay of accepted suites.

These models' names, formats, input ranges and result types differ from the
artifact package and its [container ports](container-exports.md). Do not pass
one interface's result off as another's. The separate offline URL-reputation
contract is not implemented by either delivery module. Broader product outcomes,
actual release destinations and publisher qualification remain their existing
project work, not permissions or release gates created by this reference.
