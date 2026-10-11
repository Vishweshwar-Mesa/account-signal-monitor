#!/usr/bin/env bash
# Fails when src/, supabase/, config/ or scripts/ changed in the pushed range but docs/PROJECT_CONTEXT.md did not.
set -euo pipefail
BASE="${1:-}"; HEAD="${2:-HEAD}"
if [ -z "$BASE" ] || [ "$BASE" = "0000000000000000000000000000000000000000" ] || ! git cat-file -e "$BASE" 2>/dev/null; then
  BASE="$(git rev-parse "$HEAD~1" 2>/dev/null || true)"
fi
[ -z "$BASE" ] && { echo "No base commit, skipping."; exit 0; }
CHANGED="$(git diff --name-only "$BASE" "$HEAD")"
if echo "$CHANGED" | grep -qE '^(src|supabase|config|scripts)/'; then
  if ! echo "$CHANGED" | grep -qx 'docs/PROJECT_CONTEXT.md'; then
    echo "Code changed but docs/PROJECT_CONTEXT.md did not. Update the status block and session log."
    exit 1
  fi
fi
echo "Context check passed."
