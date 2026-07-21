#!/usr/bin/env bash
# First-time install for a fresh clone of Next.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Next — first-time setup"
echo "    Repository: $ROOT"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js 20+ is required. Install from https://nodejs.org"
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Error: Node.js 20+ is required (found $(node -v))"
  exit 1
fi

if [ "${NEXT_MANAGE_POSTGRES:-}" != "false" ]; then
  echo "==> Checking Docker (required for local Postgres)"
  node scripts/postgres-docker.mjs check-docker
  echo ""
fi

if [ ! -f .env ]; then
  node scripts/ensure-env.mjs
  echo ""
else
  echo "Using existing .env"
fi

echo "==> Installing dependencies (npm ci)"
npm ci

echo "==> Starting PostgreSQL (docker compose, on demand)"
node scripts/postgres-docker.mjs ensure

echo "==> Applying database schema"
npm run db:push

echo "==> Seeding ingestion policies (idempotent)"
npm run db:seed

if [ "${NEXT_MANAGE_POSTGRES:-}" != "false" ]; then
  echo "==> Stopping PostgreSQL until you run npm run next"
  node scripts/postgres-docker.mjs stop || true
fi

echo ""
echo "Setup complete."
echo ""
echo "  Start the app:  npm run next"
echo "  (opens your browser automatically)"
echo ""
echo "  First launch:   complete the setup questionnaire (partner, preferences, Webex)"
echo "  Webex guide:    docs/WEBEX_GETTING_STARTED.md"
echo ""
echo "  To get future updates:  npm run update"
echo "  To remove local data: npm run uninstall"
echo "  Full guide:             docs/INSTALL.md"
echo ""
