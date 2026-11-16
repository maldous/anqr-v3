# Performance-budget capability model

This reference describes
[`performancebudget.ts`](../../src/capabilities/quality/performancebudget.ts)
at accepted ANQR commit `027241a280217971577fc194746510816abf055a`.
It is an in-process model over **caller-supplied measurements**, not a timer,
benchmark, scheduler, response writer or production service. It does not run or
cancel work, count emitted bytes, enforce a deadline or measure real performance.
It is separate from the [artifact producer](../../packages/artefact/README.md)
and the [HTTP/MCP models](delivery-models.md).

## Inputs and factories

- `PerformanceBudget` has `class`, `maxMillis` and `maxOutputBytes`.
  `RequestMeasurement` has `elapsedMillis` and `outputBytes`.
- The five `ComplexityClass` values, in iteration order, are `trivial`, `small`,
  `medium`, `large`, `extreme`; `COMPLEXITY_CLASSES` exposes that order.
- `createBudget(class, maxMillis, maxOutputBytes)` simply returns those fields.
  It performs no runtime validation or freezing.
- `createSurface(id, budgets)` builds a new map keyed by class. It rejects an
  empty/whitespace-only ID, an empty budget list, negative limits and duplicate
  class keys. It retains the original ID and budget-object references. Its
  negative-limit checks are not finite-number or runtime class-membership checks.

The readonly types do not freeze objects or maps. Supply trusted, stable numeric
inputs and class keys; TypeScript types alone do not validate arbitrary external
JSON, getters or mutable objects.

## Classification and the audit callback

`classifyRequest(surface, measurement)` returns either
`{ ok: true, classification, budget }` or `{ ok: false, error }`. An empty map
throws. Its **required class comes from output bytes**, not elapsed time or the
custom budget boundaries:

| Supplied output bytes | Required class |
| --- | --- |
| At most 1,024 | `trivial` |
| Above 1,024 through 16,384 | `small` |
| Above 16,384 through 262,144 | `medium` |
| Above 262,144 through 4,194,304 | `large` |
| Above 4,194,304 | `extreme` |

If that class is declared, both measurement fields must be at most its limits.
A breach refuses immediately: a larger declared class is **not** tried instead.
If the required class is absent, the first declared class in constant order that
fits both values succeeds. If none fits, refusal uses the declared budget with
the smallest time limit, not necessarily the largest class or size limit; ties
retain the first class in constant order.

`enforceBudget(surface, measurement, onAudit)` runs that classification and calls
`onAudit(classification, budget)` exactly on success. It then returns the same
result. Refusal skips the callback. Callback exceptions propagate; no durable
audit sink, privacy filter, retry or transactional rollback is supplied.

`budgetRefusal(class, budget, measurement)` constructs a `budget-refused` error.
It includes the original budget/measurement references, declared-limit fields,
message/refusal reason and the `breachTime`/`breachSize` booleans, also exposed as
`overTime`/`overSize`. It compares with strict `>` and does not itself establish
that a real breach occurred. The message's promise of no partial/late response
is model text, not an I/O cancellation mechanism.

Classification, refusal construction and readiness use their own comparisons;
they do **not** share the strict numeric validation below. For example, negative
measurements can fit positive limits, and factory checks can admit nonfinite
limits. Do not treat these entry points as an untrusted-input validation boundary.
Getter reads and later caller mutation can also affect their comparisons.

## Explicit sample validation

The validation family is distinct from classification:

| Function | Result and missing-budget behavior |
| --- | --- |
| `validateAgainstBudget(surface, class, measurement)` | One `BudgetValidationResult`; throws if that selected class has no budget. |
| `validateMeasurementsAgainstBudgets(surface, samples)` | A map of one result per supplied known class, in constant order; absent samples are skipped, supplied classes without budgets throw. |
| `validateRepresentativeSamples(surface, samples)` | A report over arrays of samples per known class; an empty surface or a supplied class without a budget throws. |
| `runRepresentativeBudgetValidation(surface, samples, audit)` | Builds that report, calls `audit(report)`, and requires the returned object to be exactly that report. |

For **each visited sample**, validation reads `elapsedMillis`, `outputBytes`,
`maxMillis` and `maxOutputBytes` once for validation and comparison. Each must be
finite and nonnegative; the first invalid field in that order throws a
`RangeError` with `<field> must be finite and non-negative.` Zero, finite fractions
and equality are admitted. A violation is strict `>` and gives `within`,
`over-time`, `over-size` or `over-both`. `VALIDATION_OUTCOMES` lists these values.

The result keeps the original budget and measurement references along with its
class and computed outcome. Reading those referenced fields later is not a frozen
snapshot of the values compared. A shared getter-backed budget can be read again
for another sample. Unknown runtime class keys are not visited by the constant-
order loops; validation does not certify arbitrary maps or complete class coverage.

A representative report contains `surface`, per-class `results`, `breachClasses`
and a summary: `all-within` if no visited sample breaches, `all-breach` if every
visited sample breaches, otherwise `some-breach`. **Zero visited samples also give
`all-within`.** `VALIDATION_SUMMARIES` lists the values. This summary does not prove
that representative data, every class or a real workload was supplied.

The audit wrapper is not called if report construction throws. Its same-reference
check rejects a replacement report but does not detect in-place mutation, enforce
immutability or authenticate an audit. Callback errors propagate.

## Readiness aggregation

`initialReadiness(surfaceId)` returns `{ surface, state: 'ready', breachCount: 0,
sampleCount: 0 }`; it is not a runtime health probe. The exported readiness values
are `ready` and `unready`, with constants and `READINESS_STATES` for discovery.

`recordSample(report, measurement, surface, audit)` throws for an empty surface.
A measurement is within if it fits **any** declared known-class budget, unlike
classification's required-class rule. It increments samples and, when outside
all such budgets, breaches. The resulting state is `unready` only when the updated
breach/sample ratio is at least one. Starting from the normal zero counters, that
means every sample so far breached; one within-budget sample makes the cumulative
state ready. This is not a sliding window, configurable sustained threshold or
check of the last sample alone. Counters are not pruned.

The output retains `report.surface`; it does not verify that it equals
`surface.id` or validate caller-supplied counters. `audit(updated)` must return
that exact new object, with the same in-place-mutation and exception limits as
the representative-report callback. No readiness state is persisted or connected
to deployment, request admission, a listener or a native execution claim.

## Existing evidence and scope

The [conformance source](../../tests/conformance/quality/performancebudget.conformance.test.ts)
contains seven cases for classification, refusal fields/callback suppression,
cumulative readiness and its callback identity, representative outcomes, invalid
validation numbers, getter read counts, and finite zero/equality/fraction bounds.
These are descriptions of retained test-source oracles, not a new execution or
benchmark. This documentation changes no code, tests, budgets or policy and does
not replay accepted suites. Broader product acceptance remains
[UIF-205](https://linear.app/maldous/issue/UIF-205); documentation coverage remains
[UIF-265](https://linear.app/maldous/issue/UIF-265), not whole API or runtime approval.
