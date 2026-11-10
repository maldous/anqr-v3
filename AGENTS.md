# Shared UIF worker directions

At every startup, including independent Foo work, read
[the shared worker policy](docs/agents/uif-worker-policy.md) and
[its local version manifest](docs/agents/uif-worker-policy.json).
Apply them with this repository's project-specific instructions, not instead of them.

Read README.md, package.json, tsconfig.json and relevant .usf project declarations before changes. The declared Node version is >=22. Applicable source checks are npm run typecheck, npm test and npm run test:conformance; report actual toolchain/results, not assumed readiness. Preserve source-baseline and rights decisions; a foundation link is not permission to import or change another project.
