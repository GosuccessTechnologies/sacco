#!/bin/bash
# DSMS deep E2E: full member lifecycle through the real engines, then GL integrity.
set -e
BASE="http://localhost:3000"
JAR="/tmp/e2e-cookies.txt"

api() { # api METHOD ENDPOINT [JSON]
  local method="$1" ep="$2" data="$3"
  if [ -n "$data" ]; then
    curl -s -b "$JAR" -X "$method" -H 'Content-Type: application/json' -d "$data" "$BASE/api/$ep"
  else
    curl -s -b "$JAR" -X "$method" "$BASE/api/$ep"
  fi
}
login() {
  rm -f "$JAR"
  CSRF=$(curl -s -c "$JAR" "$BASE/api/auth/csrf" | python3 -c 'import sys,json;print(json.load(sys.stdin)["csrfToken"])')
  curl -s -b "$JAR" -c "$JAR" -o /dev/null -X POST "$BASE/api/auth/callback/credentials" -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode "identifier=$1" --data-urlencode "password=$2" --data-urlencode "csrfToken=$CSRF" --data-urlencode "callbackUrl=$BASE"
}

echo "### 1. Public application (rate-limited path, honeypot ok)"
TS=$(date +%s)
APP=$(curl -s -X POST "$BASE/api/public/apply" -H 'Content-Type: application/json' -d '{
  "firstName":"E2E","middleName":null,"lastName":"Tester","gender":"FEMALE",
  "dateOfBirth":"1995-04-12","nationalId":"99'"$TS"'","phone":"+254711555000","email":"e2e'"$TS"'@divinesacco.co.ke",
  "physicalAddress":"Test Street 12","town":"Nairobi","county":"Nairobi","occupation":"Engineer","employerName":"Acme",
  "monthlyIncome":"80,000","nextOfKins":[{"name":"E2E Kin","relationship":"Sibling","phone":"+254711555001"}],
  "productsInterested":[{"type":"savings","code":"XMAS"}],"agreedTerms":true,"elapsedMs":9000}')
REF=$(echo "$APP" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("applicationNumber",""))')
echo "application: $REF"

echo "### 2. Subscribe (public)"
curl -s -X POST "$BASE/api/public/subscribe" -H 'Content-Type: application/json' -d '{"name":"E2E Visitor","email":"e2e-visitor@example.com"}'; echo

echo "### 3. Super admin approves → atomic provisioning"
login "admin@divinesacco.co.ke" "Divine@2026"
APPID=$(api GET "applications" | python3 -c 'import sys,json;rows=json.load(sys.stdin);r=[x for x in rows if x["applicationNumber"]=="'"$REF"'"][0];print(r["id"])')
api POST "applications/$APPID/review" '{"decision":"approve"}' | python3 -c 'import sys,json;d=json.load(sys.stdin);print("member:",d.get("memberNumber"),"| account:",d.get("accountNumber"),"| portal:",bool(d.get("tempPassword")))'

echo "### 4. New member logs in (mustChangePassword flow demo)"
NEWEMAIL="e2e$TS@divinesacco.co.ke"
NUID=$(api GET users | python3 -c 'import sys,json;rows=json.load(sys.stdin);r=[x for x in rows if x["email"]=="'"$NEWEMAIL"'"];print(r[0]["id"] if r else "")')
if [ -n "$NUID" ]; then
  api POST "users/$NUID/reset-password" '{"newPassword":"E2EMember@2026"}' >/dev/null
  login "$NEWEMAIL" "E2EMember@2026"
  curl -s -b "$JAR" "$BASE/api/auth/session" | python3 -c 'import sys,json;u=(json.load(sys.stdin).get("user") or {});print("member login:",u.get("email"),u.get("role"),"memberId:",bool(u.get("memberId")))'
  echo "-- member overview:"
  api GET "member/savings?want=overview" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("accounts:",d["accounts"],"| savings:",d["totalSavingsCents"]/100,"KES | shares:",d["shares"])'
fi

