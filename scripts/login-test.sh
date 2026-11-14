#!/usr/bin/env bash
# Login helper: uses NextAuth credentials flow, stores cookies, then fetches admin pages
BASE="http://localhost:3000"
EMAIL="${2:-admin@divinesacco.co.ke}"
PASS="${3:-Divine@2026}"
JAR="/tmp/cookies-${1:-admin}.txt"
rm -f "$JAR"
CSRF=$(curl -s -c "$JAR" "$BASE/api/auth/csrf" | python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "csrfToken=$CSRF&identifier=$EMAIL&password=$PASS&callbackUrl=$BASE/api/auth/session" \
  -o /dev/null
echo "--- session for $EMAIL:"
curl -s -b "$JAR" -c "$JAR" "$BASE/api/auth/session" | head -c 400
echo
