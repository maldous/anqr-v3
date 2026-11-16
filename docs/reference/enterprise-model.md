# Enterprise programmatic-generation model

This reference describes [programmaticgeneration.ts](../../src/capabilities/enterprise/programmaticgeneration.ts)
at accepted source `cd5297f5c75a992e68e260542b63b68bb250b645`, tree
`115bfeb0a18ff1fcf944180bfb4c64747c14ae51`. Its functions are in-process
capability models. They do not register HTTP routes, start an MCP server, generate
a QR image, authenticate a caller or enforce a deployed enterprise perimeter.
The separate [HTTP/MCP delivery models](delivery-models.md) are not automatically
connected to this module.

## Contract and invocation

`PROGRAMMATIC_GENERATION_CONTRACT` declares two surface IDs:

| ID | Kind | Declared route, not a registered endpoint |
| --- | --- | --- |
| `pg-http-invoke` | `http` | `/api/v1/programmatic-generation/invoke` |
| `pg-mcp-invoke` | `mcp` | `mcp://anqr/programmatic-generation/invoke` |

Its four capability IDs are `invoke`, `audit`, `perimeter` and `readiness`.
These descriptions are not dispatch implementations: either invocation helper
accepts any declared capability ID and returns the same result shape. Choosing
`perimeter`, for example, does not call `evaluatePerimeter`.

A typed `ProgrammaticInvocation` contains `surfaceId`, `capabilityId`, `input`
(a record) and `nonce`. `validateInvocation(contract, invocation)` checks, in order:

1. Surface ID, capability ID and nonce are truthy and not blank after `trim()`.
2. The exact, untrimmed surface ID occurs in the supplied contract.
3. The exact, untrimmed capability ID occurs in that contract.

Nonblank nonce whitespace is preserved. There is no nonce registry, expiry,
replay prevention, input schema, caller identity or authorization check.
These TypeScript functions are not an untrusted-JSON boundary: malformed
runtime types, getters or callbacks can throw; errors are not universally
converted to the outcome union.

On success, `validateInvocation` returns `success: true`, the selected IDs,
the original nonce, `payload: Object.freeze({ ...invocation.input })` and
`issuedAt: 0`. The payload **does contain the input's enumerable own values**.
The HTTP helper's source comment saying that the result echoes only identifiers
must not be read as a payload-redaction guarantee. The copy and freeze are
shallow: nested objects remain shared, and this is not deep validation,
redaction, isolation or a retention policy for a consumer.

`invokeHttpSurface(invocation, nowMs)` first requires a `pg-http-` surface prefix;
`invokeMcpSurface` first requires `pg-mcp-`. They then validate against the default
contract, so an arbitrary matching prefix is not enough. Success replaces
`issuedAt: 0` with the supplied `nowMs` without checking its finiteness or freshness.
Neither helper calls audit, perimeter or readiness functions. Contract constants
and readonly types do not deep-freeze the runtime contract object.

## Audit helpers

`createAuditState()` returns `{ invocations: 0 }`.
`incrementAudit(current, nowMs)` ignores time and returns the count plus one.
`auditInvocation(state, auditFn, nowMs)` rejects a nonfinite timestamp or a
negative current count, then calls `auditFn(state, nowMs)` and returns
`{ success: true, state: { counted: true, invocations: next.invocations } }`.
It does not require an integer/finite current count or validate the callback's
returned count. It does not catch a callback exception.

The default audit state contains only a count, not caller payloads. That narrow
state shape does not prove that a supplied callback or surrounding application
never logs or retains data. Keep returned invocation payloads distinct from
count-only audit values.

## Perimeter helpers

`createPerimeterState(limit = 100, windowMs = 60000)` requires positive finite
numbers and throws otherwise. Fractions are allowed; no integer constraint is
applied. A new state has `observed: []`. Callers must retain the returned state
and choose the caller/isolation key themselves; no identity map is supplied.

`evaluatePerimeter(state, nowMs, auditFn)`:

1. Refuses a nonfinite `nowMs`.
2. Counts observations in the inclusive interval `[nowMs - windowMs, nowMs]`.
3. Refuses when that count is at least `limit`, without calling the callback.
4. Prepares a new observation state, then calls the callback with a **fresh zero
   audit state**, not a cumulative audit state. A returned count below one refuses;
   otherwise the new perimeter state is returned.

Old and future observations are excluded from that count, but remain in the
returned observation array. It is append-only, not a bounded/pruned sliding-window
store. Direct `recordPerimeterObservation` simply appends; it performs no timestamp
or state validation. The evaluator does not revalidate manually constructed or
modified limits/windows/observations, or require a finite/integer callback count.
A callback exception propagates. A refused result does not return the prepared
new state, but cannot roll back effects performed by a callback. There is no
atomic shared limiter, durable storage, cross-process coordination or automatic
connection to either invocation helper.

## Readiness and repeated calls

`createReadinessState()` references the default contract and copies its declared
surface and capability IDs into arrays. `evaluateReadiness` compares each array
by **length and order** against the corresponding contract IDs; surfaces are
checked first. It does not probe routes, servers, credentials, capability
implementations or infrastructure health. Success returns the supplied state.

`exerciseRepeatedInvocation(invocations, nowMs, auditFn)` processes every entry
through the **HTTP** helper in input order. A successful invocation calls the
callback with a fresh zero audit state; a count below one replaces that entry
with an audit-failure outcome. Validation refusals do not call the callback.
It does not select the MCP helper for MCP IDs, call the perimeter/readiness
helpers, accumulate an audit count, catch exceptions or roll back callback effects.
The returned array is frozen, not a deep freeze of every outcome.

`assertStableStructure(a, b)` compares success/failure first. For successes it
compares only surface ID, capability ID and nonce; for failures only the error
code. It ignores payload, issue time and error message. A true result is not full
object equality, determinism, idempotency or successful retry qualification.

## Outcome codes and qualification limits

| Code | Source-level meaning |
| --- | --- |
| `ANQR-PG-4001` | In-window observation count reached the supplied limit. |
| `ANQR-PG-4002` | Unknown contract surface, or wrong helper's surface prefix. |
| `ANQR-PG-4003` | Unknown contract capability. |
| `ANQR-PG-4004` | Missing/blank typed invocation identifier or nonce. |
| `ANQR-PG-4005` | Nonfinite perimeter evaluation timestamp. |
| `ANQR-PG-4006` | Readiness ID arrays differ from the contract in order/length. |
| `ANQR-PG-4007` | Audit timestamp/current-count refusal or callback count below one. |

The existing [conformance test source](../../tests/conformance/enterprise/programmaticgeneration.conformance.test.ts)
contains five cases covering the basic audit, both invocation helpers, a limit of
two, readiness omissions and repeated successful HTTP calls. Reading those
assertions is not a new execution result or exhaustive edge-case qualification.
The [toolchain guide](../toolchain.md) defines the real source-check commands;
this documentation adds no product gate or runtime dependency. Whole-product
and actual release qualification remain [UIF-205](https://linear.app/maldous/issue/UIF-205)
and [UIF-270](https://linear.app/maldous/issue/UIF-270), separately from this guide.
