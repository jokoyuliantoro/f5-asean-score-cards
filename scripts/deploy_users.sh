#!/bin/bash
# =============================================================================
# deploy_users.sh — Deploy the users Lambda and (first time) apply users.tf
#
# Run from repo root.
#
# First-time setup (creates the Lambda + API routes + CORS update):
#   ./scripts/deploy_users.sh --infra
#
# Handler-only hot deploy (no Terraform, fastest):
#   ./scripts/deploy_users.sh
#
# Smoke test only (requires a valid token in .env.local):
#   ./scripts/deploy_users.sh --smoke-only
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAMBDA_DIR="$REPO_ROOT/backend/lambda/users"
TF_DIR="$REPO_ROOT/backend/terraform-cloudflare"
BUILD_DIR="$TF_DIR/.build"

AWS_REGION="ap-southeast-1"
APP_NAME="f5-asean-score-cards"
ENVIRONMENT="prod"
FUNCTION="${APP_NAME}-users-${ENVIRONMENT}"

export AWS_REGION   # makes it visible to terraform and the AWS provider

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[users-deploy]${NC} $*"; }
warning() { echo -e "${YELLOW}[warn]${NC}          $*"; }
error()   { echo -e "${RED}[error]${NC}         $*"; exit 1; }

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
  info "── Applying users.tf via Terraform ──────────────────────────────────"
  command -v terraform >/dev/null 2>&1 || error "terraform not found."
  cd "$TF_DIR"
  terraform init
  terraform apply \
    -target=aws_lambda_function.users \
    -target=aws_lambda_permission.apigw_users \
    -target=aws_apigatewayv2_integration.users \
    -target=aws_apigatewayv2_route.get_users \
    -target=aws_apigatewayv2_route.post_users \
    -target=aws_apigatewayv2_route.put_user \
    -target=aws_apigatewayv2_route.delete_user \
    -target=aws_cloudwatch_log_group.users \
    -auto-approve
  cd "$REPO_ROOT"
  info "✅ Terraform apply complete"
  echo ""
  warning "REMINDER: update cors_configuration in api_gateway.tf to include PUT,DELETE"
  warning "then run: terraform apply -target=aws_apigatewayv2_api.main"
  echo ""
fi

# ── 2. Hot-deploy handler ─────────────────────────────────────────────────────
if [[ "$SMOKE_ONLY" != "true" ]]; then
  ZIP_PATH="$BUILD_DIR/users.zip"
  [[ -f "$LAMBDA_DIR/handler.py" ]] || error "handler.py not found at $LAMBDA_DIR/handler.py"

  info "Zipping users/handler.py..."
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

  info "✅ Users Lambda deployed"
  echo ""
fi

# ── 3. Smoke test ─────────────────────────────────────────────────────────────
if [[ "$SMOKE_ONLY" == "true" ]] || [[ "${SMOKE_TEST:-false}" == "true" ]]; then
  RESULT="$BUILD_DIR/smoke_users.json"
  info "Smoke-testing GET /users (direct Lambda invoke as j.yuliantoro@f5.com)..."

  PAYLOAD=$(python3 -c "
import json
outer = json.dumps({
  'requestContext': {
    'http': {'method': 'GET'},
    'authorizer': {'jwt': {'claims': {'email': 'j.yuliantoro@f5.com'}}}
  }
})
print(outer)
")

  aws lambda invoke \
    --region               "$AWS_REGION" \
    --function-name        "$FUNCTION" \
    --payload              "$PAYLOAD" \
    --cli-binary-format    raw-in-base64-out \
    --output               text \
    --query                'StatusCode' \
    "$RESULT" > /dev/null

  python3 - "$RESULT" <<'PYEOF'
import json, sys

with open(sys.argv[1]) as f:
    outer = json.load(f)

if "errorMessage" in outer:
    print(f"  Lambda ERROR: {outer['errorMessage']}")
    sys.exit(1)

status = outer.get("statusCode", "?")
body   = json.loads(outer.get("body", "{}"))

if status == 200:
    users = body.get("users", [])
    print(f"\n  HTTP {status} — {len(users)} user(s) returned:")
    for u in users:
        print(f"    {u['email']:40s}  {u['role']:10s}  {'built-in' if u.get('builtIn') else 'added'}")
    print()
else:
    print(f"  HTTP {status} — {body.get('error', 'unknown error')}")
    sys.exit(1)
PYEOF
fi

echo -e "${GREEN}✅ users deploy complete.${NC}"
echo ""
warning "First-time infra setup?  ./scripts/deploy_users.sh --infra"
warning "Hot deploy only:         ./scripts/deploy_users.sh"
warning "Smoke test:              SMOKE_TEST=true ./scripts/deploy_users.sh"
echo ""
