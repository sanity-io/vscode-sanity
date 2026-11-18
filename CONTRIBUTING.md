# Contributing

Thanks for helping improve the Sanity extension for Visual Studio Code and Cursor. This page covers running it locally, testing it, and how releases work.

## Setup

You need the Node.js version in `package.json` under `volta` (also used by CI) and [pnpm](https://pnpm.io/). The `packageManager` field pins the pnpm version, so [Corepack](https://nodejs.org/api/corepack.html) or [Volta](https://volta.sh/) will pick the right one.

```sh
git clone https://github.com/sanity-io/vscode-sanity.git
cd vscode-sanity
pnpm install
```

## Run the extension

1. Open the repository in VS Code.
2. Open **Run and Debug** and start the **Extension** launch configuration. It builds the extension and opens a second VS Code window, the Extension Development Host, with it loaded.
3. In that window, open a file the extension handles: a `.groq` file, or a JavaScript or TypeScript file with a `groq` template literal.
4. After changing the code, rebuild with `pnpm run build` (or keep `pnpm run watch` running) and reload the Extension Development Host with `Ctrl+R` (`Cmd+R` on Mac).

To try **Execute Query**, open a folder in the Extension Development Host that has a `sanity.cli.ts` with a `projectId` and `dataset`.

## Checks

CI runs these on every pull request:

```sh
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run package
```

- `pnpm run lint` runs [oxlint](https://oxc.rs/docs/guide/usage/linter).
- `pnpm run typecheck` runs `tsc --noEmit`.
- `pnpm run test` builds the extension, compiles the tests and runs the unit tests with the Node.js test runner.
- `pnpm run package` builds a `.vsix` file.

### Integration tests

These are not run in CI. They download VS Code and check the GROQ hover end to end:

```sh
pnpm run test:integration
pnpm run test:integration:tsgo
```

The first runs against the TypeScript extension built into VS Code. The second installs the TypeScript 7 extension (`TypeScriptTeam.native-preview`) from the Marketplace and runs it against the `.groq` files in `fixtures/hover-project`. On Linux without a display, prefix either command with `xvfb-run -a`.

### Try the packaged extension

`pnpm run package` writes `vscode-sanity-<version>.vsix` in the repository root. Install it from the Extensions view with **Install from VSIX...**, or:

```sh
code --install-extension vscode-sanity-<version>.vsix
```

Use `cursor` instead of `code` for Cursor.

## Releases

Releases use [Changesets](https://github.com/changesets/changesets), and the extension follows [semantic versioning](https://semver.org/). Whether a change is a patch, minor or major release, and what the changelog says, comes from the changeset in the pull request.

### Add a changeset

Add a changeset to every pull request that changes what users get from the extension:

```sh
pnpm changeset
```

Pick the bump and write a short note for the changelog, aimed at people using the extension. Commit the generated file in `.changeset/` with your change.

Changes that should not be released, such as docs, tests or CI, still get a changeset file, but an empty one:

```md
---
---

Describe the change here. It is not published.
```

### How a release happens

1. When a pull request with changesets is merged to `main`, the [Release workflow](.github/workflows/release.yml) opens or updates a "Version Packages" pull request. It bumps the version in `package.json` and writes `CHANGELOG.md`.
2. A maintainer merges that pull request. The workflow then runs `scripts/release.sh`, which packages the `.vsix`, publishes it to the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=sanity-io.vscode-sanity) and [Open VSX](https://open-vsx.org/extension/sanity-io/vscode-sanity), and creates the `v<version>` tag and GitHub release.
3. The workflow attaches the `.vsix` to the GitHub release.

If a publish fails, nothing is tagged. Re-run the workflow to retry; versions that were already published are skipped.

Publishing only works in CI. The workflow signs in to both registries with GitHub OIDC trusted publishing, so there are no access tokens to publish with locally.

To see what the next release will contain, run:

```sh
pnpm changeset status
```
