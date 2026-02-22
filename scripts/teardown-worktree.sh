#!/usr/bin/env bash
set -euo pipefail

# Remove a worktree and its database.
#
# Usage:
#   ./scripts/teardown-worktree.sh <branch-name> [--keep-branch] [-y|--yes]
#
# Removes:
#   .worktrees/adventure-<name>/   — git worktree
#   PostgreSQL database            — adventure_<name>
#
# Does NOT remove the git branch unless you omit --keep-branch.

CONTAINER="adventure-postgres"
PG_USER="postgres"

usage() {
  echo "Usage: $0 <branch-name> [--keep-branch] [-y|--yes]"
  echo ""
  echo "Options:"
  echo "  --keep-branch   Don't delete the git branch (default: deletes it)"
  echo "  -y, --yes       Skip confirmation prompt (for CI/agent use)"
  echo ""
  echo "Examples:"
  echo "  $0 feature-leaderboard"
  echo "  $0 fix-combat-bug --keep-branch"
  echo "  $0 feature-leaderboard -y"
  exit 1
}

info()  { echo "[INFO] $1"; }
warn()  { echo "[WARN] $1"; }
err()   { echo "[ERR ] $1" >&2; }

# --- Args ---
[[ $# -lt 1 ]] && usage
BRANCH="$1"
KEEP_BRANCH=false
AUTO_YES=false
shift
for arg in "$@"; do
  case "$arg" in
    --keep-branch) KEEP_BRANCH=true ;;
    -y|--yes)      AUTO_YES=true ;;
    *)             err "Unknown option: $arg"; usage ;;
  esac
done

SAFE_NAME=$(echo "$BRANCH" | sed 's/[^a-zA-Z0-9]/_/g' | tr '[:upper:]' '[:lower:]')
DB_NAME="adventure_${SAFE_NAME}"
WORKTREE_DIR=".worktrees/adventure-${BRANCH##*/}"

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
WORKTREE_PATH="${REPO_ROOT}/${WORKTREE_DIR}"

info "Branch:    $BRANCH"
info "Worktree:  $WORKTREE_PATH"
info "Database:  $DB_NAME"

# --- Confirm ---
if [[ "$AUTO_YES" == false ]]; then
  read -rp "Remove worktree and drop database? [y/N] " confirm
  if [[ "$confirm" != [yY] ]]; then
    info "Aborted."
    exit 0
  fi
fi

# --- Remove worktree ---
if git worktree list --porcelain | grep -q "$WORKTREE_PATH"; then
  info "Removing worktree from git..."
  git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || {
    warn "git worktree remove failed, pruning stale entry..."
    git worktree prune
  }
fi

# Remove directory if it still exists (handles locked-file leftovers on Windows)
if [[ -d "$WORKTREE_PATH" ]]; then
  info "Removing worktree directory..."
  rm -rf "$WORKTREE_PATH" 2>/dev/null || {
    warn "Could not fully remove $WORKTREE_PATH (files may be locked by another process)"
    warn "Kill any processes using the directory, then run: rm -rf \"$WORKTREE_PATH\""
  }
fi

# Prune any stale worktree references
git worktree prune 2>/dev/null || true
info "Worktree removed"

# --- Drop database ---
info "Dropping database '$DB_NAME'..."
docker exec "$CONTAINER" psql -U "$PG_USER" -tc \
  "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" \
  | grep -q 1 \
  && docker exec "$CONTAINER" psql -U "$PG_USER" -c "DROP DATABASE $DB_NAME;" \
  && info "Database dropped" \
  || warn "Database '$DB_NAME' does not exist (already dropped?)"

# --- Delete branch ---
if [[ "$KEEP_BRANCH" == false ]]; then
  if git show-ref --verify --quiet "refs/heads/$BRANCH" 2>/dev/null; then
    info "Deleting branch '$BRANCH'..."
    git branch -d "$BRANCH" 2>/dev/null || {
      warn "Branch '$BRANCH' has unmerged changes. Use 'git branch -D $BRANCH' to force-delete."
    }
  else
    warn "Branch '$BRANCH' not found (already deleted?)"
  fi
else
  info "Keeping branch '$BRANCH' (--keep-branch)"
fi

echo ""
info "Teardown complete."
