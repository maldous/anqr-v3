## Fixed operating role

This repository belongs to the ANQR dedicated project role. Read the fixed project agents and general Cloud role
section in the local shared worker policy at startup and pass its version/hash to
children. Project cloud Git, CPU and storage are independent of Foo; optional MCP
execution must bind the correct host, project, worktree and branch. The general
Cloud role has no Git configuration or repository binding. Additional Foo Codex sessions require
restored allowance and current ownership checks. These are operating requirements,
not proof of provisioning, availability or universal adoption.

# Shared UIF worker directions

At every startup, including independent Foo work, read
[the shared worker policy](docs/agents/uif-worker-policy.md) and
[its local version manifest](docs/agents/uif-worker-policy.json).
Apply them with this repository's project-specific instructions, not instead of them.

Read README.md, package.json, tsconfig.json and relevant .usf project declarations before changes. Use the pinned Node/npm versions and lockfile installation recorded in [.node-version](.node-version) and [docs/toolchain.md](docs/toolchain.md). The declared Node range remains >=22; this does not mean every version in that range has been tested. Applicable source checks are npm run typecheck, npm test and npm run test:conformance; report actual toolchain/results, not assumed readiness. Preserve source-baseline and rights decisions; a foundation link is not permission to import or change another project.

