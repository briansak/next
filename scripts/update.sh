#!/usr/bin/env bash
# Pull latest code from GitHub and apply dependency + schema updates.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

UPSTREAM="${1:-origin}"
BRANCH="${2:-main}"

echo "==> Next — update from Git"
echo "    Repository: $ROOT"
echo ""

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Error: not a git repository. Clone from GitHub first:"
  echo "  git clone git@github.com:briansak/next.git"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Warning: you have uncommitted local changes."
  echo "  Stash or commit them before updating, or you may get merge conflicts."
  echo ""
  read -r -p "Continue anyway? [y/N] " confirm
  case "$confirm" in
    y|Y|yes|YES) ;;
    *)
      echo "Aborted."
      exit 1
      ;;
  esac
fi

echo "==> Fetching $UPSTREAM/$BRANCH"
git fetch "$UPSTREAM" "$BRANCH"

echo "==> Merging latest changes (fast-forward preferred)"
git merge --ff-only "$UPSTREAM/$BRANCH" 2>/dev/null || git pull "$UPSTREAM" "$BRANCH"

echo "==> Installing dependencies (npm ci)"
npm ci

echo "==> Applying database schema changes"
npm run db:push

echo ""
echo "Update complete."
echo ""
echo "  Restart the dev server if it is running:  npm run dev"
echo "  Production:                               npm run build && npm run start"
echo ""
echo "  Your .env and database data were not modified."
echo "  See docs/UPDATING.md if something breaks after an update."
