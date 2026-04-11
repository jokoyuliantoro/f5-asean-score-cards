#!/bin/bash
# =============================================================================
# scaffold.sh — run ONCE from repo root to create Phase 3 file structure
# Usage: ./scripts/scaffold.sh
# =============================================================================
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "Creating directory structure..."

# Terraform
mkdir -p backend/terraform/.build    # .build is gitignored (generated zips)

# Lambda source directories
mkdir -p backend/lambda/dns_discovery
mkdir -p backend/lambda/https_discovery
mkdir -p backend/lambda/auth

# Scripts
mkdir -p scripts

# Copy Terraform files (already in repo after this script)
echo "Directory structure created."
echo ""
echo "Next: add the Terraform .tf files and Lambda source files per the guide."
