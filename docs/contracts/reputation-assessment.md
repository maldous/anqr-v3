# Offline reputation assessment contract

## Selected profile and implementation boundary

`offline-url-inspection-v1` inspects only an explicitly supplied URL subject, locally and without network, DNS, redirects, storage, credentials or spending. Its production corpus is `empty-production-v1`, whose canonical indicator sequence is `[]`. A supported public HTTP(S) URL therefore returns `unknown` / `no_reputation_source_selected`, with descriptive local observations, never a safety verdict.

This document specifies the selected contract, not an implemented assessment, a deployed provider, or whole-product acceptance. Existing classification and remote-asset helpers do not establish compliance. The submitted payload remains unchanged in request memory and is not persisted in evidence or telemetry. Runtime implementation and its independent qualification are separate from contract acceptance.

For future acceptance cases only, `synthetic-reputation-v1` names the exact fixture URLs `https://malicious.anqr-vector.test/a`, `https://suspicious.anqr-vector.test/a` and `https://no-match.anqr-vector.test/a`. These are synthetic, not real reputation reports. Fixture `validFrom` and `observedAt` are `0`; `expiresAt` and `maxAgeMs` are `2000`; `evaluatedAt` is `1000`, all UTC epoch milliseconds. These numbers test arithmetic only, not production freshness. Fixtures cannot become a production corpus or a caller-controlled reputation grant.

## 1. Permitted inputs and exact scope

1. Input is one explicitly supplied decoded payload string, at most **8,192 JavaScript string code units**, matching the existing classifier's default bound. The caller may already possess it from decoding or direct entry; scanning or creating a QR does not implicitly request external analysis.
2. Non-string or oversized input returns a structured input refusal without echoing the input. Empty input, unpaired UTF-16 surrogates, C0 controls, DEL or literal whitespace in a URL candidate return an input refusal. There is no implicit trimming, Unicode repair or guessing of an omitted scheme.
3. Reputation URL scope is **absolute HTTP or HTTPS URLs** accepted by the pinned runtime's URL parser, with a nonempty host. A candidate beginning with `http:` or `https:` that cannot parse as an absolute URL returns `invalid_url`; embedded username/password returns `credentials_in_url`. Both are structured input refusals. `javascript:`, `data:`, `file:`, custom app schemes, bare hostnames and relative URLs are outside this profile and return unknown/not applicable. The existing classifier may recognize more forms; a classification result does not expand reputation scope.
4. Non-URL payloads remain classifiable, but their reputation is `unknown`, reason `not_applicable_to_profile`. Do not mine Wi-Fi passwords, OTP secrets, contact fields, payment fields, nested JSON or arbitrary text for URLs. A later selected embedded-link feature requires a separate explicit extraction contract.
5. An HTTP(S) payment link can receive URL-scoped observations only when explicitly supplied as the URL subject. No payment recipient, account, merchant, amount, currency, authorization or transaction safety is inferred. Native payment schemes are outside reputation URL scope.
6. URL inspection does not assess image readability/scannability, QR validity, accessibility, remote-resource fetch permission, malware absence, destination identity or entitlement to act on the payload.

## 2. Canonical subject and redirects

Keep the original payload unchanged and only in the live request's memory. Create a separate versioned match key; never rewrite the QR, silently navigate to the canonical form or persist the key in telemetry.

