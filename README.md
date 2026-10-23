# `mastra build` installs workspace packages it already inlined

In a pnpm monorepo, `mastra build` packs every workspace package the app imports into
`.mastra/output/workspace-module/`, adds it to the output's `package.json` and installs it
with all of its dependencies, although the bundler inlines that package into the bundle and
nothing in the output imports it at runtime. An app that imports one constant from a
workspace package ships that package's whole dependency tree.

## Run it

```sh
pnpm install
pnpm repro
```

`pnpm repro` runs `mastra build` in `apps/agent`, then `check.ts` (run directly by Node.js
24) inspects `apps/agent/.mastra/output`.

`apps/agent` imports one constant, `GREETING`, from the workspace package `@repro/heavy`.
That package has a second entry point, `@repro/heavy/s3`, which the app never imports and
which depends on `@aws-sdk/client-s3`.

Output (`mastra@1.35.0`, `@mastra/deployer@1.79.0`):

```
workspace-module/:                 ["repro-heavy-0.0.0.tgz"]
package.json @repro/heavy:         file:./workspace-module/repro-heavy-0.0.0.tgz
output files importing it:        []
@aws-sdk/client-s3 installed:      yes

BUG: @repro/heavy is inlined into the bundle, yet it is packed and installed
     with its dependencies, which nothing in the output imports.
```

`GREETING` is inlined into `mastra.mjs`. `.mastra/output/node_modules` holds 174 packages
(187 MB), among them `@aws-sdk/client-s3` and its `@smithy` and `@aws-crypto` dependencies.

## Cause

`Bundler` (`packages/deployer/src/bundler/index.ts`) seeds the workspace packages to pack
from both maps the analysis returns:

```ts
for (const dep of [...analyzedBundleInfo.dependencies.keys(), ...analyzedBundleInfo.externalDependencies.keys()]) {
```

`dependencies` holds every package the analysis saw, including the workspace packages it
bundles. A workspace package is never external unless `bundler.externals` names it
(`analysisExternals` returns `null` for it), so a package that comes from `dependencies` only
is always inlined. `collectTransitiveWorkspaceDependencies` and `packWorkspaceDependencies`
then pack it, `writePackageJson` lists it, and the install brings its dependencies.

## Fix

Seed the packing from `externalDependencies` only, the packages the bundle still imports at
runtime:

```ts
for (const dep of analyzedBundleInfo.externalDependencies.keys()) {
```

A workspace package the app needs as a package, for example one loaded with
`node --import`, stays installed by naming it in `bundler.externals`.

With that change applied to the published `dist/` (via `pnpm patch`), `pnpm repro` reports:

```
workspace-module/:                 []
package.json @repro/heavy:         (absent)
output files importing it:        []
@aws-sdk/client-s3 installed:      no

OK: only workspace packages the bundle imports at runtime are installed.
```

with 147 packages (167 MB) in `node_modules`, and `node .mastra/output/index.mjs` still
starts and prints `GREETING`.

## Environment

- `mastra` 1.35.0, `@mastra/core` 1.79.0, `@mastra/deployer` 1.79.0
- pnpm 12.9.1, Node.js 24.20.0, Linux
