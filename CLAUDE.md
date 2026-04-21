# ASEAN Application Resilience Score Card System — Project Context

## What this is
A React/Vite SPA + AWS serverless backend used by F5 ASEAN presales engineers to assess
customer application resilience, surface security gaps, and position F5 Distributed Cloud (XC)
in pre-sales engagements. The tool runs live DNS/HTTPS probes against customer domains,
generates an AI-powered narrative analysis via Azure AI Foundry (GPT-4o), and produces a
printable PDF report — all before credentials are granted.

**Repo:** https://github.com/jokoyuliantoro/f5-asean-score-cards

---

## Stack

### Frontend
- React + Vite, CSS Modules throughout
- No React Router — plain switch in `App.jsx`
- Chart.js via react-chartjs-2
- Auth: Cognito OTP flow (no password), real OTP sent via SES email; demo mode via `VITE_AUTH_MODE=demo` in `.env.local`
- Dev: `npm run dev` → http://localhost:5173
- Runtime config injected into `index.html` at deploy time via `window.__ENV__`

### Backend (AWS ap-southeast-1)
- API Gateway (HTTP API v2): `https://4j10a2iuk7.execute-api.ap-southeast-1.amazonaws.com/v1`
- Lambda (Python 3.12), DynamoDB single-table (`f5-asean-score-cards-prod`)
- Cognito User Pool: `ap-southeast-1_ApP6AbUqs` / Client: `5a3vcf65qbof6ul7popqsaav5d`
- SES: `joko.yuliantoro@gmail.com` (sandbox — only verified addresses receive email)
- Parameter Store prefix: `/f5-asean/` and `/f5-asean/azure-openai/`
- Terraform state in S3 bucket `f5-asean-score-card-s3`, key `scorecard/terraform.tfstate`
- All infra in `backend/terraform-cloudflare/`

### CDN / DNS (Cloudflare)
- Domain: `asean-score-cards.f5-adsp.com`
- Cloudflare zone: `f5-adsp.com` (zone ID: `5fbe28ebf0a1447e7518efcd6eb07efc`)
- S3 bucket: `f5-asean-score-cards-spa-prod-5ecbdcce`
- Cloudflare Worker `f5_asean_score_cards_spa_router`: handles SPA routing and Host header rewrite
- SSL mode: Full

### AI Analysis
- Azure AI Foundry (GPT-4o): `https://joko-aifoundry.openai.azure.com/openai/v1/chat/completions`
- SSM params: `/f5-asean/azure-openai/endpoint`, `/key`, `/deployment`
- `analysis_dns/handler.py` is bundled as `analysis_dns.py` inside the `dns_discovery` zip
- **Critical:** use `/openai/v1/chat/completions` not `/openai/v1/responses`

---

