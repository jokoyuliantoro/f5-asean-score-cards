# F5 ASEAN Score Cards — Project Context

## Repo
https://github.com/jokoyuliantoro/f5-asean-score-cards

## Current State (as of 2026-04-11)
- Phase 0+1 complete: repo restructured, terminology Probe→Discovery done
- Phase 3 complete: all AWS infra deployed via Terraform
- Phase 4 complete: Lambda functions working (tested against google.com)
- Phase 5 pending: CloudFront blocked (AWS Support case open), SPA not yet live
- ngrok identified as demo fallback for Apr 16 QBR
- Next: wire frontend to real API (replace mock appData.js)
- Cognito: admin user (joko.yuliantoro@gmail.com) created and CONFIRMED
- SES: joko.yuliantoro@gmail.com verified (Success)
- Cognito: admin user (joko.yuliantoro@gmail.com) created and CONFIRMED
- SES: joko.yuliantoro@gmail.com verified (Success)

## AWS Account
- Account ID: 120864355486
- Region: ap-southeast-1
- IAM user: f5aseanscorecards

## Live AWS Resources
- API Gateway: https://4j10a2iuk7.execute-api.ap-southeast-1.amazonaws.com/v1
- Cognito User Pool ID: ap-southeast-1_ApP6AbUqs
- Cognito Client ID: 233vpvh8n0c3q95hn6021mpod8
- DynamoDB table: f5-asean-score-cards-prod
- S3 bucket: f5-asean-score-cards-spa-prod-26244f70
- CloudFront: PENDING (AWS Support case open)

## Architecture
- Frontend: React/Vite SPA → S3 + CloudFront
- Auth: Cognito OTP-only (custom auth flow via Lambda triggers)
- API: API Gateway HTTP v2 → Lambda (Python 3.12)
- DB: DynamoDB single table (pk=JOB#<id>, sk=PILLAR#dns|https)
- IaC: Terraform (state in s3://f5-scorecard-tfstate-120864355486)
- Deploy: scripts/deploy.sh from WSL

## Repo Structure
frontend/          ← React/Vite SPA (CSS Modules, no React Router)
backend/
  lambda/
    dns_discovery/     ← handler.py (dnspython layer)
    https_discovery/   ← handler.py (stdlib ssl/socket only)
    auth/              ← define/create/verify_auth_challenge.py
  terraform/         ← all infra-as-code
scripts/
  deploy.sh          ← full end-to-end deploy from WSL

## Key Conventions
- "Discovery" not "Probe" in customer-facing strings
- Internal code identifiers (SCAN_GROUPS, scanGroup, surfaceScan) unchanged
- TTL ≤300s = high score (modern standard), >3600s = low
- Competitor references always generic ("legacy CDN-WAF vendors")
- CSS Modules throughout, no React Router (plain switch in App.jsx)
- DynamoDB single-table: pk=JOB#<id>, sk=PILLAR#dns|https|surfaceScan|deepScan

## Pending Work
- [ ] CloudFront unblock → re-run deploy.sh → get live URL
- [ ] Wire frontend to real API (replace mock appData.js with API calls)
- [ ] GitHub Actions CI/CD (.github/workflows/deploy.yml)
- [ ] SES sandbox exit request (to send OTPs to non-verified addresses)
- [ ] Add remaining team members to Cognito
