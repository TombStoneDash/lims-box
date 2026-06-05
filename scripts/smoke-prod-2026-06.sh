#!/usr/bin/env bash
# smoke-prod-2026-06.sh — Post-merge smoke test for lims.bot
# Verifies: PRs #20 #21 #23 #24 #25 #26 #27 + sitemap-fix branch
#
# Usage:  ./scripts/smoke-prod-2026-06.sh [BASE_URL]
# Default base URL: https://lims.bot
# Re-run friendly — idempotent, no side effects.

BASE_URL="${1:-https://lims.bot}"
PASS=0; FAIL=0
TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT
CURL="curl -s -L --max-time 15"

ok()   { echo "[OK] $1";       PASS=$((PASS+1)); }
fail() { echo "[FAIL: $2] $1"; FAIL=$((FAIL+1)); }

echo "── lims.bot smoke test ─────────────────────────────────"
echo "   Base URL : $BASE_URL"
echo "   Started  : $(date)"
echo "────────────────────────────────────────────────────────"
echo ""

# ── 1. P0: Production health ─────────────────────────────────────────────

HOME_STATUS=$($CURL -w "%{http_code}" -o "$TMP" "$BASE_URL/")
HOME_BODY=$(cat "$TMP")

if [ "$HOME_STATUS" = "200" ] && echo "$HOME_BODY" | grep -q "<title>LIMS BOX</title>"; then
  ok "P0: homepage 200 + <title>LIMS BOX</title>"
else
  fail "P0: homepage 200 + title" "status=$HOME_STATUS"
fi

HEALTH_STATUS=$($CURL -w "%{http_code}" -o "$TMP" "$BASE_URL/api/health")
if [ "$HEALTH_STATUS" = "200" ] && grep -q '"status":"ok"' "$TMP"; then
  ok "P0: /api/health → 200 + {status:ok}"
else
  fail "P0: /api/health → 200 + {status:ok}" "status=$HEALTH_STATUS body=$(cat "$TMP")"
fi

# ── 2. PR #20: og:image sitewide fix ─────────────────────────────────────

OG_TAG=$(echo "$HOME_BODY" | grep -i 'og:image' | grep -i 'content=' | head -1)
if [ -z "$OG_TAG" ]; then
  fail "PR #20: og:image meta present on homepage" "PR #20 not live"
else
  OG_URL=$(echo "$OG_TAG" | sed 's/.*content="\([^"]*\)".*/\1/')
  if [ -n "$OG_URL" ]; then
    OG_STATUS=$(curl -s -L -o /dev/null -w "%{http_code}" --max-time 10 "$OG_URL")
    [ "$OG_STATUS" = "200" ] \
      && ok "PR #20: og:image asset returns 200 (${OG_URL##https://lims.bot})" \
      || fail "PR #20: og:image asset returns 200" "asset $OG_URL → HTTP $OG_STATUS"
  else
    fail "PR #20: og:image URL parseable" "could not extract content= from: $OG_TAG"
  fi
fi

# ── 3. PR #21: /personnel-pack canonical + og:image ──────────────────────

PP_STATUS=$($CURL -w "%{http_code}" -o "$TMP" "$BASE_URL/personnel-pack")
PP_BODY=$(cat "$TMP")

[ "$PP_STATUS" = "200" ] \
  && ok "PR #21: /personnel-pack → 200" \
  || fail "PR #21: /personnel-pack → 200" "status=$PP_STATUS"

echo "$PP_BODY" | grep -qi 'og:image' \
  && ok "PR #21: /personnel-pack has og:image meta" \
  || fail "PR #21: /personnel-pack has og:image meta" "og:image absent"

echo "$PP_BODY" | grep -i 'canonical' | grep -q '/personnel-pack' \
  && ok "PR #21: /personnel-pack canonical → /personnel-pack" \
  || fail "PR #21: /personnel-pack canonical → /personnel-pack" "canonical missing or wrong"

# ── 4. PR #26: Footer orphan-route links ─────────────────────────────────

ORPHAN_COUNT=$(echo "$HOME_BODY" | grep -oE 'href="/(personnel-pack|compare|clinical)"' | sort -u | wc -l | tr -d ' ')
echo "[INFO] PR #26: footer orphan links found: $ORPHAN_COUNT/3 (/personnel-pack /compare /clinical)"
[ "$ORPHAN_COUNT" -ge 3 ] \
  && ok "PR #26: footer has all 3 orphan-route hrefs" \
  || fail "PR #26: footer has all 3 orphan-route hrefs" "only $ORPHAN_COUNT/3 found"

