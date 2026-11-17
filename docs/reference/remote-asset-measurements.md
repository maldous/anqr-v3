# Remote-asset policy and measurement admission

This note accompanies the finite-number correction in
[`remoteassetsafety.ts`](../../src/capabilities/trust/remoteassetsafety.ts).
The module operates on an injected synchronous `mockFetch` callback and its
reported content, size, elapsed time and redirects. It is not an HTTP client,
timer, streaming byte counter, DNS resolver or deployed network perimeter.

Earlier accepted source `036a403ab1e7f82b72e3c6006937532e1657f2a3`
used sign/range comparisons alone for these numeric inputs. Such comparisons
could admit `NaN`, and policy creation could admit positive infinity.
Negative response measurements could also pass a maximum-only comparison.
The corrected domain is explicit below; this is not a general runtime schema
or a change to URL, redirect, IP-classification or audit contracts.

## Factory controls

`createPolicy(maxBytes?, timeoutMs?, maxRedirects?)` requires finite primitive
numbers: `maxBytes` and `timeoutMs` must be positive; `maxRedirects` must be
nonnegative. Defaults remain 1,048,576 bytes, 5,000 milliseconds and 3 redirects.
Finite fractions remain admitted, including fractional redirect limits; no
new integer-only rule or changed loop/redirect semantics is selected here.

Each parameter retains its existing sign check/error before its added finite
check. Zero/negative byte and timeout limits still throw the original
`... must be positive` error; a negative redirect limit still throws
`maxRedirects must be non-negative`. A value reaching a finite check but failing
it throws `maxBytes must be finite`, `timeoutMs must be finite` or
`maxRedirects must be finite`, respectively. Parameter validation order remains
bytes, timeout, redirects. These exceptions are not fetch-refusal objects.

The factory does not freeze returned objects. Hand-constructed or subsequently
mutated policies are not validated by invoking `createPolicy` elsewhere; do not
treat this correction as a schema boundary around all possible policy objects.

## Callback measurements

`checkSizeBoundary(size, policy)` and
`checkTimeoutBoundary(elapsedMs, policy)` now refuse nonfinite or negative
measurements with their existing `size` or `timeout` boundary. An unknown or
malformed observation must not manufacture a measured success.

- A supplied value greater than its maximum retains the existing range-refusal
  reason, checked first. For a valid finite maximum, positive infinity therefore
  keeps its prior over-limit refusal instead of changing error precedence.
- Other invalid measurements return `Response size must be a finite non-negative
  number` or `Elapsed time must be a finite non-negative number`.
- Zero, finite fractions and values exactly equal to the maximum remain admitted.
- `auditFetch` continues to check size before elapsed time. When both fail, size
  wins. Omitted `elapsedMs` still skips the elapsed-time comparison; it is not
  evidence that a timer observed the operation.

`auditFetch` and `serverSideFetch` reuse these helpers, so the new refusals flow
through the existing refusal-audit path before content can be returned as a
success. This does not change custom audit/mutation callbacks or their exception
and side-effect behavior. Reported size is not recomputed from content, elapsed
time is not measured, and DNS/transport/redirect/privacy behavior is not newly
qualified. A positive finite reported number can still be inaccurate.

## Focused regression scope

The [six new contract cases](../../tests/contracts/remote-asset-measurements.test.ts)
cover nonfinite factory controls, preserved sign/default/fraction behavior,
invalid size and elapsed measurements, both fetch wrappers' refusal/audit path,
and accepted boundaries/omission/refusal order. They use injected data and no
network request. Their execution results must be reported with the actual
revision and toolchain; test-source presence is not a passing run.

The existing remote-asset conformance suite and other accepted qualification
remain separately scoped, not rerun to relabel this correction. This unit does
not establish real SSRF prevention, arbitrary address handling, safe DNS
resolution, deadline cancellation, audit redaction or whole-product acceptance.
