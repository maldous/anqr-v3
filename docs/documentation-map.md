# Documentation inventory and dispositions

This is the documentation map for accepted ANQR source at commit
`745d522cd79ba097611cbc6950071fc729e221bd`, tree
`c51d4b6985aa5299bf4fee4249877eaa4865dc58`. It records the inspected snapshot,
not a claim that future branches, the public site or historical candidates are
equivalent. Refresh the affected rows when source or document ownership changes.

The ANQR project owner retains source/documentation delivery. Historical native
effects and reserved candidate files retain their existing custody; a missing
current runtime lease is not permission to replay them. Operational evidence and
remaining work are recorded in [UIF-265](https://linear.app/maldous/issue/UIF-265),
with the aggregate product work in [UIF-205](https://linear.app/maldous/issue/UIF-205).
This map introduces no product dependency, release gate or access permission.

## Inventory method and exact document set

Committed Git enumeration found 142 tracked paths: seven Markdown documents,
59 TypeScript source modules (39 capability and 20 artifact-package modules),
42 test files (39 conformance and three package tests), two optional validation
scripts, three SVG-evidence JSON records and 24 SVG/raster artifacts. The other
five files are `.gitignore`, `.node-version`, `package.json`, `package-lock.json`
and `tsconfig.json`. This count predates this map itself. There are no tracked
unlisted Markdown/MDX/RST/text guides, nested `AGENTS.md`, `AI.md`, repository-local
skills, CI workflows or hosting/mobile/store manifests in that snapshot.

Every document below is maintained by the ANQR source owner. The evidence guide
retains its historical source binding rather than becoming a current test run.
Git blob IDs make the inspected bytes traceable without copying their contents.

| Canonical document | Audience and purpose | Inspected Git blob |
| --- | --- | --- |
| [AGENTS.md](../AGENTS.md) | Coding agents: source checks, toolchain, optional maintenance and capability routing. | `c4d3b70320edfc2251ea7172720a6f7f351415b8` |
| [README.md](../README.md) | Developers and evaluators: repository scope, selected artifact package, example and product limits. | `4810676c1eee9793da258f0008cff86fd1cd6358` |
| [Agent capability routing](agent-capabilities.md) | Agents/operators: host-specific discovery, permitted use, recovery and publication boundaries. | `1cf9560d7a2da3cf76ffc400e0f361b14683a703` |
| [Capability and package index](reference/capability-index.md) | Developers/reviewers: all 59 source entry points, declaration shapes and related tests. | `ffc2343e75d6f12ff0729fa60aa2279506238f09` |
| [Toolchain](toolchain.md) | Contributors: exact Node/npm/development dependencies and supported check commands. | `0f6d0a74aaa85801aad5c1141e8182c8b14f2cf8` |
| [SVG evidence guide](validation/svg-output-633f023/README.md) | Reviewers: historical final-file decoding matrix, source manifests and optional reproduction. | `e2c49c5a7827d9c3e8ac4329b0522d8c8a4dcdf1` |
| [Artifact package guide](../packages/artefact/README.md) | In-process consumers: produce/export results, inputs, refusals, adapters and unsupported assumptions. | `79a478634ddeed391e4089d227bbde577786c63c` |

## Category coverage and gap/disposition matrix

“Present” means a canonical reference exists, not that every product promise is
implemented. “Absent” below is an observed source/document gap, not permission to
implement a replacement product. Existing issues own residuals; none is duplicated
as a new artificial gate.

| Category | Present contract or observed absence | Disposition / existing owner |
| --- | --- | --- |
| AI and agent instructions | One root AGENTS file; no nested instruction or project-local skill copy. It routes to the canonical toolchain and capability guide. | PR26 delivered the scoped routing. Actual host installation/adoption evidence stays in UIF-265, separately from readable documentation. |
| Project overview and source selection | Root README selects the artifact package only and distinguishes capability source from a deployed application. Broader baseline/rights language remains unresolved. | Preserve the original reserved source-selection work in [UIF-215](https://linear.app/maldous/issue/UIF-215); do not silently replace it with this inventory. |
| Setup and dependencies | `.node-version`, packageManager, lockfile and toolchain guide pin Node 24.16.0 / npm 11.13.0, TypeScript 5.9.3 and Node types 24.19.2. Declared Node range remains >=22. | Use locked bootstrap; do not infer every supported-range version was tested or reuse mismatched ambient dependencies. No sibling checkout is required. |
| Build and test commands | Exactly `typecheck`, `test` and `test:conformance`; compiler config includes capability/package source and tests. No build/start/deploy/lint script. | Document the actual commands only. Full test and conformance scopes overlap. Existing accepted checks are reused, not rerun for a documentation edit. |
| Architecture and ADRs | Package guide explains the in-process application, injected ports and separate capability models. No standalone ADR/architecture directory. | The package guide plus source index is the current architecture entry point. It is not an adopted whole-product architecture or a fabricated ADR history. Broader selection remains UIF-215/205. |
| Code and interface discovery | Index covers all 59 modules; its 1,329 exported declaration/re-export entries are declaration shapes, not unique callable APIs or semantic coverage. Source comments and types remain the detailed contract. | PR27 delivered complete path-level discovery. Correctness and usability of a particular interface still require reading its source/consumer and applicable tests. |
| Artifact consumer API and example | Package guide documents required inputs, separate production/export checks, three refusal kinds and injected dependencies. App result types differ from unimplemented port-contract shapes. | Keep the qualified example and explicit exception/untrusted-input limits. No separately published package manifest or npm distribution exists. |
| HTTP, MCP and enterprise delivery | Named capability modules model validation, state and result contracts. There is no server entry point, listening transport or deployment configuration in this edition. | Do not publish inferred endpoint/API/MCP instructions. [UIF-205](https://linear.app/maldous/issue/UIF-205) retains broader product-journey acceptance; [UIF-270](https://linear.app/maldous/issue/UIF-270) retains actual release/source/publisher qualification. |
| Phishing and reputation assessment | The selected offline URL-reputation contract is a distinct scope, not a generic HTTP/MCP delivery implementation or a selected external provider. | [UIF-209](https://linear.app/maldous/issue/UIF-209) owns that contract; [UIF-210](https://linear.app/maldous/issue/UIF-210) has the genuine approved-contract prerequisite. Do not infer reputation safety from decoding, delivery or an unknown result. |
| CLI and runtime configuration | Source-check commands and TypeScript/compiler configuration exist. Optional SVG scripts accept output directories. No product CLI, app environment-variable schema or service startup command is supplied. | Record this bounded non-applicability. Do not invent a CLI manual or credentials to make a guide executable. |
| User experience and accessibility | Real delivered reading surfaces are repository/package guides and static validation artifacts. Capability names for responsive, accessible and localized experiences are not a browser interface. | [UIF-262](https://linear.app/maldous/issue/UIF-262) owns actual presentation changes and measured rendered evidence; absent mobile/frontend journeys remain explicit limits. |
| Localization | Seven localization capability modules exist; the root README links a separate translations repository. No translation import, locale bundles or translation-contribution runbook is selected here. | Preserve independent source/rights and product boundaries. A link is neither import permission nor proof of localized UI delivery. |
| QR and artifact qualification | Historical SVG guide binds twelve cases to source `633f023d46affc185031aaf5ab7398874e067fe4`; manifests and final files remain tracked. Later selected PNG evidence and corrections have their own accepted receipts. | Preserve source-specific image evidence and [UIF-206](https://linear.app/maldous/issue/UIF-206), [UIF-207](https://linear.app/maldous/issue/UIF-207), [UIF-208](https://linear.app/maldous/issue/UIF-208). Internal-grid or source tests do not qualify every emitted image, camera or customization. |
| State-machine documentation | Capability models exist; the original broader implicit-state inventory and additional missing site bodies are not delivered by this source index. | [UIF-250](https://linear.app/maldous/issue/UIF-250) retains the original inventory, reviewed corrections and missing-body custody. Do not reconstruct, substitute or retransmit denied bodies. |
| Security, trust and privacy | Trust/analysis modules and package result boundaries are source-level contracts. No dedicated SECURITY policy, incident runbook or production access model is tracked. | Do not claim an audit or production privacy guarantee from named modules. Relevant security review follows the actual selected change; service/production obligations remain UIF-205/209/270. |
| Release, deployment and operations | No application deployment/runbook can be grounded in this checkout. The real legacy Netlify destination is inventoried separately; current V3 source/artifact/publisher binding is unqualified. | [UIF-270](https://linear.app/maldous/issue/UIF-270) owns release readiness and destination binding. A ready legacy deploy or authenticated provider read is not V3 publication acceptance. |

## Implemented, tested, reviewed and deployed are separate

- PR25 integrated selected corrections at
  `af6a23dd735a9cc92c29dd8db496e04aaaf73003`. Its accepted source typecheck,
  242-test full suite and overlapping 196-test conformance receipts retain their
  original scope. This map does not report a new run or broader qualification.
- PR26's agent guidance and PR27's source index have exact independent static
  reviews and source-branch environment-check receipts in UIF-265. Neither is an
  application build or a provider publication.
- The library/capability source and documentation are delivered through GitHub.
  The public web application, hosted API/MCP journeys, arbitrary image decoding,
  mobile/store channels and camera/accessibility/device behavior are not qualified
  by those source receipts.
- Environment facts can change. Record the executing host, instruction/tool
  versions, discoverability, successful invocation, authentication and authorized
  operation separately. The source guide deliberately does not hardcode a shared
  installation path as proof it exists on every executor.

## Cross-project alignment without a common runtime

ANQR's optional maintenance link names the UIF worker policy; ANQR's product
source remains TypeScript/Node and independently buildable. UIF's executor policy
governs a selected maintenance environment, not product semantics, legal source
selection or permission to replay historical native effects. Version/digest and
actual executor adoption belong to the task handoff, not an unverified claim from
following a URL.

The inspected UIF interface is policy **2.0.0** at accepted commit
`2b647b0cb480d92dc9130effe255038a51fdc2e3`, digest
`a032e8f09c4c67da9a328e19fe25af3c3e1d0a52b143aa70524e3281fb1754d1`:
[project integration](https://github.com/maldous/uif/blob/2b647b0cb480d92dc9130effe255038a51fdc2e3/docs/project-integration.md)
and [operating procedure](https://github.com/maldous/uif/blob/2b647b0cb480d92dc9130effe255038a51fdc2e3/docs/operating-procedure.md).
They retain ANQR's source/toolchain/rights, disjoint acknowledged allocation where
the authority adapter is unimplemented, and reconciliation of original effects.
This comparison does not assert deployment of that adapter or adoption of the
separately reviewed but then-unmerged policy 2.0.1 candidate.

The accepted public CIX comparison is commit
`a7f4689caace05275645b7a1e4775560fffc1e6e` in `cix-project/cix`, specifically
[AGENTS.md](https://github.com/cix-project/cix/blob/a7f4689caace05275645b7a1e4775560fffc1e6e/AGENTS.md)
and [capability routing](https://github.com/cix-project/cix/blob/a7f4689caace05275645b7a1e4775560fffc1e6e/docs/agent-capabilities.md).
Both distinguish readable/discoverable, executed, authenticated and authorized
capabilities and keep shared maintenance optional. CIX is native Rust/C++ with
Python/C bindings; ANQR's in-process TypeScript QR package is not that interface.
Neither project's absence of a frontend justifies creating one or sharing its
runtime/toolchain with the other. CIX's pending newer UIF policy-reference update
is not claimed as already adopted by this ANQR snapshot.

These are deliberate terminology/ownership comparisons, not evidence of a shared
implementation or a peer release dependency. Any actual interface defect needs
its own bounded evidence and existing responsible issue, not a blanket hold.