* Parse with the pinned Node URL implementation. For matching, use its serialized absolute URL after clearing the fragment. Scheme and host use the parser's ASCII serialization; default ports follow that serialization. Preserve the serialized path, query order, duplicate query keys, query values, nondefault port and percent escapes. Do not sort queries, remove tracking parameters, recursively decode escapes, collapse unrelated paths, or use display Unicode as the matching identity.
* Keep typed keys separate: `exact_url` means that complete fragment-free serialized URL; `exact_host` means exactly the parser's serialized hostname. An indicator must declare its key type. No inferred suffix/subdomain, registrable-domain, wildcard, brand or public-suffix matching is permitted in v1. A trailing dot remains part of the serialized host key; no extra alias rule is invented. Parser normalization of path dot segments is part of this declared serialization, not an extra transform.
* User presentation must show the host and any Unicode/ASCII distinction as inert escaped text. Only the active request view may show its supplied URL; durable evidence uses opaque subject references. Query/fragment/user data must not enter an audit record.
* Offline v1 performs **zero redirects** and does not resolve shorteners, refresh tags, JavaScript navigation or DNS. A result is about the submitted subject only. A result for the initial URL never asserts anything about an unobserved final destination. Caller-supplied redirect chains are untrusted input and do not extend the assessment's coverage.
* Private, loopback, link-local, metadata-looking or local-name subjects may be identified as local/nonpublic input observations. They receive `unknown`, reason `outside_public_reputation_scope`, without DNS or connection attempts. Such an observation is not evidence of maliciousness. Existing literal-host helpers alone do not prove public routability of a hostname.

## 3. Method, thresholds and verdicts

The response keeps **applicability** (`applicable`, `not_applicable` or `refused`) separate from **reputation** (the five outcomes below). A surface may say “not applicable” for an unsupported payload; it must not replace unknown with a favorable reputation outcome. Structured input refusal carries no reputation assessment.

There is **no numeric risk score, learned model, confidence percentage, similarity threshold, popularity heuristic, age-of-domain heuristic or calibrated false-positive/negative claim** in v1. Selected local observation IDs are `http_transport` (“URL uses HTTP”), `ip_literal_host` (“Host is an IP literal”), `internationalized_host` (“Hostname has an internationalized/ASCII representation”) and `destination_not_observed` (“Destination and redirects have not been contacted”). Emit the first three only when the literal property is present, and the last for every accepted offline URL. Show them as descriptive caution, never as a scored warning threshold or evidence of maliciousness. They cannot manufacture a malicious/suspicious reputation verdict.

The production default admits no reputation dataset. Its valid supported URL result is `unknown`, reason `no_reputation_source_selected`, accompanied by the local observations and the limitation that no reputation evidence was consulted.

The contract also specifies how a later owner-admitted **local immutable evidence snapshot** would be consumed without network access. Admission must identify exact source/revision/digest, rights and applicable notices, input coverage, match semantics, evidence classes, validity policy and accountable owner. Public availability, a caller-supplied object or a fixture is not admission. This profile admits none.

| Reputation outcome | Exact rule and user meaning |
| -- | -- |
| `malicious` | At least one current admissible exact-match record explicitly reports malicious/phishing behavior for the declared URL/host scope, with no unresolved conflicting current evidence. Say “Selected source reports malicious activity for this scope,” with source and time. It is a sourced report, not universal certainty. |
| `suspicious` | Current admissible exact-match evidence explicitly reports suspicion, with no current malicious record or unresolved conflict. Lexical appearance alone cannot select this reputation outcome. |
| `scoped_assessed` | A current admitted snapshot was successfully consulted at its declared coverage and returned no matching adverse record. Say “No adverse match in \[named snapshot\] for \[scope/time\]; destination safety is not established.” This is a scoped negative observation, not a benign classification. |
| `unknown` | No admitted source, no relevant coverage, expired/stale or future-dated evidence, unsupported subject, missing validity metadata, unresolved contradictory evidence, or insufficient evidence. Include an exact non-sensitive reason. Never convert absence or staleness to `scoped_assessed` or safe. |
| `unavailable` | An admitted configured source could not actually be consulted because it was missing, unreadable, corrupt, or failed a declared verification step; or the assessment encountered an internal failure. Do not invent a source failure when no source was selected. Return a bounded reason code rather than exception text. |

For one admitted snapshot, “no adverse match” is permitted only if the subject is within the snapshot's explicitly declared coverage and the lookup completed. An unrecognized or unsupported scope is unknown. No cross-source aggregation or precedence is enabled by default. If a later profile admits multiple sources, contradictory classifications return unknown until that profile has an explicit resolution rule; a benign/no-match source cannot silently erase an adverse record.

