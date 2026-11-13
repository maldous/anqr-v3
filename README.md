# ANQR V3

This TypeScript repository contains ANQR's product capability source and conformance tests.

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

Use the pinned Node/npm versions and locked installation in [`docs/toolchain.md`](docs/toolchain.md). See [`package.json`](package.json) for the exact commands and [`tsconfig.json`](tsconfig.json) for compiler settings. These source checks use this checkout and its locked development dependencies, with no sibling project checkout or running service required.

This checkout provides capability source and conformance tests, with no application build, start or deployment command. It is not a standalone deployment of the ANQR web application. Product source-baseline and rights decisions remain unresolved; source checks do not establish working browser/API/MCP journeys or staging/production readiness.