## Repo Structure
```
frontend/
  src/
    api/
      auth.js          — Cognito CUSTOM_AUTH OTP flow (CLIENT_ID from window.__ENV__)
      discovery.js     — runDnsDiscovery(domain, idToken, onPhase), runHttpsDiscovery stub
      users.js         — listUsers, createUser, updateUser, deleteUser, resolveRole
    components/
      App.jsx          — top-level routing switch, resolves role from DynamoDB at login
      DnsPage.jsx      — DNS discovery report (COMPLETE)
      DnsPage.module.css
      DiscoveryProgress.jsx
      DiscoveryProgress.module.css
      HttpsPage.jsx    — pending rewrite (original stub)
      AuditLogPage.jsx — session audit log (all roles, filtered by role)
      AuditLogPage.module.css
      UsersPage.jsx    — admin-only user management, wired to DynamoDB via /users Lambda
      UsersPage.module.css
      Sidebar.jsx      — nav with adminOnly items filtered by role
    data/
      appData.js       — scoreColor, fmtTimestamp, SCAN_GROUPS
      auditLog.js      — in-session audit log store (sessionStorage)
      users.js         — INITIAL_USERS, ROLE_LABELS, ROLE_COLORS,
                         getRoleForEmail (seed fallback), getRoleFromSeed

backend/
  lambda/
    dns_discovery/
      handler.py       — full DNS probe + AI analysis inline (COMPLETE)
    analysis_dns/
      handler.py       — Azure OpenAI call, XML section parsing (bundled into dns_discovery zip)
    https_discovery/
      handler.py       — original stub, pending rewrite
    latency_probe/
      handler.py       — shared TCP latency probe, deployed in SEA + USE1
    auth/
      define_auth_challenge.py
      create_auth_challenge.py  — DEMO_OTP_ENABLED=false for real OTP email (true = fixed 123456 for local dev only)
      verify_auth_challenge.py  — DEMO_OTP_ENABLED=false must match create_auth_challenge
    audit/
      handler.py       — write/query audit events (POST /audit, GET /audit)
    users/
      handler.py       — user registry CRUD (GET/POST /users, PUT/DELETE /users/{email})
  terraform-cloudflare/   ← ACTIVE terraform directory
    main.tf, variables.tf, outputs.tf
    lambda.tf          — all Lambda functions + shared IAM role
    api_gateway.tf     — HTTP API v2 routes (allow_methods includes PUT, DELETE)
    analysis_ssm.tf    — Azure OpenAI SSM params + IAM policy extension
    latency_probe.tf   — dual-region probe Lambdas (SEA + USE1)
    users.tf           — users Lambda + API Gateway routes
    s3.tf, cognito.tf, dynamodb.tf, cloudflare.tf, parameter_store.tf

scripts/
  deploy_handlers.sh   — hot-deploy dns/https Lambda handlers
  deploy_audit.sh      — hot-deploy audit Lambda
  deploy_users.sh      — hot-deploy users Lambda (--infra for first-time Terraform)
  deploy.sh            — frontend build + S3 sync + Cloudflare cache purge
  get_token.sh         — gets fresh Cognito IdToken → writes VITE_DEMO_TOKEN to .env.local
```

---

## DynamoDB — Single Table Schema (`f5-asean-score-cards-prod`)

**GSI:** `gsi1-entityType-createdAt` — `gsi1pk` (S) + `createdAt` (S)

| pk | sk | gsi1pk | Use |
|---|---|---|---|
| `JOB#<jobId>` | `PILLAR#dns` | `JOB` | DNS discovery result |
| `JOB#<jobId>` | `PILLAR#https` | `JOB` | HTTPS discovery result |
| `AUDIT#<email>` | `<ISO-ts>#<uuid>` | `AUDIT` | Audit event |
| `USER#<email>` | `METADATA` | `USER` | User record |

**User item fields:** `email`, `name`, `role`, `country`, `builtIn`, `createdAt`, `updatedAt`

**Discovery result item:**
```
PK: JOB#{jobId} / SK: PILLAR#dns
jobId, accountId, domain, pillar, status, score
findings: { ...all DNS probe data including issues[] }
aiAnalysis: { status, model, tokensUsed, generatedAt,
              sections: { executive, riskAssessment, f5Recommendation, nextSteps } }
createdAt, completedAt
```

---

## Users Feature (COMPLETE)

### Architecture
- User records stored in the existing DynamoDB single table at `USER#<email> / METADATA`
- `GET /users` lists all users (admin only) — auto-seeds `INITIAL_USERS` on first call
- `POST /users` creates a user (admin only)
- `PUT /users/{email}` updates role/name/country (admin only, cannot change own role)
- `DELETE /users/{email}` removes a user (admin only, cannot remove self)
- Role resolved from DynamoDB at login via `resolveRole()` in `api/users.js`
- Falls back to seed (`getRoleFromSeed`) if user is non-admin or API unreachable

### Role model
| Role | Access |
|---|---|
| `admin` | Full access — probes, reports, Users page, Audit Log (all users) |
| `user` | Standard — probes, reports, own Audit Log |
| `readonly` | Sample Reports + own Audit Log only |

