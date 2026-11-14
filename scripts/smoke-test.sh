#!/bin/bash
# DSMS end-to-end auth + API smoke test
set -e
BASE="http://localhost:3000"
JAR="/tmp/dsms-cookies.txt"
rm -f "$JAR"

login() {
  local identifier="$1" password="$2"
  rm -f "$JAR"
  CSRF=$(curl -s -c "$JAR" "$BASE/api/auth/csrf" | python3 -c 'import sys,json;print(json.load(sys.stdin)["csrfToken"])')
  curl -s -b "$JAR" -c "$JAR" -o /dev/null -w "" -X POST "$BASE/api/auth/callback/credentials" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode "identifier=$identifier" \
    --data-urlencode "password=$password" \
    --data-urlencode "csrfToken=$CSRF" \
    --data-urlencode "callbackUrl=$BASE/admin" >/dev/null
  curl -s -b "$JAR" "$BASE/api/auth/session" | python3 -c "import sys, json; d = json.load(sys.stdin); u = d.get('user') or {}; print('LOGIN', 'FAILED' if not u else u.get('email'), u.get('role'), len(u.get('permissions') or []))"
}

echo "=== 1. Super admin login ==="
login "admin@divinesacco.co.ke" "Divine@2026"

echo "=== 2. Admin pages render (200) ==="
for p in /admin /admin/members /admin/members/applications /admin/savings /admin/loans /admin/shares /admin/fosa /admin/accounting /admin/payments /admin/reports /admin/communications /admin/administration; do
  code=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" --max-time 90 "$BASE$p")
  echo "$code $p"
done

echo "=== 3. Core APIs (super admin) ==="
for ep in "members" "applications" "savings/products" "savings/accounts" "savings/transactions" "loans" "loans/applications" "loans/arrears" "shares" "shares/positions" "dividends/runs" "accounting/coa" "accounting/journal" "accounting/banks" "accounting/reconciliations" "payments" "integrations" "themes" "letterheads" "users" "rbac/assignments" "audit" "hr/staff" "payroll/runs" "settings/entity" "files/list" "cache/clear" "notifications" "analytics" "reports/generate" "comms/templates" "comms/groups" "comms/logs" "public/brand"; do
  code=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" --max-time 60 "$BASE/api/$ep")
  [ "$code" != "200" ] && echo "FAIL $code /api/$ep" || echo "200 /api/$ep"
done

echo "=== 4. Member login + portal ==="
login "member1@divinesacco.co.ke" "Divine@2026"
for p in /dashboard /dashboard/savings /dashboard/loans /dashboard/shares /dashboard/guarantors /dashboard/profile /dashboard/notifications; do
  code=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" --max-time 90 "$BASE$p")
  echo "$code $p"
done
echo "-- member APIs:"
for ep in "member/savings?want=overview" "member/loans" "member/guarantors" "member/shares" "member/profile" "notifications"; do
  code=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" --max-time 60 "$BASE/api/$ep")
  [ "$code" != "200" ] && echo "FAIL $code /api/$ep" || echo "200 /api/$ep"
done

echo "=== 5. Teller login (RBAC scope) ==="
login "teller@divinesacco.co.ke" "Divine@2026"
echo "-- teller tries member-scoped API (expect 200 for fosa, 403/ok for others):"
curl -s -b "$JAR" -o /dev/null -w "fosa/sessions: %{http_code}\n" "$BASE/api/fosa/sessions"
curl -s -b "$JAR" "$BASE/api/auth/session" | python3 -c "import sys,json;d=json.load(sys.stdin);u=d.get('user') or {};p=u.get('permissions') or [];print('teller perms:',len(p),'savings_post:','savings_post' in p,'fosa_session:','fosa_session' in p)"

echo "=== ALL SMOKE TESTS DONE ==="
