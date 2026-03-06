#!/usr/bin/env bash
set -euo pipefail

# Setup a git worktree with its own database and env files.
#
# Usage:
#   ./scripts/setup-worktree.sh <branch-name> [--no-seed]
#
# Creates:
#   .worktrees/pocketrealm-<name>/   — git worktree
#   PostgreSQL database            — pocketrealm_<name>
#   apps/api/.env                  — copied from canonical, DATABASE_URL patched
#   packages/database/.env         — DATABASE_URL for Prisma
#   apps/web/public/assets         — symlink/junction to canonical assets

CANONICAL_ROOT="${USERPROFILE:-$HOME}/.config/PocketRealm"
CONTAINER="pocketrealm-postgres"
PG_USER="postgres"
PG_PORT="5433"
DEFAULT_DB="pocketrealm"

usage() {
  echo "Usage: $0 <branch-name> [--no-seed]"
  echo ""
  echo "Examples:"
  echo "  $0 feature-leaderboard"
  echo "  $0 fix-combat-bug --no-seed"
  exit 1
}

info()  { echo "[INFO] $1"; }
warn()  { echo "[WARN] $1"; }
err()   { echo "[ERR ] $1" >&2; }

# --- Args ---
[[ $# -lt 1 ]] && usage
BRANCH="$1"
NO_SEED=false
[[ "${2:-}" == "--no-seed" ]] && NO_SEED=true

# Sanitize branch name for DB and directory (replace non-alphanumeric with _)
SAFE_NAME=$(echo "$BRANCH" | sed 's/[^a-zA-Z0-9]/_/g' | tr '[:upper:]' '[:lower:]')
DB_NAME="pocketrealm_${SAFE_NAME}"
WORKTREE_DIR=".worktrees/pocketrealm-${BRANCH##*/}"

# --- Resolve repo root ---
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
WORKTREE_PATH="${REPO_ROOT}/${WORKTREE_DIR}"

info "Branch:    $BRANCH"
info "Worktree:  $WORKTREE_PATH"
info "Database:  $DB_NAME"

# --- Create worktree ---
if [[ -d "$WORKTREE_PATH" ]]; then
  warn "Worktree already exists: $WORKTREE_PATH"
else
  # Create branch if it doesn't exist, otherwise check it out
  if git show-ref --verify --quiet "refs/heads/$BRANCH" 2>/dev/null; then
    info "Branch '$BRANCH' exists, creating worktree..."
    git worktree add "$WORKTREE_PATH" "$BRANCH"
  else
    info "Creating new branch '$BRANCH' and worktree..."
    git worktree add -b "$BRANCH" "$WORKTREE_PATH"
  fi
fi

# --- Create database ---
info "Creating database '$DB_NAME' (if it doesn't exist)..."
docker exec "$CONTAINER" psql -U "$PG_USER" -tc \
  "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" \
  | grep -q 1 \
  && info "Database '$DB_NAME' already exists" \
  || docker exec "$CONTAINER" psql -U "$PG_USER" -c "CREATE DATABASE $DB_NAME;"

# --- Link env files ---
CANONICAL_API_ENV="${CANONICAL_ROOT}/apps/api/.env"
WORKTREE_API_ENV="${WORKTREE_PATH}/apps/api/.env"
WORKTREE_DB_ENV="${WORKTREE_PATH}/packages/database/.env"

# apps/api/.env — copy from canonical, patch DATABASE_URL
if [[ -f "$CANONICAL_API_ENV" ]]; then
  mkdir -p "$(dirname "$WORKTREE_API_ENV")"
  cp "$CANONICAL_API_ENV" "$WORKTREE_API_ENV"
  # Replace DATABASE_URL to point at worktree-specific database
  sed -i "s|DATABASE_URL=.*|DATABASE_URL=postgresql://${PG_USER}:${PG_USER}@localhost:${PG_PORT}/${DB_NAME}|" "$WORKTREE_API_ENV"
  info "Created apps/api/.env (DATABASE_URL -> $DB_NAME)"
else
  warn "Canonical API .env not found at $CANONICAL_API_ENV"
  warn "Creating minimal .env with local defaults..."
  mkdir -p "$(dirname "$WORKTREE_API_ENV")"
  cat > "$WORKTREE_API_ENV" <<EOF
DATABASE_URL=postgresql://${PG_USER}:${PG_USER}@localhost:${PG_PORT}/${DB_NAME}
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-secret-minimum-32-characters-long
PORT=4000
CORS_ORIGIN=http://localhost:3002
NODE_ENV=development
EOF
  info "Created apps/api/.env with defaults"
fi

# packages/database/.env — Prisma needs DATABASE_URL
mkdir -p "$(dirname "$WORKTREE_DB_ENV")"
echo "DATABASE_URL=postgresql://${PG_USER}:${PG_USER}@localhost:${PG_PORT}/${DB_NAME}" > "$WORKTREE_DB_ENV"
info "Created packages/database/.env"

# --- Link assets directory ---
CANONICAL_ASSETS="${CANONICAL_ROOT}/apps/web/public/assets"
WORKTREE_ASSETS="${WORKTREE_PATH}/apps/web/public/assets"

if [[ -d "$CANONICAL_ASSETS" ]]; then
  if [[ -e "$WORKTREE_ASSETS" ]]; then
    info "Assets link already exists"
  else
    mkdir -p "$(dirname "$WORKTREE_ASSETS")"
    # On Windows (Git Bash/MSYS), use junction via cmd; on Unix, use symlink
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
      # Convert to Windows paths for mklink
      WIN_TARGET=$(cygpath -w "$CANONICAL_ASSETS" 2>/dev/null || echo "$CANONICAL_ASSETS" | sed 's|/|\\|g')
      WIN_LINK=$(cygpath -w "$WORKTREE_ASSETS" 2>/dev/null || echo "$WORKTREE_ASSETS" | sed 's|/|\\|g')
      cmd //c "mklink /J \"$WIN_LINK\" \"$WIN_TARGET\"" > /dev/null 2>&1
      info "Linked assets (junction)"
    else
      ln -s "$CANONICAL_ASSETS" "$WORKTREE_ASSETS"
      info "Linked assets (symlink)"
    fi
  fi
else
  warn "Canonical assets not found at $CANONICAL_ASSETS (skipping)"
fi

# --- Install + migrate ---
info "Installing dependencies..."
(cd "$WORKTREE_PATH" && npm install)

info "Generating Prisma client..."
(cd "$WORKTREE_PATH" && npm run db:generate)

info "Running migrations..."
(cd "$WORKTREE_PATH" && npm run db:migrate)

if [[ "$NO_SEED" == false ]]; then
  info "Seeding database..."
  (cd "$WORKTREE_PATH" && npm run db:seed)
fi

echo ""
info "Worktree ready!"
info "  cd $WORKTREE_PATH"
info "  npm run dev"
echo ""
info "To tear down later:"
info "  ./scripts/teardown-worktree.sh $BRANCH"