### Bootstrap
On first admin login, `GET /users` triggers `_seed_if_empty()` which writes `INITIAL_USERS`
to DynamoDB. If the admin record doesn't exist yet, write it directly:
```bash
aws dynamodb put-item \
  --region ap-southeast-1 \
  --table-name f5-asean-score-cards-prod \
  --item '{
    "pk":        {"S": "USER#j.yuliantoro@f5.com"},
    "sk":        {"S": "METADATA"},
    "gsi1pk":    {"S": "USER"},
    "email":     {"S": "j.yuliantoro@f5.com"},
    "name":      {"S": "Joko Yuliantoro"},
    "role":      {"S": "admin"},
    "country":   {"S": "Singapore"},
    "builtIn":   {"BOOL": true},
    "createdAt": {"S": "2026-04-21T00:00:00.000Z"},
    "updatedAt": {"S": "2026-04-21T00:00:00.000Z"}
  }'
```

### Key data/users.js exports
```js
INITIAL_USERS    — seed list (mirrors Lambda INITIAL_USERS)
ROLE_LABELS      — { admin: 'Admin', user: 'User', readonly: 'Read-Only' }
ROLE_COLORS      — { admin: {bg, text}, user: {bg, text}, readonly: {bg, text} }
getRoleForEmail(email, users?)  — checks live registry then seed
getRoleFromSeed(email)          — seed-only fallback
```

---

## DnsPage — Current State (COMPLETE)

**Section order in report:**
1. Discovery context bar (appDomain, apexDomain, probe time, source)
2. Lambda latency warning banner (when source=lambda)
3. Score gauge + severity counts (always visible, no collapse)
4. AI Analysis (collapsible, **default collapsed**) — GPT-4o generated, plain text display
   - Executive Summary / Risk Assessment / F5 Recommendation / Suggested Next Steps
   - Each sub-section has an `Edit` button → switches to textarea for editing
   - `Save Report` button (currently stub — wired in Step 2)
5. Findings list (critical → high → medium → low)
6. Raw Discovery Data (collapsed by default)
7. F5 XC promo strip + Print/PDF button

**Key component patterns:**
- `Collapsible` component accepts `label`, `labelSuffix`, `icon`, `defaultOpen`, `variant`
- `variant="ai"` — matches Findings heading size (14px/700)
- `variant="raw"` — bordered box
- `variant="remedy"` / `"verify"` — finding card sub-sections
- AI sections: plain `<p className={styles.aiText}>` for display, `<textarea>` only in edit mode
- `DiscoveryProgress` floater: `position: fixed`, `pointer-events: none`, light mode

**Discovery flow:**
```
runDnsDiscovery(domain, idToken, onPhase)
  → phase simulation timer (init→scoring)
  → POST /v1/discovery/dns  { domain }
  → response arrives → onPhase('analysis') → onPhase('done')
  → apiResult includes findings + aiAnalysis
```

**Token resolution in discovery.js:**
```js
const rawToken = import.meta.env.VITE_DEMO_TOKEN   // real token from .env.local (priority)
  || sessionStorage.getItem('idToken')
  || idToken;
const token = rawToken && !rawToken.startsWith('demo.') ? rawToken : null;
```

---

## Key Learnings / Principles

- **"Discovery" not "Probe"** in customer-facing strings; internal code identifiers unchanged
- **"Probe" not "Scan"** — "scan" triggers security approval friction in customer meetings
- **Competitor references:** always generic ("legacy CDN-WAF vendors"), never named
- **Anycast detection:** dual-region TCP probe (SEA + USE1), port 53 for NS IPs, port 443 for app IPs; < 30ms from both = confirmed anycast
- **TTL guidance:** 300s = high score (modern standard); 3600s = low score
- **DynamoDB:** boto3 resource API rejects Python floats — always use `_floats_to_decimal()` before `put_item`
- **Demo token:** auth.js generates `demo.{base64}.signature` — detect with `startsWith('demo.')`, never send to API Gateway
- **Print PDF:** App.module.css has `overflow:hidden` on `.shell` — override with `[class*="_shell_"]` in `@media print`
- **CSS Modules:** Vite hashes class names — use `[class*="_shell_"]` substring selectors in `@media print`
- **analysis_dns bundling:** `deploy_handlers.sh` copies `analysis_dns/handler.py` → `dns_discovery/analysis_dns.py` before zipping; clean up temp file after
- **Azure endpoint:** use `/openai/v1/chat/completions` not `/openai/v1/responses`
- **AI sections display:** plain `<p>` text by default, `<textarea>` only when Edit button clicked
- **Terraform init:** always run from `backend/terraform-cloudflare/` with backend config:
  ```bash
  terraform init \
    -backend-config="bucket=f5-asean-score-card-s3" \
    -backend-config="key=scorecard/terraform.tfstate" \
    -backend-config="region=ap-southeast-1"
  ```
