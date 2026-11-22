# Anonymous-generation and payload-confidentiality models

This reference covers the adjacent
[`anonymousgeneration.ts`](../../src/capabilities/trust/anonymousgeneration.ts)
and [`payloadconfidentiality.ts`](../../src/capabilities/trust/payloadconfidentiality.ts)
capability models at accepted ANQR commit
`036a403ab1e7f82b72e3c6006937532e1657f2a3`.
Their counters, metadata and placeholder results are not an authentication
system, anonymous transport, encryption, leak detector or deployed privacy policy.
For actual in-process QR production, use the [artifact package](../../packages/artefact/README.md).
Remote-asset fetching and reputation assessment have separate contracts.

## Anonymous generation is a counter and a constant result

`AnonymousRequest` permits optional `payload: unknown`. `AuditCount` is a numeric
type alias, with `INITIAL_AUDIT_COUNT = 0`. There is no internal mutable counter
or persistent audit store; the caller supplies and retains the count.

| Function | Source behavior |
| --- | --- |
| `recordRequest(count)` | Returns `count + 1`. No finite, nonnegative or integer validation is performed. |
| `getAuditCount(count)` | Returns its argument unchanged. |
| `executeAnonymousRequest(request, audit)` | Does not read the request; returns a constant message and `recordRequest(audit)`. |
| `checkAnonymousPermissions()` | Always returns `true`; it does not inspect an identity, credential or policy. |
| `validateAnonymousGeneration(request, audit)` | Calls `executeAnonymousRequest`, returns its result on success, and converts a thrown error to a failure result. |

The execution result has this shape:

```text
{ result: { message: 'Anonymous request processed successfully.' }, audit: nextCount }
```

The validation wrapper returns either
`{ outcome: 'success', result: { message } }` or
`{ outcome: 'failure', error: string }`. It discards the updated count, so calling
it alone does not update the caller's audit value. `VALIDATION_OUTCOMES` lists
the two outcome names; it is not an event stream or runtime permission table.

No QR artefact is generated. The success message and permission boolean do not
prove that another service accepts anonymous users, avoids identifying them or
omits network/server logs. Nonfinite and fractional numeric counters are not
refused. Types do not validate arbitrary runtime arguments; if execution throws,
the wrapper reports `Error.message` or `String(error)` without redaction. Its
catch is not a guarantee that converting an arbitrary thrown object cannot throw.

## Payload records and declared size classes

`PayloadRequest` supplies `kind`, `sizeClass` and `content: unknown`.
`PAYLOAD_KINDS` lists `text`, `binary`, `json`; `PAYLOAD_SIZE_CLASSES` lists
`small`, `medium`, `large`. `SIZE_LIMITS` supplies these source-level thresholds:

| Class | Limit in bytes |
| --- | ---: |
| `small` | 1,024 |
| `medium` | 1,048,576 |
| `large` | 10,485,760 |

These limits are described as placeholder values in source, not measured product
quotas or a network/upload policy. An ordinary request at exactly its limit is
admitted; size greater than the limit is refused. There is no validation that
`kind` matches the content representation, nor a general runtime enum/schema
validator. The exported arrays and limits object are not frozen by readonly types.

`auditPayload(request)` returns a new `{ kind, sizeClass }` record. It does not
read or include `content`, compute a size, write a log or enforce an allow/deny
decision. The caller controls both metadata fields, so their declared shape is
not evidence that arbitrary supplied metadata is nonsensitive or well formed.

## Processing order and actual size measurement

`processPayload(request, auditFn)` proceeds in this order:

1. Call the supplied audit with the **original request**. Its returned record
   is assigned locally but not inspected or used to authorize processing.
   An audit throw propagates; there is no enclosing exception-to-result wrapper.
2. Look up the size limit for the current `request.sizeClass`. If the lookup does
   not yield a number, return `sizeClassUndefined`, with the supplied class in
   `bound` and the explanatory message.
