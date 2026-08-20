#!/bin/sh
set -e
CHROME=$(find /root/.cache/ms-playwright /ms-playwright \( -name chrome -o -name chromium \) -type f 2>/dev/null | head -n 1 || true)
if [ -n "$CHROME" ]; then
  export KANE_CLI_CHROME_PATH="$CHROME"
fi
export PATH="${PATH}:/usr/local/bin:/root/.local/bin"
exec "$@"
