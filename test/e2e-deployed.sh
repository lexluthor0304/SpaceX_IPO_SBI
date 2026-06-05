#!/usr/bin/env bash
# =============================================================================
# SBI IPO Monitor — E2E Test Script (Deployed Environment)
# =============================================================================
# Tests all API endpoints against the deployed Worker.
# MailChannels email sending ONLY works from Cloudflare's network (deployed).
#
# Usage:
#   chmod +x test/e2e-deployed.sh
#   ./test/e2e-deployed.sh                           # Test production
#   SITE_URL=http://localhost:8787 ./test/e2e-deployed.sh  # Test local
# =============================================================================

set -euo pipefail

SITE_URL="${SITE_URL:-https://spacexipo.tokugai.com}"
TEST_EMAIL="${TEST_EMAIL:-lexluthor0304@gmail.com}"
PASS=0
FAIL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------
check() {
  local desc="$1"
  local expected_code="$2"
  local method="$3"
  local path="$4"
  local body="${5:-}"

  printf "${BLUE}TEST${NC} %s ... " "$desc"

  local http_code
  local response

  if [ -n "$body" ]; then
    response=$(curl -s -w "\n%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      -d "$body" \
      "$SITE_URL$path" 2>&1)
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" \
      "$SITE_URL$path" 2>&1)
  fi

  http_code=$(echo "$response" | tail -1)
  local body_response=$(echo "$response" | sed '$d')

  if [ "$http_code" = "$expected_code" ]; then
    printf "${GREEN}PASS${NC} (HTTP %s)\n" "$http_code"
    PASS=$((PASS + 1))
  else
    printf "${RED}FAIL${NC} (expected %s, got %s)\n" "$expected_code" "$http_code"
    echo "  Response: $(echo "$body_response" | head -5)"
    FAIL=$((FAIL + 1))
  fi

  # Return the body for further checks
  echo "$body_response"
}

check_contains() {
  local desc="$1"
  local expected_code="$2"
  local method="$3"
  local path="$4"
  local body="${5:-}"
  local expected_text="$6"

  printf "${BLUE}TEST${NC} %s ... " "$desc"

  local http_code
  local response

  if [ -n "$body" ]; then
    response=$(curl -s -w "\n%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      -d "$body" \
      "$SITE_URL$path" 2>&1)
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" \
      "$SITE_URL$path" 2>&1)
  fi

  http_code=$(echo "$response" | tail -1)
  local body_response=$(echo "$response" | sed '$d')

  if [ "$http_code" = "$expected_code" ] && echo "$body_response" | grep -q "$expected_text"; then
    printf "${GREEN}PASS${NC} (HTTP %s, found '%s')\n" "$http_code" "$expected_text"
    PASS=$((PASS + 1))
  else
    printf "${RED}FAIL${NC} (expected %s with '%s', got %s)\n" "$expected_code" "$expected_text" "$http_code"
    FAIL=$((FAIL + 1))
  fi
}

check_json() {
  local desc="$1"
  local expected_code="$2"
  local method="$3"
  local path="$4"
  local body="${5:-}"
  local expected_json_key="$6"

  printf "${BLUE}TEST${NC} %s ... " "$desc"

  local http_code
  local response

  if [ -n "$body" ]; then
    response=$(curl -s -w "\n%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      -d "$body" \
      "$SITE_URL$path" 2>&1)
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" \
      "$SITE_URL$path" 2>&1)
  fi

  http_code=$(echo "$response" | tail -1)
  local body_response=$(echo "$response" | sed '$d')

  if [ "$http_code" = "$expected_code" ] && echo "$body_response" | grep -q "\"$expected_json_key\""; then
    printf "${GREEN}PASS${NC} (HTTP %s, key '%s' present)\n" "$http_code" "$expected_json_key"
    PASS=$((PASS + 1))
  else
    printf "${RED}FAIL${NC} (expected %s with key '%s', got %s)\n" "$expected_code" "$expected_json_key" "$http_code"
    FAIL=$((FAIL + 1))
  fi

  echo "$body_response"
}

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║     SBI IPO Monitor — E2E Test Suite                           ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║  Target: $SITE_URL"
echo "║  Time:   $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# ─── Landing Page ───────────────────────────────────────────────────────
echo "━━━ Landing Page ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_contains "GET / returns HTML landing page" "200" "GET" "/" "" "<!DOCTYPE html>"
check_contains "Landing page has Japanese content" "200" "GET" "/" "" "監視ステータス"
check_contains "Landing page has title" "200" "GET" "/" "" "SBI IPO Monitor"

# ─── Stats Endpoint ──────────────────────────────────────────────────────
echo ""
echo "━━━ API: /api/stats ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_json "GET /api/stats returns activeSubscribers" "200" "GET" "/api/stats" "" "activeSubscribers"
check_json "GET /api/stats returns monitoring=true" "200" "GET" "/api/stats" "" "monitoring"

# ─── Status Endpoint ─────────────────────────────────────────────────────
echo ""
echo "━━━ API: /api/status ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
STATUS_RESP=$(check_json "GET /api/status returns data" "200" "GET" "/api/status" "" "latestCheck")
echo "Status response: $(echo "$STATUS_RESP" | head -3)"

# ─── Subscribe Flow ──────────────────────────────────────────────────────
echo ""
echo "━━━ API: Subscribe Flow ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TIMESTAMP=$(date +%s)
UNIQUE_EMAIL="e2e-test-${TIMESTAMP}@example.com"

SUB_RESP=$(check_json "POST /api/subscribe with new email" "200" "POST" "/api/subscribe" \
  "{\"email\":\"$UNIQUE_EMAIL\"}" "success")
echo "Subscribe response: $(echo "$SUB_RESP" | head -3)"

check_json "POST /api/subscribe duplicate returns error" "400" "POST" "/api/subscribe" \
  "{\"email\":\"$UNIQUE_EMAIL\"}" "success"

check_json "POST /api/subscribe invalid email" "400" "POST" "/api/subscribe" \
  "{\"email\":\"bad\"}" "success"

check_json "POST /api/subscribe empty body" "400" "POST" "/api/subscribe" \
  "{}" "success"

# ─── Unsubscribe ─────────────────────────────────────────────────────────
echo ""
echo "━━━ API: Unsubscribe ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_contains "GET /api/unsubscribe no params" "400" "GET" "/api/unsubscribe" "" "無効"

# ─── Email Test (⚠️ only works deployed on Cloudflare) ──────────────────
echo ""
echo "━━━ Email Test ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  📧 Sending test email to: $TEST_EMAIL"
echo "  ⚠️  MailChannels requires Cloudflare network (deployed only)"
echo ""

EMAIL_RESP=$(check "POST /api/test-email to $TEST_EMAIL" "200" "POST" "/api/test-email" \
  "{\"email\":\"$TEST_EMAIL\"}")
echo ""
echo "  Full response:"
echo "$EMAIL_RESP" | python3 -m json.tool 2>/dev/null || echo "$EMAIL_RESP"

# ─── Summary ─────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
printf "║  Results: ${GREEN}%d passed${NC}, ${RED}%d failed${NC}\n" "$PASS" "$FAIL"
if [ "$FAIL" -eq 0 ]; then
  echo "║  Status:  ${GREEN}✅ ALL TESTS PASSED${NC}"
else
  echo "║  Status:  ${RED}❌ SOME TESTS FAILED${NC}"
fi
echo "╚══════════════════════════════════════════════════════════════════╝"

exit "$FAIL"
