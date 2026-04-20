#!/bin/bash
# =============================================================================
# deploy_audit.sh — Deploy the audit Lambda and (first time) apply audit.tf
#
# Run from repo root.
#
# First-time setup (creates the Lambda + API routes):
#   ./scripts/deploy_audit.sh --infra
#
# Handler-only hot deploy (no Terraform, fastest):
#   ./scripts/deploy_audit.sh
#
# Smoke test only:
#   ./scripts/deploy_audit.sh --smoke-only
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAMBDA_DIR="$REPO_ROOT/backend/lambda/audit"
TF_DIR="$REPO_ROOT/backend/terraform"
BUILD_DIR="$TF_DIR/.build"

AWS_REGION="ap-southeast-1"
APP_NAME="f5-asean-score-cards"
ENVIRONMENT="prod"
FUNCTION="${APP_NAME}-audit-${ENVIRONMENT}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[audit-deploy]${NC} $*"; }
warning() { echo -e "${YELLOW}[warn]${NC}         $*"; }
error()   { echo -e "${RED}[error]${NC}        $*"; exit 1; }

# ── Arg parsing ───────────────────────────────────────────────────────────────
INFRA=false
SMOKE_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --infra)       INFRA=true ;;
    --smoke-only)  SMOKE_ONLY=true ;;
    *) error "Unknown argument '$arg'. Supported: --infra | --smoke-only" ;;
  esac
done

command -v aws >/dev/null 2>&1 || error "aws CLI not found."
command -v zip >/dev/null 2>&1 || error "zip not found."

mkdir -p "$BUILD_DIR"

echo ""
info "Target function : $FUNCTION"
info "Region          : $AWS_REGION"
echo ""

# ── 1. Terraform (first-time only) ───────────────────────────────────────────
if [[ "$INFRA" == "true" ]]; then
  info "── Applying audit.tf via Terraform ─────────────────────────────────"
  command -v terraform >/dev/null 2>&1 || error "terraform not found."
  cd "$TF_DIR"
  terraform init -upgrade
  terraform apply -target=aws_lambda_function.audit \
                  -target=aws_lambda_permission.apigw_audit \
                  -target=aws_apigatewayv2_integration.audit \
                  -target=aws_apigatewayv2_route.post_audit \
                  -target=aws_apigatewayv2_route.get_audit \
                  -target=aws_cloudwatch_log_group.audit \
                  -auto-approve
  cd "$REPO_ROOT"
  info "✅ Terraform apply complete"
  echo ""
fi

# ── 2. Hot-deploy handler ─────────────────────────────────────────────────────
if [[ "$SMOKE_ONLY" != "true" ]]; then
  ZIP_PATH="$BUILD_DIR/audit.zip"
  [[ -f "$LAMBDA_DIR/handler.py" ]] || error "handler.py not found at $LAMBDA_DIR/handler.py"

  info "Zipping audit/handler.py..."
  rm -f "$ZIP_PATH"
  (cd "$LAMBDA_DIR" && zip -q "$ZIP_PATH" handler.py)
  SIZE=$(du -sh "$ZIP_PATH" | cut -f1)
  info "Package size: $SIZE → $ZIP_PATH"

  info "Pushing to Lambda: $FUNCTION"
  aws lambda update-function-code \
    --region        "$AWS_REGION" \
    --function-name "$FUNCTION" \
    --zip-file      "fileb://$ZIP_PATH" \
    --query         '{FunctionName:FunctionName,CodeSize:CodeSize,LastModified:LastModified}' \
    --output        table

  info "Waiting for update..."
  aws lambda wait function-updated \
    --region        "$AWS_REGION" \
    --function-name "$FUNCTION"

  info "✅ Audit Lambda deployed"
  echo ""
fi

# ── 3. Smoke test ─────────────────────────────────────────────────────────────
if [[ "$SMOKE_ONLY" == "true" ]] || [[ "${SMOKE_TEST:-false}" == "true" ]]; then
  RESULT="$BUILD_DIR/smoke_audit.json"
  info "Smoke-testing POST /audit (direct Lambda invoke)..."

  PAYLOAD=$(python3 -c "
import json
inner = json.dumps({'type':'login','role':'admin','meta':{'note':'smoke-test'}})
outer = json.dumps({'requestContext':{'http':{'method':'POST'},'authorizer':{'jwt':{'claims':{'email':'smoke@test.local'}}}},'body':inner})
print(outer)
")

  aws lambda invoke \
    --region                "$AWS_REGION" \
    --function-name         "$FUNCTION" \
    --payload               "$PAYLOAD" \
    --cli-binary-format     raw-in-base64-out \
    --output                text \
    --query                 'StatusCode' \
    "$RESULT" > /dev/null

  STATUS=$(python3 -c "import json; d=json.load(open('$RESULT')); print(d.get('statusCode','?'))")
  if [[ "$STATUS" == "201" ]]; then
    info "✅ Smoke test passed — HTTP 201 returned"
  else
    warning "Unexpected status: $STATUS"
    cat "$RESULT"
  fi
  echo ""
fi

echo -e "${GREEN}✅ audit deploy complete.${NC}"
echo ""
warning "Tip: first-time infra setup? Run:  ./scripts/deploy_audit.sh --infra"
warning "Hot deploy only:                   ./scripts/deploy_audit.sh"
warning "Smoke test:                        SMOKE_TEST=true ./scripts/deploy_audit.sh"
echo ""
