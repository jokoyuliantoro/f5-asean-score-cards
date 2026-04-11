#!/bin/bash
# =============================================================================
# deploy.sh — F5 ASEAN Scorecard full deploy
# Run from repo root: ./scripts/deploy.sh
#
# Prerequisites (WSL):
#   - AWS CLI configured (aws configure) with F5 AWS account creds
#   - Terraform >= 1.9 installed
#   - Node.js 20+ installed
#   - pip3 / python3.12 available
#   - TF_STATE_BUCKET env var set (or passed as arg)
#
# Usage:
#   TF_STATE_BUCKET=my-tf-state-bucket ./scripts/deploy.sh
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TERRAFORM_DIR="$REPO_ROOT/backend/terraform"
FRONTEND_DIR="$REPO_ROOT/frontend"
LAMBDA_DIR="$REPO_ROOT/backend/lambda"
BUILD_DIR="$TERRAFORM_DIR/.build"

# Colour helpers
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[deploy]${NC} $*"; }
warning() { echo -e "${YELLOW}[warn]${NC}   $*"; }
error()   { echo -e "${RED}[error]${NC}  $*"; exit 1; }

# ── 0. Validate prerequisites ─────────────────────────────────────────────────
info "Checking prerequisites..."
command -v aws       >/dev/null 2>&1 || error "aws CLI not found. Install: sudo apt install awscli"
command -v terraform >/dev/null 2>&1 || error "terraform not found. See README for install."
command -v node      >/dev/null 2>&1 || error "node not found. Install: sudo apt install nodejs"
command -v python3   >/dev/null 2>&1 || error "python3 not found."
command -v pip3      >/dev/null 2>&1 || error "pip3 not found."

[[ -z "${TF_STATE_BUCKET:-}" ]] && error "TF_STATE_BUCKET env var not set. Export it before running."

TFVARS="$TERRAFORM_DIR/terraform.tfvars"
[[ ! -f "$TFVARS" ]] && error "terraform.tfvars not found at $TFVARS. Copy .example and fill in values."

# ── 1. Build dnspython Lambda Layer ──────────────────────────────────────────
info "Building dnspython Lambda Layer..."
LAYER_DIR="$BUILD_DIR/layer_dnspython/python"
mkdir -p "$LAYER_DIR"

pip3 install dnspython==2.6.1 \
  --target "$LAYER_DIR" \
  --platform manylinux2014_x86_64 \
  --implementation cp \
  --python-version 3.12 \
  --only-binary=:all: \
  --upgrade \
  --quiet

info "dnspython layer ready at $LAYER_DIR"

# ── 2. Build frontend ─────────────────────────────────────────────────────────
info "Building frontend..."
cd "$FRONTEND_DIR"
npm ci --silent
npm run build
cd "$REPO_ROOT"
info "Frontend built → frontend/dist/"

# ── 3. Terraform init + apply ─────────────────────────────────────────────────
info "Initialising Terraform..."
mkdir -p "$BUILD_DIR"
cd "$TERRAFORM_DIR"

terraform init -reconfigure \
  -backend-config="bucket=$TF_STATE_BUCKET" \
  -backend-config="key=scorecard/terraform.tfstate" \
  -backend-config="region=ap-southeast-1"

info "Running Terraform plan..."
terraform plan -out="$BUILD_DIR/tfplan" -var-file="$TFVARS"

info "Applying Terraform..."
terraform apply "$BUILD_DIR/tfplan"

# ── 4. Read outputs ───────────────────────────────────────────────────────────
API_URL=$(terraform output -raw api_gateway_url)
COGNITO_CLIENT_ID=$(terraform output -raw cognito_client_id)
S3_BUCKET=$(terraform output -raw spa_bucket)
CF_ID=$(terraform output -raw cloudfront_id)
APP_URL=$(terraform output -raw app_url)
cd "$REPO_ROOT"

info "API URL:      $API_URL"
info "Cognito ID:   $COGNITO_CLIENT_ID"
info "S3 Bucket:    $S3_BUCKET"
info "CloudFront:   $CF_ID"

# ── 5. Inject runtime config into SPA build ───────────────────────────────────
# The frontend reads window.__ENV__ which is injected into index.html
info "Injecting runtime config into index.html..."
RUNTIME_CONFIG="<script>window.__ENV__={API_URL:\"$API_URL\",COGNITO_CLIENT_ID:\"$COGNITO_CLIENT_ID\"};</script>"

# Insert before </head>
sed -i "s|</head>|$RUNTIME_CONFIG</head>|" "$FRONTEND_DIR/dist/index.html"

# ── 6. Deploy SPA to S3 ───────────────────────────────────────────────────────
info "Syncing SPA to S3..."

# Hashed assets — long cache
aws s3 sync "$FRONTEND_DIR/dist/" "s3://$S3_BUCKET/" \
  --delete \
  --exclude "index.html" \
  --cache-control "public,max-age=31536000,immutable" \
  --quiet

# index.html — no cache (always fresh)
aws s3 cp "$FRONTEND_DIR/dist/index.html" "s3://$S3_BUCKET/index.html" \
  --cache-control "no-cache,no-store,must-revalidate" \
  --content-type "text/html"

# ── 7. Invalidate CloudFront cache ────────────────────────────────────────────
info "Invalidating CloudFront cache..."
aws cloudfront create-invalidation \
  --distribution-id "$CF_ID" \
  --paths "/*" \
  --query 'Invalidation.Id' \
  --output text

echo ""
echo -e "${GREEN}✅ Deploy complete!${NC}"
echo -e "   App URL: ${YELLOW}$APP_URL${NC}"
echo ""
warning "First deploy? Remember to verify your SES email address:"
warning "  AWS Console → SES → Verified Identities → check $( grep ses_from_email "$TFVARS" | cut -d'"' -f2 )"
