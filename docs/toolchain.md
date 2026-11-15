# Reproducible development checks

This readiness contract adopts TypeScript 5.9.3 and @types/node 24.19.2 for the canonical source snapshot based on 1bc471ad5eacd09013bf91450e36b28104487b12. Node 24.16.0 and npm 11.13.0 are the verified bootstrap pair. .node-version, packageManager and package-lock.json record those choices. The existing Node >=22 engine range is unchanged; this evidence does not assert every version in that range is tested.

From a clean checkout using the recorded Node/npm versions:

    npm ci --ignore-scripts --no-audit --no-fund
    npm run typecheck
    npm test
    npm run test:conformance

The original bootstrap adoption preserved the check scripts and compiler configuration. The selected artifact-package integration also includes `packages/*/src` and `packages/*/tests` in typechecking and package tests in `npm test`; capability conformance retains its separate command. Do not supply an undeclared --types node override, an ambient global compiler, or an unpinned latest TypeScript. Development dependency versions and package integrity are locked. No package lifecycle scripts are required for these checks.

The bootstrap evidence qualifies reproducible source-level checks at its recorded snapshot. The later artifact-package selection is bounded in README.md; it does not adopt the whole experience candidate, import V1/i18n, or qualify browser/API/MCP/staging/production behavior. Source checks alone do not prove independently decoded emitted images. Historical test results retain their original scope.