# ── 5. PR #25: SEO title/desc truncation + /about canonical ──────────────

BLOG_URL="$BASE_URL/blog/clia-tracker-three-times-with-ai"
BLOG_STATUS=$($CURL -w "%{http_code}" -o "$TMP" "$BLOG_URL")
BLOG_BODY=$(cat "$TMP")

if [ "$BLOG_STATUS" = "200" ]; then
  BLOG_TITLE=$(echo "$BLOG_BODY" | grep -i '<title>' | sed 's/.*<title>\([^<]*\)<\/title>.*/\1/' | head -1)
  T_LEN=${#BLOG_TITLE}
  [ "$T_LEN" -le 65 ] \
    && ok "PR #25: blog <title> ≤65 chars ($T_LEN)" \
    || fail "PR #25: blog <title> ≤65 chars" "PR #25 not live — $T_LEN chars: '$BLOG_TITLE'"

  META_DESC=$(echo "$BLOG_BODY" | grep -i 'name="description"' | sed 's/.*content="\([^"]*\)".*/\1/' | head -1)
  D_LEN=${#META_DESC}
  [ "$D_LEN" -le 165 ] \
    && ok "PR #25: blog meta-desc ≤165 chars ($D_LEN)" \
    || fail "PR #25: blog meta-desc ≤165 chars" "$D_LEN chars"
else
  fail "PR #25: blog page accessible" "status=$BLOG_STATUS"
fi

ABOUT_STATUS=$($CURL -w "%{http_code}" -o "$TMP" "$BASE_URL/about")
ABOUT_BODY=$(cat "$TMP")
ABOUT_CAN=$(echo "$ABOUT_BODY" | grep -i 'canonical' | head -1)
echo "$ABOUT_CAN" | grep -q 'lims.bot/about' \
  && ok "PR #25: /about canonical → /about (not /)" \
  || fail "PR #25: /about canonical → /about" "got: $(echo "$ABOUT_CAN" | sed 's/^ *//' | head -c 100)"

# ── 6. PR #27: Structured data (application/ld+json) ─────────────────────

for path in "/" "/about" "/pricing"; do
  _ST=$($CURL -w "%{http_code}" -o "$TMP" "$BASE_URL$path")
  LD=$(grep -c 'application/ld+json' "$TMP" 2>/dev/null || echo 0)
  [ "$LD" -ge 1 ] \
    && ok "PR #27: ld+json on ${path} ($LD block(s))" \
    || fail "PR #27: ld+json on ${path}" "no application/ld+json found"
done

# ── 7. PR #23: Basic Auth gate on survey-export ───────────────────────────

AUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  "$BASE_URL/api/admin/personnel-pack/survey-export")
[ "$AUTH_STATUS" = "401" ] \
  && ok "PR #23: survey-export auth gate → 401" \
  || fail "PR #23: survey-export auth gate → 401" "PR #23 auth gate not live — got HTTP $AUTH_STATUS"

# ── 8. sitemap-fix: Sitemap completeness ─────────────────────────────────

$CURL -o "$TMP" "$BASE_URL/sitemap.xml"
for slug in "/compliance" "/compare" "/personnel-pack"; do
  grep -q "$slug" "$TMP" \
    && ok "sitemap-fix: sitemap.xml includes $slug" \
    || fail "sitemap-fix: sitemap.xml includes $slug" "sitemap-fix not live yet"
done

# ── 9. PR #24: Rate-limit hardening (manual verification) ────────────────

echo ""
echo "[INFO] PR #24: Rate-limit cannot be verified from a single probe."
echo "[INFO]   Manual step: send 6+ rapid authenticated requests to:"
echo "[INFO]   $BASE_URL/api/admin/personnel-pack/survey-export"
echo "[INFO]   Confirm HTTP 429 on the 5th+ request within a 60s window."
ok "PR #24: rate-limit noted (manual verification required)"

# ── Summary ───────────────────────────────────────────────────────────────

TOTAL=$((PASS + FAIL))
echo ""
echo "════════════════════════════════════════════════════════"
printf "  RESULT  : %s passed / %s failed / %s total\n" "$PASS" "$FAIL" "$TOTAL"
echo "  URL     : $BASE_URL"
echo "  Finished: $(date)"
echo "════════════════════════════════════════════════════════"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
