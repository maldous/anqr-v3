# ANQR product development

Read README.md, package.json and tsconfig.json before changes. Use the pinned
Node/npm versions and lockfile installation recorded in [.node-version](.node-version)
and [docs/toolchain.md](docs/toolchain.md). The declared Node range remains >=22;
this does not mean every version in that range has been tested.

The source checks are npm run typecheck, npm test and npm run test:conformance.
Report the actual toolchain, source revision and results; source checks do not
establish working browser/API/MCP journeys or staging/production readiness.

Preserve source-baseline and rights decisions, product requirements, unrelated
work and historical evidence. Repository or source links do not grant permission
to import code or change another project.

