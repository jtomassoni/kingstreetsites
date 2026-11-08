#!/bin/bash
# LaunchAgent wrapper: run GameStop/Best Buy restock checks from this Mac.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
exec npm run --silent restock:check