echo "### 5. Savings engine: deposit + withdrawal + reversal via counter (admin)"
login "admin@divinesacco.co.ke" "Divine@2026"
ACCT=$(api GET "savings/accounts" | python3 -c 'import sys,json;rows=json.load(sys.stdin);r=[x for x in rows if x["member"].startswith("E2E Tester")];print(r[0]["id"] if r else "")')
if [ -z "$ACCT" ]; then ACCT=$(api GET "savings/accounts" | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["id"])'); fi
api POST "savings/transactions" "{\"accountId\":\"$ACCT\",\"type\":\"DEPOSIT\",\"channel\":\"COUNTER\",\"amountCents\":500000,\"narration\":\"E2E deposit\"}" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("deposit ref:",d.get("reference"),"balance:",d.get("balanceAfterCents",0)/100)'
api POST "savings/transactions" "{\"accountId\":\"$ACCT\",\"type\":\"WITHDRAWAL\",\"channel\":\"COUNTER\",\"amountCents\":150000,\"narration\":\"E2E withdrawal\"}" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("withdrawal ref:",d.get("reference"),"balance:",d.get("balanceAfterCents",0)/100)'
echo "-- policy violation test (below min balance):"
api POST "savings/transactions" "{\"accountId\":\"$ACCT\",\"type\":\"WITHDRAWAL\",\"channel\":\"COUNTER\",\"amountCents\":99999999}" | python3 -c 'import sys,json;print("rejected:",json.load(sys.stdin).get("error","NOT REJECTED - BUG")[:80])'

echo "### 6. Standing order + share purchase for the new member"
MEMID=$(api GET members | python3 -c 'import sys,json;rows=json.load(sys.stdin);r=[x for x in rows if x["name"].startswith("E2E Tester")];print(r[0]["id"] if r else "")')
api POST "shares" "{\"memberProfileId\":\"$MEMID\",\"quantity\":50,\"channel\":\"COUNTER\"}" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("shares bought: 50 for",d.get("amount",0)/100,"KES | cert:",d.get("certificateRef"))'

echo "### 7. Loan lifecycle for existing member1 (Grace): apply → guarantor → vet → approve → disburse → repay"
# use the NEW E2E member (no open loans); top up savings to lift the multiplier cap
EMID=$(api GET members | python3 -c 'import sys,json;rows=json.load(sys.stdin);r=[x for x in rows if x["name"].startswith("E2E Tester")];print(r[-1]["id"])')
EACCT=$(api GET "savings/accounts" | python3 -c 'import sys,json;rows=json.load(sys.stdin);r=[x for x in rows if x["member"].startswith("E2E Tester")];print(r[-1]["id"])')
api POST "savings/transactions" "{\"accountId\":\"$EACCT\",\"type\":\"DEPOSIT\",\"channel\":\"COUNTER\",\"amountCents\":6000000,\"narration\":\"E2E savings top-up\"}" >/dev/null
api POST "members/$EMID/status" '{"action":"kyc_verify"}' >/dev/null
MID1="$EMID"
MID2=$(api GET members | python3 -c 'import sys,json;rows=json.load(sys.stdin);r=[x for x in rows if "Barasa" in x["name"]];print(r[0]["id"])')
PROD=$(api GET "loans/products" | python3 -c 'import sys,json;rows=json.load(sys.stdin);r=[x for x in rows if x["code"]=="EMER"];print(r[0]["id"])')
LA=$(api POST "loans/applications" "{\"memberProfileId\":\"$MID1\",\"productId\":\"$PROD\",\"requestedAmountCents\":10000000,\"termMonths\":6,\"purpose\":\"E2E test\",\"onBehalf\":true}")
echo "$LA" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("application:",d.get("applicationNumber"),d.get("status"),"| error:",(d.get("error") or "")[:90])'
APPNO=$(echo "$LA" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("applicationNumber",""))')
if [ -n "$APPNO" ]; then
  AID=$(api GET "loans/applications" | python3 -c 'import sys,json;rows=json.load(sys.stdin);r=[x for x in rows if x["applicationNumber"]=="'"$APPNO"'"];print(r[0]["id"])')
  api POST "loans/applications/$AID/actions" "{\"action\":\"invite_guarantor\",\"guarantorMemberId\":\"$MID2\",\"guaranteedAmountCents\":2500000}" >/dev/null && echo "guarantor invited"
  # member2 (Joseph) accepts via portal
  login "member2@divinesacco.co.ke" "Divine@2026"
  GID=$(api GET "member/guarantors" | python3 -c 'import sys,json;rows=json.load(sys.stdin);r=[x for x in rows if x["status"]=="PENDING"];print(r[-1]["id"] if r else "")')
  api POST "member/guarantors" "{\"guarantorId\":\"$GID\",\"decision\":\"accept\"}" | python3 -c 'import sys,json;print("guarantor:",json.load(sys.stdin).get("status"))'
  login "admin@divinesacco.co.ke" "Divine@2026"
  api POST "loans/applications/$AID/actions" '{"action":"vet"}' | python3 -c 'import sys,json;d=json.load(sys.stdin);print("vet score:",d.get("score"),"rec:",d.get("recommendation"))'
  api POST "loans/applications/$AID/actions" '{"action":"approve"}' | python3 -c 'import sys,json;print("approved:",json.load(sys.stdin).get("status"))'
  DISB=$(api POST "loans/applications/$AID/actions" '{"action":"disburse","channel":"BANK","channelRef":"E2E-BK-001"}')
  echo "$DISB" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("disbursed loan:",d.get("loanNumber"),"net:",(d.get("net",0))/100,"KES | fees:",(d.get("fees",0))/100)'
  LID=$(echo "$DISB" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("loanId",""))')
  api POST "loans/$LID/repayments" "{\"loanId\":\"$LID\",\"amountCents\":1800000,\"channel\":\"MPESA\",\"externalRef\":\"E2E-MP-1\"}" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("repayment ref:",d.get("reference"),"| closed:",d.get("closed"),"| outstanding:",(d.get("newOutstanding",0))/100)'
