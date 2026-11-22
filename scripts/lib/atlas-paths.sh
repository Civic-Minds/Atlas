# Shared paths for Atlas's shell scripts, the same whichever checkout runs them (the main one or a worktree).
# Source it: . "$(dirname "$0")/lib/atlas-paths.sh"

# The main checkout is the first entry in `git worktree list`, wherever this runs from.
# Read the whole list (no early awk exit), so git never gets SIGPIPE under pipefail.
atlas_main_checkout() {
  git worktree list --porcelain | awk '/^worktree /{if (!seen) print substr($0, 10); seen=1}'
}

# The folder every worktree lives in, next to the main checkout (docs/engineering/BRANCH_WORKFLOW.md).
atlas_worktrees_dir() {
  echo "$(dirname "$(atlas_main_checkout)")/Atlas-worktrees"
}
