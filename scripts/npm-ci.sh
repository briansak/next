#!/usr/bin/env bash
# Project-scoped npm ci for npm 11+.
#
# `npm run setup` injects NPM_CONFIG_ALLOW_SCRIPTS from ~/.npmrc into the environment.
# npm rejects that for project installs — this repo uses package.json allowScripts instead.
set -euo pipefail

while IFS= read -r line; do
  name="${line%%=*}"
  unset "$name" 2>/dev/null || true
done < <(env | grep -iE '^npm_config.*allow[-_]?scripts' || true)

exec npm ci "$@"
