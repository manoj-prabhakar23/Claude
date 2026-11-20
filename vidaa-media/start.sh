#!/usr/bin/env sh
# Start the Home Cinema server on macOS / Linux / Raspberry Pi.
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Node.js is not installed - see https://nodejs.org"; exit 1; }
[ -f config.json ] || cp config.example.json config.json
exec node server/server.js "$@"
