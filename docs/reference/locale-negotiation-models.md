# Locale negotiation and interface message models

This reference covers two independent in-memory modules at accepted
`maldous/anqr-v3` commit `036a403ab1e7f82b72e3c6006937532e1657f2a3`, tree
`f05910bb9af8742c6ebc0d832f9f3f85d62e9759`:
[locale negotiation](../../src/capabilities/localisation/localenegotiation.ts) and
[interface localisation](../../src/capabilities/localisation/interfacelocalisation.ts).
They do not read a browser, cookie, storage, HTTP header or translation service,
render a selector, import another translation repository, or persist a preference.
Inputs and any application integration belong to the consumer.

## Two locale sets, not an implicit integration

Negotiation exports `supportedLocales` containing exactly `en`, `fr`, `es`, with
`sourceLocale` set to `en`. Interface localisation separately declares
`AVAILABLE_LOCALE_CODES` as `en`, `es`, `fr`, `de`, `ja`, `ar` and its source code
as `en`. Its `createLocale` accepts any nonblank code; that exported six-code list
does not constrain the factory, state or resolver. Neither module calls the
other, so their lists are not evidence of six-language negotiation or actual
translated content. An application must explicitly reconcile the chosen outcome
with the locales and messages it really supplies.

## Negotiation precedence and refusal

`negotiateLocale(explicitRequest?, storedPreference?, browserLanguages?)` returns
either `{ status: 'success', locale, resolvedBy }` or
`{ status: 'failure', locale: 'en', reason, original }`. The failure locale is a
fallback value, **not a success result**.

| First applicable input | Result and what is not tried |
| --- | --- |
| Explicit value is not `undefined` | Exact supported-list membership succeeds with `resolvedBy: 'explicit'`; otherwise fail immediately. Stored/browser input is not consulted. |
| No explicit value; stored value is not `undefined` | Same exact check, with `resolvedBy: 'stored'` on success; invalid stored value stops browser fallback. |
| Neither above; browser list has entries | Visit in supplied order and return the first own-property alias whose value is not `undefined`, with `resolvedBy: 'alias'`. |
| No usable alias | Source `en`, success with `resolvedBy: 'source'`. |

For explicit/stored strings, `trim() === ''` determines `malformed`; every other
unsupported value is `unsupported`. Values are not trimmed or case-normalized
before membership: `EN`, ` en `, `en-US` and `fr-CA` are not direct supported
values. There is no BCP-47 validation or regional-language fallback algorithm.

The initial `aliasMap` has only `en-US -> en` and `fr-CA -> fr`. Browser entries
are looked up there, not directly in `supportedLocales`: a browser list of
`['es']` therefore falls back to source. `Object.hasOwn` excludes inherited names
such as `constructor` and `toString`. This is an own-property guard, not validation
of a subsequently mutated map's values. Exported arrays/maps are not frozen by
TypeScript's `as const` or types. Do not extend the supported contract by runtime
mutation or assume fresh objects authenticate aliases.

`validateNegotiation` simply delegates with the same arguments; it is not a
separate validator, environment probe or test runner. Wrong runtime types,
getters or malformed container shapes can throw rather than become the declared
failure union. The returned `original` retains a rejected supplied string, so
logging a failure is not a redaction-safe operation.

## Interface state and message lookup

`Locale` contains code, English/native names, `ltr`/`rtl` direction and a string
entry array. `LocalisationState` contains available locales, active code and
source code. The module provides these ten callable exports:

| Function | Actual input/result boundary |
| --- | --- |
| `createLocale` | Require nonblank code/names and exact `ltr` or `rtl`; preserve strings by reference. Does not validate entries, locale-code membership, unique keys or content coverage. |
| `createInitialLocalisationState` | Require a nonempty locale list, the selected active code (default `en`) and source `en` to be present. Retain the list; do not validate/deduplicate locales or strings. |
| `setActiveLocale` | Require an existing matching code, then shallow-copy state with that active code. No preference persistence, message validation or source repair. |
| `getActiveLocale`, `getSourceLocale` | Return the first matching locale reference or throw if absent. |
| `getLocalesByNativeName` | Sort a new outer array using each name's ordinary `localeCompare`; retain the locale objects. No explicit collation locale/options or stable cross-environment ordering contract. |
| `resolveString` | Nonblank key, both selected locales present, first active key match or first source key match; substitute selected placeholders and return `{ resolved, missing }`, or throw. |
| `validateLocaleString` | Selected raw-key/placeholder/count checks below, not a message parser or comprehensive schema. |
| `validateLocale` | Visit its string entries and return the first validation failure prefixed with locale code, otherwise success. |
| `validateAllLocales` | Visit every supplied locale and return the first failure or success. Does not validate state selection, translation completeness or locale structure independently. |