3. Read current content and determine its byte size as described below. A
   failure within this measurement returns `payloadSizeUnavailable`, the bound
   `finite binary or JSON byte size`, and the fixed message
   `Payload size could not be determined.`
4. If size exceeds the limit, return `sizeBoundExceeded`, with the selected
   class/limit in `bound` and the refusal message.
5. Return `{ success: true, result: { artefact: { kind, sizeClass } } }` using
   current request metadata. This is a new metadata-only placeholder object,
   not an encoded QR, copied payload or processed content result.

Refusals have `{ success: false, rule, bound, message }`, not a `result` field.
The module adds no content property to those errors or the placeholder artefact.
Metadata lookup/access failures outside the measurement block are not generally
caught, and arbitrary callback return values are not validated.

Measurement does not depend on the declared `kind`:

- `ArrayBuffer` and `SharedArrayBuffer` use their intrinsic byte-length getters.
- Binary views use the intrinsic `DataView` or typed-array byte-length getter.
  This includes Node buffers and measures the view, not the whole backing buffer.
  A caller-supplied `byteLength` property is not accepted as a replacement for
  these internal-brand checks; the source also avoids an `instanceof` requirement.
- Other values use `JSON.stringify(content)` followed by
  `Buffer.byteLength(serialised, 'utf8')`. JSON string quotes/escapes count;
  this is neither JavaScript string length nor the size of a future QR encoding.
  An ordinary object named `byteLength` is measured through its JSON representation.
- An unavailable JSON representation, cycle, BigInt or thrown serialization
  behavior is converted to the fixed `payloadSizeUnavailable` refusal.
  A valid JSON representation of `null`, for example, is measurable even if the
  caller declares `kind: 'binary'`.

JSON can omit or transform parts of a value. Measuring its representation is not
validation of every property or a bound on the original object graph. The full
serialization is created **before** its resulting size is compared, so the
threshold is not a streaming, CPU, traversal or memory-allocation limit.
Serialization may run caller getters or `toJSON` methods. Module loading requires
the referenced buffer globals; JSON measurement also requires Node's `Buffer`.
These source dependencies are not a claim of browser compatibility.

## What the confidentiality helpers do not enforce

The supplied audit can read, retain, mutate or transmit the original content.
Serialization can run caller code too. The request is not cloned or frozen, and
later reads can observe changed metadata/content. There is no callback sandbox,
atomic snapshot, rollback or rejection of callback side effects.

Not adding content to the module's normal output is narrower than deleting it:
the caller still owns the request and any references. The module cannot erase
that memory, control application logs, or guarantee what an audit/provider does.
Even metadata can contain sensitive data if a caller supplies it there.

`refusePayload(error)` returns the **same supplied error object**, with no
sanitization, copying or validation. Do not pass an error containing sensitive
values and assume the helper removes them. `assertNoPayloadLeak(value)` is an
empty test hook: it examines nothing, returns `undefined`, and cannot assert that
logs, telemetry, exceptions or application state are free of payload data.

The module's ordinary size-refusal paths avoid interpolating content or the
serialization exception, but that observation is not a whole-program privacy
or security assessment. No authentication, encryption, storage policy or actual
anonymous/private product journey is installed by these helpers.

## Evidence scope

The existing [anonymous-generation conformance source](../../tests/conformance/trust/anonymousgeneration.conformance.test.ts)
contains four named cases. The [payload-confidentiality conformance source](../../tests/conformance/trust/payloadconfidentiality.conformance.test.ts)
contains seven, including selected unavailable-size and intrinsic binary-size
cases. This guide was compared with their oracles, not a new test execution or
an exhaustive runtime-shape, resource-bound or privacy qualification.

No implementation, dependencies or test behavior changes in this documentation
unit. Existing accepted source/check receipts retain their original scope.
See the [documentation dispositions](../documentation-map.md) for broader
product, reputation, native-custody and release obligations.