- **DEMO_OTP_ENABLED:** Must be `false` on BOTH `create_auth_challenge` and `verify_auth_challenge` Lambdas for real OTP email. Terraform sets this to `false` on apply — this is correct, do NOT re-enable. To use demo mode locally, set `VITE_AUTH_MODE=demo` in `frontend/.env.local` instead (no Lambda changes needed).
- **OTP auth two-Lambda rule:** `DEMO_OTP_ENABLED` must be in sync on both auth Lambdas. If one is `true` and the other `false`, login will always fail — create sends `123456`, verify compares against the real random OTP (or vice versa).
- **Cognito client recreation:** if `terraform apply` recreates `aws_cognito_user_pool_client`, update `CLIENT_ID` in `get_token.sh` and the `sed` line in `deploy.sh`
- **Users Lambda chicken-and-egg:** `GET /users` requires admin role, but role comes from DynamoDB. Bootstrap by writing the admin record directly with `aws dynamodb put-item` before first login.

---

## Dev Commands

```bash
# Frontend dev server
cd frontend && npm run dev

# Install frontend deps (first time or after clean)
cd frontend && npm install

# Get fresh Cognito token (valid 8hr) → writes to .env.local
./scripts/get_token.sh

# Deploy frontend (build + S3 sync + Cloudflare cache purge)
./scripts/deploy.sh

# Hot-deploy dns_discovery Lambda (includes analysis_dns.py)
./scripts/deploy_handlers.sh dns
SMOKE_TEST=true SMOKE_DOMAIN=f5.com ./scripts/deploy_handlers.sh dns

# Hot-deploy users Lambda
./scripts/deploy_users.sh
SMOKE_TEST=true ./scripts/deploy_users.sh --smoke-only

# Hot-deploy audit Lambda
./scripts/deploy_audit.sh

# Terraform (infra changes) — always from terraform-cloudflare/
cd backend/terraform-cloudflare
terraform init -backend-config="bucket=f5-asean-score-card-s3" \
               -backend-config="key=scorecard/terraform.tfstate" \
               -backend-config="region=ap-southeast-1"
terraform apply -auto-approve

# Check Lambda logs (last 10 min)
aws logs tail /aws/lambda/f5-asean-score-cards-dns-discovery-prod \
  --region ap-southeast-1 --since 10m --format short

aws logs tail /aws/lambda/f5-asean-score-cards-users-prod \
  --region ap-southeast-1 --since 10m --format short
```

---

## Auth Users
| Email | Role |
|---|---|
| j.yuliantoro@f5.com | admin |
| a.iswanto@f5.com | user |
| ky.cheong@f5.com | user |
| any other @f5.com | read-only |
| non-@f5.com | read-only (partner) |

OTP: real 6-digit code sent via SES email. Demo mode (fixed `123456`) requires `VITE_AUTH_MODE=demo` in `frontend/.env.local` — no Lambda changes needed.

---

## SES Verified Identities (sandbox)
Only these addresses can **receive** OTP email while SES remains in sandbox:
- `joko.yuliantoro@gmail.com` (sender)
- `j.yuliantoro@f5.com`
- `a.iswanto@f5.com`
- `ky.cheong@f5.com`

To add a new user who needs login access, verify their address first:
```bash
aws sesv2 create-email-identity --email-identity <email> --region ap-southeast-1
```

---

## Pending / Known Issues
- SES still in sandbox — new users must be verified before they can receive OTP email
- HttpsPage: original stub, needs same treatment as DnsPage (Step 3+)
- GitHub Actions CI/CD: not yet set up
- Report save/load (Step 2): `Save Report` button in DnsPage is still a stub
- Cognito client ID hardcoded in `get_token.sh` — update if client is ever recreated by Terraform
