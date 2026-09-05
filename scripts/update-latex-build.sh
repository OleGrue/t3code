#!/usr/bin/env bash
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

if [[ $(git branch --show-current) != "latex" ]]; then
  echo "Run this updater from the latex branch." >&2
  exit 1
fi
if [[ -n $(git status --porcelain) ]]; then
  echo "The worktree has uncommitted changes; refusing to merge or build." >&2
  exit 1
fi

git fetch upstream --tags --prune
tag=$(gh api repos/pingdotgg/t3code/releases/latest --jq .tag_name)
if [[ ! "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Latest upstream release is not a stable tag: $tag" >&2
  exit 1
fi

if ! git merge-base --is-ancestor "$tag" HEAD; then
  git merge --no-edit "$tag"
fi

version=${tag#v}
pnpm install --frozen-lockfile
pnpm exec vp run --filter @t3tools/web test
pnpm exec vp run --filter @t3tools/web typecheck
T3CODE_DESKTOP_UPDATE_REPOSITORY=OleGrue/t3code \
  pnpm exec vp run dist:desktop:dmg:arm64 --build-version "$version"

echo "Built T3 Code $version with LaTeX support in $repo_root/release"