These rules choose an evidence threshold of a verified, current, exact scoped assertion, not a statistical threshold. They do not establish a detection rate. False positives and false negatives remain possible. The result is advisory; it does not auto-block, auto-open, whitelist a destination, execute a payment or revoke a user's access.

## 4. Freshness and replay

Every evaluation records its supplied evaluation time, method/version and exact admitted snapshot identity. All arithmetic uses finite UTC epoch milliseconds; `maxAgeMs` is a finite positive duration in milliseconds. A missing or invalid evaluation-time input is a configuration refusal with no assessment. An otherwise valid time whose trust is unknown cannot support freshness. Each admitted evidence record requires `observedAt` and `expiresAt`; the snapshot requires its own validity interval and a source-specific maximum evidence age selected with that source. A current record requires:

`snapshot.validFrom <= evaluatedAt` and `observedAt <= evaluatedAt < min(record.expiresAt, snapshot.expiresAt, observedAt + maxAgeMs)`

The snapshot must also have become valid by evaluation time. Missing, nonfinite, inverted or future-dated evidence times cannot support a current verdict. Equality at expiry is stale. Unknown time or clock validity means unknown, not fresh. A supplied historical evaluation time produces an explicitly “as of” result, never a present-current claim. Re-reading cached data does not advance its observation time or reset expiry. Cache/replay uses the same source, key, policy version and original evidence times.

No production TTL or max age is invented here: no source is selected in default v1, so no current-data claim is possible. A later real source must bring a justified freshness policy. Synthetic test snapshots use explicit fixed evaluation/observation/expiry times and remain labeled synthetic. They establish rule behavior only.

## 5. Evidence, privacy and errors

The request result must expose outcome, stable reason code, method/profile version, evaluated time, scope/coverage, consulted source identity/revision/digest (or none), relevant evidence IDs and observation/expiry times, whether evidence is synthetic, local observations and limitations. Input validity and source availability are separate from reputation. The user must be able to inspect why a verdict was produced and what was not assessed; a bare colored badge is insufficient.

The local engine accepts an evaluation time as an explicit input so independent cases are reproducible. Invalid evaluator configuration returns a structured configuration refusal without a favorable verdict. Input refusal, cancellation, internal error or unavailable source never returns partial evidence as a success. Cancellation discards the in-flight request without starting a background retry.

Default execution does not transmit any payload, hostname, path, query, fragment, payment information, credentials or account identity. It stores no raw payload, canonical URL, redirect target, plain URL hash, screenshot or provider response after the request. An ordinary unsalted hash is not treated as anonymization. Audit/telemetry, if already authorized, is limited to opaque operation ID, profile/source revision, outcome/reason and coarse non-content counters. No error message, stack, dynamic exception reason or nested evidence object may echo sensitive values. In-memory UI evidence and durable operational records are different surfaces.

Existing source helpers are not automatically compliant with this evidence envelope. A nested `urlExcluded: true` flag cannot establish privacy if raw redirect strings are retained, and provider exception text is not a bounded reason code. A reputation adapter must construct the privacy-safe envelope rather than persist those helper objects wholesale.

## 6. Future online profile boundary

Offline acceptance grants no provider, endpoint, network lookup, submission, account, credential reuse, retention arrangement or spending authority. A later online profile must identify its provider/data rights, transmitted fields, regional/retention terms, cost cap, revocation/cancellation behavior and applicable existing approvals. Reuse valid scoped authorization; do not add a fresh approval request to every routine step it already covers.

The later profile must specify no uncontrolled destination fetching or redirect following, validate every permitted hop and resolved address before connection, block private/local/metadata/reserved destinations, bind DNS validation to the actual connection, refuse protocol downgrade and unsupported schemes, and enforce total time/size/hop budgets. Source helper defaults of 1 MiB, 5 seconds and 3 redirects are existing model constants, not a selected online reputation policy or proof of enforcement. An external reputation lookup and fetching the scanned destination are distinct effects requiring their own explicit selection.

