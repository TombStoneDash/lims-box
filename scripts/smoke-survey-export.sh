#!/usr/bin/env bash
# smoke-survey-export.sh
# Verifies the Survey-Ready Export ZIP endpoint returns a valid ZIP.
# Usage: BASE_URL=http://localhost:3000 ./scripts/smoke-survey-export.sh
#        BASE_URL=https://lims-box.vercel.app ./scripts/smoke-survey-export.sh
#
# Exits 0 on success, 1 on failure.

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
ENDPOINT="${BASE_URL}/api/admin/personnel-pack/survey-export"
OUTFILE="/tmp/survey-ready-smoke-$$.zip"

echo "🔍  Hitting ${ENDPOINT} …"

HTTP_CODE=$(curl -s -w "%{http_code}" \
  -H "Accept: application/zip" \
  -o "${OUTFILE}" \
  "${ENDPOINT}")

if [[ "${HTTP_CODE}" != "200" ]]; then
  echo "❌  Expected HTTP 200, got ${HTTP_CODE}"
  cat "${OUTFILE}" 2>/dev/null | head -20 || true
  rm -f "${OUTFILE}"
  exit 1
fi

FILESIZE=$(stat -f%z "${OUTFILE}" 2>/dev/null || stat -c%s "${OUTFILE}")
if [[ "${FILESIZE}" -lt 500 ]]; then
  echo "❌  Response is only ${FILESIZE} bytes — too small to be a valid ZIP"
  rm -f "${OUTFILE}"
  exit 1
fi

# Check ZIP magic bytes (PK\x03\x04)
MAGIC=$(xxd -p -l 4 "${OUTFILE}")
if [[ "${MAGIC}" != "504b0304" ]]; then
  echo "❌  File does not start with ZIP magic bytes (got ${MAGIC})"
  rm -f "${OUTFILE}"
  exit 1
fi

# List ZIP contents
echo "✅  HTTP 200 · ${FILESIZE} bytes · valid ZIP magic"
echo ""
echo "📦  Contents:"
unzip -l "${OUTFILE}" | tail -n +4 | head -30

rm -f "${OUTFILE}"
echo ""
echo "✅  Smoke test passed."
