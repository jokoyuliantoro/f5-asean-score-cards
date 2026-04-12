#!/bin/bash
# =============================================================================
# deploy_handlers.sh — Hot-deploy dns_discovery and/or https_discovery Lambdas
#
# Zips and pushes handler code directly via AWS CLI, bypassing Terraform.
# Use this during handler development. Run the full deploy.sh only when
# Terraform infra changes are also needed.
#
# The dnspython layer is already attached via Terraform — this script does NOT
# touch layers. Only handler code is updated.
#
# Usage (run from repo root):
#   ./scripts/deploy_handlers.sh           # deploy BOTH handlers
#   ./scripts/deploy_handlers.sh dns       # deploy dns_discovery only
#   ./scripts/deploy_handlers.sh https     # deploy https_discovery only
#
# Smoke test only (no deploy):
#   ./scripts/deploy_handlers.sh dns  --smoke-only
#   ./scripts/deploy_handlers.sh both --smoke-only SMOKE_DOMAIN=dbs.com
#
# Deploy + smoke test:
#   SMOKE_TEST=true SMOKE_DOMAIN=f5.com ./scripts/deploy_handlers.sh dns
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAMBDA_DIR="$REPO_ROOT/backend/lambda"
BUILD_DIR="$REPO_ROOT/backend/terraform/.build"

# ── Config (matches Terraform: ${var.app_name}-*-${var.environment}) ─────────
AWS_REGION="ap-southeast-1"
APP_NAME="f5-asean-score-cards"
ENVIRONMENT="prod"
DNS_FUNCTION="${APP_NAME}-dns-discovery-${ENVIRONMENT}"
HTTPS_FUNCTION="${APP_NAME}-https-discovery-${ENVIRONMENT}"

# Smoke test options
SMOKE_TEST="${SMOKE_TEST:-false}"
SMOKE_DOMAIN="${SMOKE_DOMAIN:-google.com}"

# ── Colour helpers (matches deploy.sh) ───────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[deploy]${NC} $*"; }
warning() { echo -e "${YELLOW}[warn]${NC}   $*"; }
error()   { echo -e "${RED}[error]${NC}  $*"; exit 1; }

# ── Arg parsing ───────────────────────────────────────────────────────────────
TARGET="${1:-both}"
SMOKE_ONLY=false
# Support: ./deploy_handlers.sh dns --smoke-only [SMOKE_DOMAIN=x.com]
for arg in "${@:2}"; do
  case "$arg" in
    --smoke-only) SMOKE_ONLY=true; SMOKE_TEST=true ;;
    SMOKE_DOMAIN=*) SMOKE_DOMAIN="${arg#SMOKE_DOMAIN=}" ;;
    *) error "Unknown argument '$arg'. Supported: --smoke-only  SMOKE_DOMAIN=<domain>" ;;
  esac
done
case "$TARGET" in
  dns|https|both) ;;
  *) error "Unknown target '$TARGET'. Use: dns | https | both" ;;
esac

# ── Prerequisites ─────────────────────────────────────────────────────────────
command -v aws  >/dev/null 2>&1 || error "aws CLI not found."
command -v zip  >/dev/null 2>&1 || error "zip not found. Run: sudo apt install zip"

mkdir -p "$BUILD_DIR"

# =============================================================================
# deploy_function <function_name> <source_dir> <zip_path>
#   Zips handler.py from source_dir, pushes to Lambda, waits for completion.
# =============================================================================
deploy_function() {
  local FNAME="$1"
  local SRC_DIR="$2"
  local ZIP_PATH="$3"
  local HANDLER_FILE="$SRC_DIR/handler.py"

  [[ -f "$HANDLER_FILE" ]] || error "handler.py not found at $HANDLER_FILE"

  info "Zipping $(basename "$SRC_DIR")/handler.py..."
  rm -f "$ZIP_PATH"
  (cd "$SRC_DIR" && zip -q "$ZIP_PATH" handler.py)

  local SIZE
  SIZE=$(du -sh "$ZIP_PATH" | cut -f1)
  info "Package size: $SIZE  →  $ZIP_PATH"

  info "Pushing to Lambda: $FNAME"
  aws lambda update-function-code \
    --region        "$AWS_REGION" \
    --function-name "$FNAME" \
    --zip-file      "fileb://$ZIP_PATH" \
    --query         '{FunctionName:FunctionName,CodeSize:CodeSize,LastModified:LastModified}' \
    --output        table

  info "Waiting for update to complete..."
  aws lambda wait function-updated \
    --region        "$AWS_REGION" \
    --function-name "$FNAME"
}

