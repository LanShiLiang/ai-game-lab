#!/usr/bin/env sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
 echo "Install Node.js 20+ from https://nodejs.org/ first."
 exit 1
fi
node -e 'if(Number(process.versions.node.split(".")[0])<20)process.exit(1)' || { echo "Node.js 20+ is required."; exit 1; }
if [ ! -f node_modules/ws/package.json ]; then
 echo "Package incomplete: please extract all files again."
 exit 1
fi
exec node scripts/racing-server.mjs --open "$@"
