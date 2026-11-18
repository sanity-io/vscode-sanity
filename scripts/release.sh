#!/usr/bin/env bash
# Run by changesets/action on main once no changesets are left, i.e. after a version PR is merged.
# Publishes the current version to both registries, then lets `changeset publish` create the git tag,
# which the action pushes and turns into a GitHub release. Nothing is tagged unless both publishes
# succeeded, so a failed run can be retried; --skip-duplicate makes the retry a no-op where it already
# went through.
set -euo pipefail

version="$(node -p "require('./package.json').version")"

if git rev-parse -q --verify "refs/tags/v${version}" >/dev/null; then
  echo "v${version} is already released"
else
  pnpm run package
  vsix="vscode-sanity-${version}.vsix"

  failed=0
  pnpm exec vsce publish --oidc --packagePath "$vsix" --skip-duplicate || failed=1
  pnpm exec ovsx publish --packagePath "$vsix" --trusted-publishing --skip-duplicate || failed=1
  if [ "$failed" -ne 0 ]; then
    echo "Publishing v${version} failed, not tagging it so the next run retries" >&2
    exit 1
  fi
fi

pnpm exec changeset publish
