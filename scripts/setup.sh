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

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
  echo "  → Edit .env: set SESSION_SECRET, SEED_* values, and optional integrations."
  echo ""
else
  echo "Using existing .env"
fi

echo "==> Installing dependencies (npm ci)"
npm ci

if command -v docker >/dev/null 2>&1; then
  echo "==> Starting PostgreSQL (docker compose)"
  docker compose up -d
else
  echo "==> Docker not found — ensure PostgreSQL is running and DATABASE_URL in .env is correct"
fi

echo "==> Applying database schema"
npm run db:push

echo "==> Seeding initial tenant (idempotent)"
npm run db:seed

echo ""
echo "Setup complete."
echo ""
echo "  Start the app:  npm run dev"
echo "  Open:           http://localhost:3000"
echo ""
echo "  First login:    use SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD from .env"
echo "                  or register at /register (first user becomes admin)"
echo ""
echo "  To get future updates:  npm run update"
echo "  Full guide:             docs/INSTALL.md"
