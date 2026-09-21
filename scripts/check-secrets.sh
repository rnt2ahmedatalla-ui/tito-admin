#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PATTERNS=(
  'service_role'
  'sbp_'
  'postgres://'
  'SUPABASE_DB_URL'
  '"role":"service_role"'
)

FAILED=0

for pattern in "${PATTERNS[@]}"; do
  if git ls-files -z 2>/dev/null | xargs -0 grep -l -E "$pattern" 2>/dev/null; then
    echo "ERROR: Found forbidden pattern: $pattern"
    FAILED=1
  fi
done

if [ "$FAILED" -eq 1 ]; then
  echo "Secret scan FAILED"
  exit 1
fi

echo "Secret scan passed"
exit 0