Consent must name the actual data recipient and fields before any new submission; a scan alone is not consent. Disabling an online profile must fall back to truthful unknown/unavailable, without silent alternate providers or unapproved background refresh. Provider output must fit the same evidence, scope, expiry and no-safe-claim rules. Provider errors or an empty response cannot become a negative finding.

## 7. Reviewable acceptance cases

These are proposed acceptance cases, **not executed tests or product results**. Synthetic snapshots are fixtures and never evidence about the named domains.

| Case | Expected result / observable boundary |
| -- | -- |
| Non-string; string length 8,193; empty input; malformed Unicode/control-bearing URL candidate | Structured non-echo input refusal, no assessment or side effect. The 8,192-unit boundary is accepted for further validation. |
| `https://example.test/a?x=1#note`, default configuration | Unknown / no reputation source selected; zero network, DNS, storage or navigation. Fragment excluded from match key; original remains unchanged. |
| Bare `example.test`, relative `/a`, `javascript:...`, `file:...` | Applicability not applicable, reputation unknown / not applicable to profile; no guessed scheme and no fetch. |
| Malformed absolute HTTP(S) candidate; HTTP(S) URL with username/password | Structured input refusal `invalid_url` or `credentials_in_url`, respectively; no reputation verdict, input echo or fetch. |
| Wi-Fi, OTP, contact or payment-scheme payload containing secrets/embedded URLs | Classifiable outside reputation; unknown/not applicable; no extraction, external submission or sensitive audit. |
| `https://example.test:443/a?x=1&x=2` versus same query reversed | Default port follows URL serialization; duplicate query order remains significant for exact-URL matching. Host matching is a separate declared scope. |
| Mixed-case/IDN host and its parser ASCII serialization | Consistent parser-derived key with inert user-visible host disclosure; no brand/homograph or safety verdict inferred. |
| Host indicator for `example.test` evaluated against `sub.example.test` or `example.test.evil.test` | No implicit suffix match; unknown if no explicitly covered applicable key. |
| Same URL with different fragment; URLs with distinct query secrets | Fragment-free key matches by the declared rule; different serialized queries remain distinct; neither secret enters durable logs. |
| Local/private literal or local-name URL | Unknown/outside public reputation scope; zero DNS or connection attempts. This is not “malicious.” |
| Initial URL that might redirect or shorten | Assess submitted scope only; final destination unobserved. Supplied chains do not create coverage; no redirect request occurs. |
| Synthetic admitted exact malicious record within validity | Malicious with fixture label, scoped evidence ID/source/digest and times; no universal detection claim. |
| Synthetic suspicious record; no malicious/conflicting record | Suspicious with its exact evidence; no invented percentage or heuristic confidence. |
| Covered current synthetic snapshot, lookup completes with no match | Scoped assessed / no adverse match in that snapshot; never “safe,” “trusted” or payment-authorized. |
| No source; subject outside snapshot coverage; conflicting current evidence | Unknown with distinct reason, not a clean/negative result. |
| Evaluation exactly at expiry, stale data, future observation or missing freshness policy | Unknown; old adverse evidence may be shown as historical, never presented as current or used to manufacture a favorable verdict. |
| Configured snapshot absent/corrupt/digest mismatch | Unavailable/source verification failure; no internal path, exception text, raw record or subject leak. |
| Replay at a later evaluation time | Original observation/expiry retained; an expired cached result becomes unknown rather than refreshed. |
| Valid payment payload or independently decodable QR | No implication about destination/recipient identity, authorization, merchant trust, transaction success or safety. |
| Cancellation or injected internal failure | No navigation, background retry, partial favorable result, external call or sensitive error output. |
| Evidence UI/export/audit inspection | Shows scope/source/time/limits; no raw sensitive payload or URL/query/redirect data in persistent records. |
