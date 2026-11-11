# ANQR V3

**ANQR product capabilities, developed through USF V3.**

This TypeScript repository contains ANQR's next-generation product implementation and conformance tests. It separates product source from the semantic delivery foundation in [USF V3](https://github.com/maldous/usf-v3).

[Matthew Aldous](https://aldous.info/) · [ANQR website](https://anqr.link/) · [Earlier ANQR monorepo](https://github.com/maldous/anqr) · [Translations](https://github.com/maldous/anqr-i18n)

## Explore the source

[`src/capabilities/`](src/capabilities/) organises work into payload, creation, presentation, analysis, distribution, experience, localisation, quality, trust and enterprise capabilities. [`tests/conformance/`](tests/conformance/) contains the corresponding conformance work.

Directory names describe the scope of the implementation; they do not establish that every capability is production-ready or deployed on the public website.

## Development

Requires **Node.js 22 or later** and TypeScript tooling. The package provides these scripts:

```sh
npm run typecheck
npm test
npm run test:conformance
```

Use the pinned Node/npm versions and locked installation in [`docs/toolchain.md`](docs/toolchain.md). See [`package.json`](package.json) for the exact commands and [`tsconfig.json`](tsconfig.json) for compiler settings. These source checks use this checkout and its development dependencies; they require no UIF, CIX, OffMenu or Circular Quay checkout or running service. The USF links above preserve historical foundation context.

UIF can provide optional parent operational integration and remains responsible for the shared Stokowski, Windmill, LangChain, GitHub and Linear integration across Foo local and durable cloud. Using that integration retains its ownership and admission controls; it does not make UIF a prerequisite for ANQR's local source checks.

This checkout provides capability source and conformance tests, with no application build, start or deployment command. It is not a standalone deployment of the ANQR web application. Product source-baseline and rights decisions remain unresolved; source checks do not establish working browser/API/MCP journeys or staging/production readiness.
