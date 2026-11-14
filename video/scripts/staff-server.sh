#!/bin/sh
# A throwaway local copy of the app for recording the staff clips (draft, review, edit,
# reject, publish), so a fictional clerk's approvals never reach the live site.
#   sh scripts/staff-server.sh [scratch-data-dir]    -> http://127.0.0.1:4199
# The server reads the committed data/ and writes only to DATA_DIR, the scratch copy.
# STAFF_TOKEN and the other secrets come from the repo's .env and are never printed.
set -e
repo="$(cd "$(dirname "$0")/../.." && pwd)"
scratch="${1:-${TMPDIR:-/tmp}/municipal-agents-staff-data}"
case "$scratch" in "$repo"/*) echo "refusing: the scratch copy must be outside the repo" >&2; exit 1 ;; esac
rm -rf "$scratch"
mkdir -p "$scratch"
rsync -a --exclude cache --exclude 'log.db*' "$repo/data/" "$scratch/"
[ -f "$repo/web/dist/index.html" ] || npm --prefix "$repo/web" run build
cd "$repo"
echo "staff server: data copy in $scratch, http://127.0.0.1:4199"
DATA_DIR="$scratch" PORT=4199 HOST=127.0.0.1 exec node --env-file=.env server/main.ts
