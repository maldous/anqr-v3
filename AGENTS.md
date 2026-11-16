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

## Optional maintenance environment

When UIF orchestration is selected, the execution environment supplies its
pinned [UIF operating policy](https://github.com/maldous/uif/blob/develop/docs/agents/uif-worker-policy.md)
and ANQR executor profile. Record the policy version, digest, source revision
and actual executor in the existing task handoff; a link alone does not prove
installation or adoption. Keep session allocation, quota recovery and shared
host admission in that environment. ANQR's source, toolchain, product checks
and acceptance remain governed by this repository and require no UIF
installation.


## Task-specific guidance and capability discovery

Use [agent capability routing](docs/agent-capabilities.md) for repository
review, presentation and provider tooling. Resolve relevant skills and plugins
from the actual executing environment, including its repository-local
`.agents/skills` when present; read the applicable SKILL.md before use. Record
readability, discoverability, successful invocation and authentication separately.
Never infer a working tool, permission or product qualification from a link.

Use the existing shared repository-docs-review workflow for revision-bound
documentation work where available. For actual presentation work, use the
official Impeccable guidance with the selected target and preserve the approved
brief and QR contracts. Verify Context7, language/format/security guidance and
Cloudflare/Netlify capabilities only when relevant to the task. Record precise
availability gaps without adding universal release gates or runtime dependencies.
Keep current writer/publisher custody and accepted check receipts intact.