fi

echo "### 8. Dividend run compute → approve → pay"
RUN=$(api POST "dividends/runs" '{"year":2035,"method":"HYBRID","totalPoolCents":50000000,"depositInterestBps":150}' | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))')
if [ -n "$RUN" ] && [ "$RUN" != "None" ]; then
  api POST "dividends/runs/$RUN/compute" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("entries:",d.get("entries"),"| pool:",(d.get("totalPoolCents",0))/100)'
  api POST "dividends/runs/$RUN/pay" '{"action":"approve"}' | python3 -c 'import sys,json;print("run:",json.load(sys.stdin).get("status"))'
  api POST "dividends/runs/$RUN/pay" '{"action":"pay"}' | python3 -c 'import sys,json;d=json.load(sys.stdin);print("paid members:",d.get("paid"))'
fi

echo "### 9. Broadcast to subscribers (demo mode → logged)"
GRPID=$(api POST "comms/groups" '{"name":"E2E subscribers","source":"SUBSCRIBERS"}' | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))')
api POST "comms/send" "{\"channel\":\"EMAIL\",\"subject\":\"E2E broadcast test\",\"bodyHtml\":\"<p>Hello {{name}}, this is an E2E test broadcast.</p>\",\"groupId\":\"$GRPID\"}" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("broadcast sent:",d.get("sent"),"failed:",d.get("failed"))'

echo "### 10. Theme + letterhead + cache + cron"
THEME=$(api GET themes | python3 -c 'import sys,json;rows=json.load(sys.stdin);r=[x for x in rows if x["name"]=="Ocean Teal"];print(r[0]["id"])')
api POST "themes/$THEME/apply" | python3 -c 'import sys,json;print("theme:",json.load(sys.stdin).get("applied"))'
curl -s -b "$JAR" "$BASE/" -o /dev/null -w "public site after theme: %{http_code}\n"
api POST "cache/clear" '{"action":"clear"}' | python3 -c 'import sys,json;print("cache cleared:",json.load(sys.stdin).get("cleared"))'
for job in loan-daily payment-sweeper dormancy kpi-snapshot; do
  curl -s -b "$JAR" -H "Authorization: Bearer dev-cron-secret-change-me" "$BASE/api/cron/$job" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("cron '"$job"':",d.get("ok"))' 2>/dev/null || echo "cron $job: parse err"
done

echo "### 11. GL integrity after all flows"
curl -s -b "$JAR" "$BASE/api/accounting/banks" | python3 -c '
import sys,json
d=json.load(sys.stdin)
dr = sum(a["balanceCents"] for a in d["trialBalance"] if a["type"]=="ASSET")
print("trial balance entries:",len(d["trialBalance"]),"| check (must be 0):",d["check"])'

echo "### 12. Audit trail captured everything"
api GET audit | python3 -c 'import sys,json;rows=json.load(sys.stdin);print("audit records:",len(rows));critical=[r for r in rows if r["severity"]=="critical"];print("critical events:",len(critical))'

echo "=== E2E COMPLETE ==="