`resolveString` locates **both** active and source locales before considering an
active message. A missing source object can therefore throw even if the active
message exists. An active key match returns `missing: false`; a source fallback
returns `missing: true`. This flag means the active entry was missing, not that
the returned text is missing or every translation has been checked. If neither
contains the key, the function throws instead of returning the raw key.

Duplicate locale codes or message keys are not refused; `.find` uses the first
match. A present entry with `value: ''` is still found, so it can resolve to an
empty string without fallback. Factories and lookup do not automatically invoke
validation, and successful validation does not guarantee every requested key
exists. No module supplies a complete catalog, fallback hierarchy, plural forms,
translation provenance, rendered accessibility or actual bidirectional layout.

### Placeholder substitution is not validation or escaping

With no placeholder list or an empty list, lookup returns the template unchanged.
Otherwise it replaces each `{<digits>}` occurrence with the zero-based supplied
entry when the parsed index is below the list length; out-of-range occurrences
remain unchanged. Replacement uses a callback, so supplied dollar-sign text is
not a replacement-pattern program. It still is **unescaped text**, not safe HTML,
URL, shell or other context-specific output. It does not require every index,
validate the placeholder array or implement named/ICU/plural messages.

`validateLocaleString(key, value)` checks, in order:

1. A value exactly equal to the key is a raw-key failure.
2. Repeated numeric placeholders, compared by parsed number, are a failure.
3. Unequal counts of `{` and `}` are a failure.

Equal brace counts are not proof of balanced/order-correct syntax. Named or
nested-looking braces and reversed braces can satisfy these checks; an empty
value unequal to its key can also succeed. Numeric tokens with different leading
zeroes can be duplicates because they parse to the same number. The validator
does not compare source/translated placeholder sets, prohibit every leftover
placeholder, check actual substitution inputs or reject duplicate message keys.
These limits are important despite the source comment about properly closed
placeholders.

## References, exceptions and privacy

Readonly TypeScript fields do not deep-freeze state, locales, catalogs or returned
objects. Consumers can retain/mutate references; shallow state copies or sorted
arrays do not isolate those mutations. There is no transaction, audit callback,
storage, rollback or concurrency protocol in these two modules.

Interface factories/accessors/lookup throw `Error` for their selected refusals;
validation helpers return a success/failure object. They are not wrapped in a
universal catch for arbitrary runtime shapes or getters. Some error messages
include supplied locale codes/keys, while resolved text and placeholders preserve
supplied content. No text is automatically redacted, sanitized or encrypted.
Observe the consuming application's data and output-context requirements.

## Source evidence and remaining scope

The [negotiation conformance source](../../tests/conformance/localisation/localenegotiation.conformance.test.ts)
contains five named cases for precedence, selected explicit errors, repeated
deterministic calls, the forwarding helper and inherited-alias rejection. Its
browser `es` case explicitly expects source `en`, not direct browser support.
The [interface conformance source](../../tests/conformance/localisation/interfacelocalisation.conformance.test.ts)
contains five named cases for selected factories/lookups, source fallback/missing
key, active switching, native-name sorting and raw-key/brace/duplicate-placeholder
refusal. Their source assertions do not cover every input or establish a rendered
localized interface, comprehensive translation coverage or locale-standard
compliance.

Both complete sources and both complete conformance files were read for this
bounded [UIF-265](https://linear.app/maldous/issue/UIF-265) reference. No product
import, dependency installation, typecheck, test, browser/storage interaction,
external translation import or accepted-suite replay was performed. Existing
executed receipts keep their original scope. This new documentation does not
change shared indexes, runtime behavior, source rights, native custody or release
gates, or complete the original state-machine inventory or production acceptance.
