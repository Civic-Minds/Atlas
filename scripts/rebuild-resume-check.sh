#!/usr/bin/env bash
# rebuild-release resume (start_at=history|publish): check the earlier run built what main holds now, and
# put its saved expiry stamps back. Usage: rebuild-resume-check.sh <stamps dir> <manifest dir>
#
# The earlier run's stamps go to main as their own pull request, so once that merges main has moved on
# from the commit the run built (#1865). That one case is safe to resume: main's files are exactly the
# built commit plus the saved stamps. Any other change on main would mix builds, so it is refused.
set -euo pipefail

state_dir="$1"
manifest_dir="$2"
patch="$state_dir/stamps.patch"
head_sha="$(git rev-parse HEAD)"

built=""
for dir in "$state_dir" "$manifest_dir"; do
  [ -f "$dir/sha.txt" ] || continue
  sha="$(tr -d '[:space:]' < "$dir/sha.txt")"
  if [ -n "$built" ] && [ "$sha" != "$built" ]; then
    echo "The saved stamps (${built:0:7}) and release manifest (${sha:0:7}) come from different builds."
    exit 1
  fi
  built="$sha"
done

refuse_moved() {
  echo "main is now ${head_sha:0:7}; the run built ${built:0:7}. $1"
  echo "Resuming across a new commit would mix builds. Start again with start_at=reprocess."
  exit 1
}

if [ -n "$built" ] && [ "$built" != "$head_sha" ]; then
  [ -s "$patch" ] || refuse_moved "The run saved no stamps, so nothing explains the change."
  if ! git cat-file -e "$built^{commit}" 2>/dev/null; then
    git fetch --no-tags --quiet --depth=50 origin "$built" 2>/dev/null || true
  fi
  git cat-file -e "$built^{commit}" 2>/dev/null || refuse_moved "Its commit can't be fetched to compare."
  index="$(mktemp)"
  trap 'rm -f "$index"' EXIT
  GIT_INDEX_FILE="$index" git read-tree "$built"
  GIT_INDEX_FILE="$index" git apply --cached "$patch" 2>/dev/null || refuse_moved "Its saved stamps don't apply to it."
  if [ "$(GIT_INDEX_FILE="$index" git write-tree)" != "$(git rev-parse 'HEAD^{tree}')" ]; then
    refuse_moved "main has changes besides that run's own stamps."
  fi
  echo "main is ${head_sha:0:7}: the run's build (${built:0:7}) plus its own stamps, whose pull request was merged. Resuming."
  exit 0
fi

if [ -s "$patch" ]; then
  if git apply --check "$patch" 2>/dev/null; then
    git apply "$patch"
  elif git apply -R --check "$patch" 2>/dev/null; then
    echo "The stamps are already on main (their pull request was merged)."
  else
    echo "The saved stamps neither apply nor are already applied."
    exit 1
  fi
fi
