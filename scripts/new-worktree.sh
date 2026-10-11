#!/usr/bin/env bash
# Create an Atlas worktree under ../Atlas-worktrees/<name> on a new branch from
# origin/main, with a dev-only .env.local.
#
# The worktree's .env.local is a symlink to the main checkout's .env.dev-public
# (R2_PUBLIC_URL, CARTO_BASEMAP_API_KEY and VITE_ flags only). It must never
# point at the main checkout's full .env.local: that file holds R2 write keys,
# and worktrees rely on having none so pipeline runs there stay dry-runs.
#
# Usage: scripts/new-worktree.sh <name> <branch>
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: $0 <name> <branch>" >&2
  exit 1
fi
name="$1"
branch="$2"

# The main checkout is the first entry in `git worktree list`, wherever this runs from.
main_checkout="$(git worktree list --porcelain | awk '/^worktree /{print substr($0, 10); exit}')"
dev_env="$main_checkout/.env.dev-public"
target="$(dirname "$main_checkout")/Atlas-worktrees/$name"

if [ ! -f "$dev_env" ]; then
  echo "Missing $dev_env (R2_PUBLIC_URL, CARTO_BASEMAP_API_KEY and VITE_ flags only, no R2 write keys)." >&2
  echo "Create it in the main checkout first." >&2
  exit 1
fi
if [ -e "$target" ]; then
  echo "$target already exists." >&2
  exit 1
fi

git -C "$main_checkout" fetch origin
git -C "$main_checkout" worktree add -b "$branch" "$target" origin/main
ln -s "$dev_env" "$target/.env.local"

echo
echo "Worktree: $target"
echo "Branch:   $branch"
echo ".env.local -> $dev_env"
echo "Next: cd \"$target\" && npm ci"
