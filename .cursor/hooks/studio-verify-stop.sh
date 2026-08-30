#!/usr/bin/env bash
# Cursor stop hook: Kane-on-Studio gate. Fail open unless the CLI returns followup_message.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
TSX=""
if [[ -x "$ROOT/node_modules/.bin/tsx" ]]; then
  TSX="$ROOT/node_modules/.bin/tsx"
elif [[ -x "$ROOT/packages/studio-verify/node_modules/.bin/tsx" ]]; then
  TSX="$ROOT/packages/studio-verify/node_modules/.bin/tsx"
fi
if [[ -z "$TSX" ]]; then
  echo '{}'
  exit 0
fi
exec "$TSX" "$ROOT/packages/studio-verify/src/cli.ts" hook
