# ANQR

ANQR is a **product**. It is not a foundation, not a platform and not a layer
of USF.

Its semantic authority — capabilities, requirements, journeys, experiences and
its own profile revisions — is ANQR's, under the `urn:anqr:` namespace, on
ANQR's own version axis. That authority is currently hosted in the USF
repository under `graph/products/anqr/`, which is a hosting arrangement rather
than ownership.

## What this repository holds

The implementation, and nothing that is authority:

| path | holds |
|---|---|
| `packages/artefact/` | the QR artefact domain, its ports and its adapters |
| `packages/architecture/` | the architecture, experience and delivery checkers, and the projections they read |
| `apps/web/` | the Preact delivery surface |
| `src/capabilities/` | one module per declared capability, under the released capability convention |
| `tests/conformance/` | one behavioural proof per capability facet |

`packages/architecture/rules.json`, `experience.json` and `delivery.json` are
**projections derived from the USF graph**. They are not authority: if a
projection disagrees with the graph, the graph is right and the projection is
stale. Drift in either direction is a test failure on the USF side.

## Relationship to USF

**USF — the Universal Service Foundation** — supplies reusable capabilities and
the universal realisation, build, evidence and proof methodology. ANQR supplies
product meaning. The two are independently versioned, and an ANQR profile
revision binds to one identified USF foundation revision rather than to
whatever USF happens to become.

ANQR has no code dependency on USF and must not acquire one: USF is not in
`package.json`, and the canonical chain below runs in a clean clone with no
network.

## The canonical chain

```sh
npm ci
npm run typecheck
npm test
npm run architecture
npm run build
npm run delivery
npm run validate
```

`architecture` enforces the projected architecture rules; `delivery` checks the
delivery closure and mounts the real surface at each declared viewport class to
observe its interface semantics. The same chain runs in CI, and a test asserts
the two lists are identical so the automated gate cannot quietly narrow.

## The invariant

> Nothing is realised because code exists. It is realised when an exact
> semantic obligation can be traced through implementation and deterministic
> evidence to proof, against identified graph, dependency and artefact
> versions.

Naming and namespace conventions are defined once, in the USF repository at
`docs/naming.md`.
