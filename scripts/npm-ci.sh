#!/usr/bin/env bash
# Project-scoped npm ci. Clears NPM_CONFIG_ALLOW_SCRIPTS from the environment —
# npm 11 rejects that for project installs when package.json declares allowScripts.
set -euo pipefail

unset NPM_CONFIG_ALLOW_SCRIPTS
exec npm ci "$@"
