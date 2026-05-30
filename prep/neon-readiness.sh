#!/usr/bin/env bash
# PP15 Neon Readiness Preflight
# Run from repo root: bash prep/neon-readiness.sh
# Exits 0 if all green, 1 if any check fails.

set -euo pipefail

PASS=0
FAIL=0

check() {
  local label="$1"
  local result="$2"  # "ok" or "fail: <reason>"
  if [[ "$result" == "ok" ]]; then
    echo "  ✅  $label"
    ((PASS++)) || true
  else
    echo "  ❌  $label — ${result#fail: }"
    ((FAIL++)) || true
  fi
}

echo ""
echo "=== PP15 Neon Readiness Preflight ==="
echo ""

# 1. Check for existing DATABASE_URL in .env files (should be absent)
echo "▸ Checking for existing DATABASE_URL in .env files..."
ENV_FILES=$(find . -maxdepth 2 -name ".env*" ! -name "*.example" ! -name "*.sample" 2>/dev/null | grep -v node_modules | grep -v ".git" || true)
if [[ -z "$ENV_FILES" ]]; then
  check "No .env files present (clean slate)" "ok"
else
  FOUND_DB_URL=""
  while IFS= read -r f; do
    if grep -q '^DATABASE_URL=' "$f" 2>/dev/null; then
      FOUND_DB_URL="$f"
    fi
  done <<< "$ENV_FILES"
  if [[ -z "$FOUND_DB_URL" ]]; then
    check "DATABASE_URL absent from all .env files" "ok"
    echo "     (files checked: $(echo "$ENV_FILES" | tr '\n' ' '))"
  else
    check "DATABASE_URL absent from all .env files" "fail: found in $FOUND_DB_URL — remove before Neon injection"
  fi
fi

# 2. Print vercel env ls production for visibility
echo ""
echo "▸ Vercel env ls (production)..."
if command -v vercel &>/dev/null; then
  vercel env ls production 2>&1 | sed 's/^/     /' || echo "     (vercel env ls failed — ensure vercel link is done)"
else
  echo "     (vercel CLI not found — skipping)"
fi

# 3. Validate schema.prisma provider = "postgresql"
echo ""
echo "▸ Checking schema.prisma provider..."
SCHEMA_FILE="prisma/schema.prisma"
if [[ ! -f "$SCHEMA_FILE" ]]; then
  check "schema.prisma exists" "fail: file not found at $SCHEMA_FILE"
else
  PROVIDER=$(grep 'provider\s*=' "$SCHEMA_FILE" | grep -v '//' | head -1 | sed 's/.*=\s*"\(.*\)".*/\1/' | tr -d ' ')
  if [[ "$PROVIDER" == "postgresql" ]]; then
    check "schema.prisma provider = \"postgresql\"" "ok"
  else
    check "schema.prisma provider = \"postgresql\"" "fail: found \"$PROVIDER\" — branch may not be up to date"
  fi
fi

# 4. Run prisma validate
echo ""
echo "▸ Running prisma validate..."
if npx prisma validate 2>&1 | tee /tmp/prisma-validate-out.txt | grep -q "is valid"; then
  check "prisma validate passes" "ok"
else
  PRISMA_ERR=$(cat /tmp/prisma-validate-out.txt | tail -5)
  check "prisma validate passes" "fail: $PRISMA_ERR"
fi

# Summary
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
echo ""

if [[ $FAIL -gt 0 ]]; then
  echo "❌ NOT ready — fix failures above before running the Neon CLI block."
  exit 1
else
  echo "✅ All green — safe to proceed with: vercel storage create"
  exit 0
fi