# =============================================================================
# smoke_test <function_name> <pillar>
#   Invokes the Lambda directly (bypasses API Gateway) with a minimal payload
#   and prints score + issues so you can confirm the handler is live.
# =============================================================================
smoke_test() {
  local FNAME="$1"
  local PILLAR="$2"
  local RESULT="$BUILD_DIR/smoke_${PILLAR}.json"

  info "Smoke-testing $FNAME with domain=$SMOKE_DOMAIN ..."

  # Build payload via python3 so inner JSON is correctly escaped
  local PAYLOAD
  PAYLOAD=$(python3 -c "
import json
inner = json.dumps({'domain': '$SMOKE_DOMAIN', 'accountId': 'smoke-test'})
outer = json.dumps({'body': inner})
print(outer)
")

  aws lambda invoke \
    --region                 "$AWS_REGION" \
    --function-name          "$FNAME" \
    --payload                "$PAYLOAD" \
    --cli-binary-format      raw-in-base64-out \
    --output                 text \
    --query                  'StatusCode' \
    "$RESULT" > /dev/null

  python3 - "$RESULT" "$PILLAR" <<'PYEOF'
import json, sys

result_file = sys.argv[1]
pillar      = sys.argv[2]

with open(result_file) as f:
    raw = f.read()

# Always print raw first 600 chars for debugging
try:
    outer = json.loads(raw)
except Exception:
    print(f"  ERROR: result file is not JSON:\n{raw[:600]}")
    sys.exit(1)

# Lambda service errors (timeout, OOM) come back as top-level errorMessage
if "errorMessage" in outer:
    print(f"  Lambda ERROR: {outer.get('errorMessage', '?')}")
    print(f"  Type: {outer.get('errorType', '?')}")
    trace = outer.get('stackTrace', [])
    for line in trace[-5:]:
        print(f"    {line}")
    sys.exit(1)

# Show raw response if error or unexpected shape
status_code = outer.get("statusCode", "?")
raw_body = outer.get("body", "{}")
try:
    body = json.loads(raw_body)
except Exception:
    print(f"  ERROR: could not parse body: {raw_body[:300]}")
    sys.exit(1)

if status_code != 200 or "error" in body:
    print(f"  Lambda returned HTTP {status_code}")
    print(f"  Body: {json.dumps(body, indent=2)[:500]}")
    sys.exit(1)
findings = body.get("findings", {})
issues   = findings.get("issues", [])
score    = findings.get("score", "n/a")

print(f"\n  domain  : {body.get('domain', 'n/a')}")
print(f"  pillar  : {body.get('pillar', pillar)}")
print(f"  status  : {body.get('status', 'n/a')}")
print(f"  score   : {score}/100")
print(f"  issues  : {len(issues)}")

for sev in ["critical", "high", "medium", "low"]:
    for i in [x for x in issues if x.get("severity") == sev]:
        print(f"    [{sev.upper():8s}] {i.get('title', '')}")

if pillar == "dns":
    print(f"\n  Domain:")
    print(f"    appDomain     : {findings.get('appDomain', body.get('domain','n/a'))}")
    print(f"    apexDomain    : {findings.get('apexDomain', 'n/a')}")
    print(f"\n  NS / Vendor:")
    print(f"    nsMultiVendor : {findings.get('nsMultiVendor', 'n/a')}")
    print(f"    nsAnycast     : {findings.get('nsAnycast', 'n/a')}")
    print(f"    nsVendors     : {[v.get('name') for v in findings.get('nsVendors', [])]}")
    print(f"    nsCount       : {findings.get('nsCount', 'n/a')}")
    print(f"\n  Geo-steering:")
    gs = findings.get('geoSteering') or {}
    print(f"    status        : {gs.get('status', 'n/a')}")
    print(f"    label         : {gs.get('label', 'n/a')}")
    print(f"\n  IP Info (latency + anycast):")
    for ip_r in findings.get('ipInfo', []):
        ms_sea  = f"{ip_r.get('ms')}ms"   if ip_r.get('ms')      is not None else 'unreachable'
        ms_use1 = f"{ip_r.get('ms_use1')}ms" if ip_r.get('ms_use1') is not None else '?'
        holder  = ip_r.get('holder') or 'Unknown'
        asn     = ip_r.get('asn') or '?'
        anycast = ip_r.get('anycast', '?')
        print(f"    {ip_r.get('ip',''):18s}  SEA:{ms_sea:8s}  USE1:{ms_use1:8s}  anycast:{anycast:20s}  {asn}  {holder}")
    lc = findings.get('latencyConsistency') or {}
    print(f"    consistency   : {lc.get('label', 'n/a')}")
    print(f"\n  NS Vendors (enriched):")
    for v in findings.get('nsVendors', []):
        print(f"    {v.get('name',''):30s}  ipHolder={v.get('ipHolder','?'):25s}  {v.get('ipAsn','?')}")
    print(f"    anycastMethod : {findings.get('anycastMethod', 'n/a')}")
    print(f"\n  NS IP Anycast (dual-region probe):")
    ns_ip_anycast = findings.get('nsIpAnycast', {})
    if ns_ip_anycast:
        for ip, data in ns_ip_anycast.items():
            print(f"    {ip:18s}  SEA:{str(data.get('ms_sea','?'))+'ms':8s}  USE1:{str(data.get('ms_use1','?'))+'ms':8s}  → {data.get('anycast','?')}")
    else:
        print(f"    (no data)")
    print(f"\n  DNS checks:")
    print(f"    dnssecStatus  : {findings.get('dnssecStatus', 'n/a')}")
    print(f"    ttl           : {findings.get('ttl', 'n/a')}s ({findings.get('ttlScore', 'n/a')})")
    print(f"    caaPresent    : {findings.get('caaPresent', 'n/a')}")
    print(f"    healthSignal  : {findings.get('healthFailoverSignal', 'n/a')}")
elif pillar == "https":
    print(f"\n  HTTPS details:")
    print(f"    tlsVersion    : {findings.get('tlsVersion', 'n/a')}")
    print(f"    tlsScore      : {findings.get('tlsScore', 'n/a')}")
    print(f"    httpVersion   : {findings.get('httpVersion', 'n/a')}")
    print(f"    hstsPresent   : {findings.get('hstsPresent', 'n/a')}")
    print(f"    certDaysLeft  : {findings.get('certDaysLeft', 'n/a')}")
    print(f"    certIssuer    : {findings.get('certIssuer', {}).get('commonName', 'n/a')}")
print()
PYEOF
}

# =============================================================================
# Main
# =============================================================================
echo ""
if [[ "$SMOKE_ONLY" == "true" ]]; then
  info "Mode: smoke-test only  |  Target: $TARGET  |  Domain: $SMOKE_DOMAIN"
else
  info "Mode: deploy  |  Target: $TARGET  |  Region: $AWS_REGION  |  Env: $ENVIRONMENT"
fi
echo ""

if [[ "$TARGET" == "dns" || "$TARGET" == "both" ]]; then
  info "── DNS Discovery ────────────────────────────────────────────────────"
  if [[ "$SMOKE_ONLY" != "true" ]]; then
    # Bundle handler.py + analysis_dns.py (AI analysis sibling module) into one zip.
    # analysis_dns/handler.py is copied as analysis_dns.py so Python can import it directly.
    local_zip="$BUILD_DIR/dns_discovery.zip"
    analysis_src="$LAMBDA_DIR/analysis_dns/handler.py"
    analysis_tmp="$LAMBDA_DIR/dns_discovery/analysis_dns.py"
    [[ -f "$analysis_src" ]] || error "analysis_dns/handler.py not found at $analysis_src"
    info "Zipping dns_discovery/handler.py + analysis_dns.py..."
    cp "$analysis_src" "$analysis_tmp"
    rm -f "$local_zip"
    (cd "$LAMBDA_DIR/dns_discovery" && zip -q "$local_zip" handler.py analysis_dns.py)
    rm -f "$analysis_tmp"   # clean up temp copy — never commit this file
    SIZE=$(du -sh "$local_zip" | cut -f1)
    info "Package size: $SIZE  →  $local_zip"
    info "Pushing to Lambda: $DNS_FUNCTION"
    aws lambda update-function-code \
      --region        "$AWS_REGION" \
      --function-name "$DNS_FUNCTION" \
      --zip-file      "fileb://$local_zip" \
      --query         '{FunctionName:FunctionName,CodeSize:CodeSize,LastModified:LastModified}' \
      --output        table
    info "Waiting for update to complete..."
    aws lambda wait function-updated \
      --region        "$AWS_REGION" \
      --function-name "$DNS_FUNCTION"
    info "✅ dns_discovery deployed → $DNS_FUNCTION (includes analysis_dns.py)"
  fi
  [[ "$SMOKE_TEST" == "true" ]] && smoke_test "$DNS_FUNCTION" "dns"
  echo ""
fi

if [[ "$TARGET" == "https" || "$TARGET" == "both" ]]; then
  info "── HTTPS Discovery ──────────────────────────────────────────────────"
  if [[ "$SMOKE_ONLY" != "true" ]]; then
    deploy_function \
      "$HTTPS_FUNCTION" \
      "$LAMBDA_DIR/https_discovery" \
      "$BUILD_DIR/https_discovery.zip"
    info "✅ https_discovery deployed → $HTTPS_FUNCTION"
  fi
  [[ "$SMOKE_TEST" == "true" ]] && smoke_test "$HTTPS_FUNCTION" "https"
  echo ""
fi

if [[ "$SMOKE_ONLY" != "true" ]]; then
  echo -e "${GREEN}✅ Handler deploy complete.${NC}"
  if [[ "$SMOKE_TEST" != "true" ]]; then
    echo ""
    warning "Tip: verify the handler is live with a smoke test:"
    warning "  ./scripts/deploy_handlers.sh $TARGET --smoke-only SMOKE_DOMAIN=f5.com"
  fi
fi
echo ""
