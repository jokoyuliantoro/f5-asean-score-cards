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

* React + Vite, CSS Modules throughout
* No React Router — plain switch in `App.jsx`
* Chart.js via react-chartjs-2
* Auth: Cognito OTP flow (no password), demo mode fixed OTP = `123456`
* Dev: `npm run dev` → http://localhost:5173
* Runtime config injected into `index.html` at deploy time via `window.__ENV__`
* `discovery.js` reads API URL as: `window.__ENV__.API_URL || import.meta.env.VITE_API_BASE_URL || hardcoded-fallback`

### Backend (AWS ap-southeast-1)

* API Gateway (HTTP API v2): `https://0ol0f4sixh.execute-api.ap-southeast-1.amazonaws.com/v1`
* Lambda (Python 3.12), DynamoDB single-table (`f5-asean-score-cards-prod`)
* Cognito User Pool: `ap-southeast-1_ApP6AbUqs` / Client: `c2jgnds8kc9lk8rin6qj8fnco`
* SES: `joko.yuliantoro@gmail.com` (sandbox — only verified addresses receive email)
* Parameter Store prefix: `/f5-asean/` and `/f5-asean/azure-openai/`
* Terraform state in S3 bucket: `f5-asean-score-card-s3`, key: `scorecard/terraform.tfstate`
* All infra in `backend/terraform-cloudflare/` (previously `backend/terraform/`)

### CDN / DNS (Cloudflare — replaces CloudFront)

* Domain: `asean-score-cards.f5-adsp.com`
* Cloudflare zone: `f5-adsp.com` (zone ID: `5fbe28ebf0a1447e7518efcd6eb07efc`)
* Cloudflare account ID: `ac7ea0a20fc5741687738b04f3c9e469`
* CNAME: `asean-score-cards` → S3 REST endpoint (proxied = true)
* SSL mode: **Full** (Cloudflare → S3 over HTTPS using S3's AWS cert)
* Cloudflare Worker `f5_asean_score_cards_spa_router`: handles SPA routing (serves index.html
  for 403/404 from S3) and rewrites Host header to actual S3 bucket domain
* Worker route pattern: `asean-score-cards.f5-adsp.com/*`
* S3 bucket policy: allows GET only from Cloudflare IP ranges (IPv4 + IPv6)
* **S3 website hosting is NOT used** — uses REST endpoint for HTTPS support
* Page Rule: HTTP → HTTPS redirect
* SSL mode set manually in Cloudflare Dashboard (not managed via Terraform — zone settings
  override requires special permissions)

### Why Cloudflare instead of CloudFront

AWS CloudFront is not enabled for this F5 AWS account (support case pending). Cloudflare
provides equivalent CDN + proxy functionality. F5 XC HTTP LB is also blocked (pending F5
IT security approval for internal tooling). Cloudflare is the current interim solution.

### AI Analysis

* Azure AI Foundry (GPT-4o): `https://joko-aifoundry.openai.azure.com/openai/v1/chat/completions`
* SSM params: `/f5-asean/azure-openai/endpoint`, `/key`, `/deployment`
* `analysis_dns/handler.py` is bundled as `analysis_dns.py` inside the `dns_discovery` zip
* **Critical:** `analysis_dns.py` must be copied into `dns_discovery/` before zipping —
  it is a sibling module import, NOT a separate Lambda invocation

---

## Repo Structure

```
frontend/
  src/
    api/
      auth.js          — Cognito CUSTOM_AUTH OTP flow
      discovery.js     — runDnsDiscovery(domain, idToken, onPhase), runHttpsDiscovery stub
    components/
      App.jsx          — top-level routing switch, idToken state
      DnsPage.jsx      — DNS discovery report (COMPLETE - see below)
      DnsPage.module.css
      DiscoveryProgress.jsx     — floating progress floater (light mode)
      DiscoveryProgress.module.css
      HttpsPage.jsx    — pending rewrite (original stub)
    data/
      appData.js       — scoreColor, fmtTimestamp, SCAN_GROUPS
      users.js         — INITIAL_USERS, getRoleForEmail
  .env.local           — VITE_AUTH_MODE, VITE_DEMO_TOKEN (NOT committed to git)

backend/
  lambda/
    dns_discovery/
      handler.py       — full DNS probe + AI analysis inline (COMPLETE)
      analysis_dns.py  — COPY of analysis_dns/handler.py (bundled as sibling module)
    analysis_dns/
      handler.py       — Azure OpenAI call, XML section parsing (source — copy to dns_discovery/)
    https_discovery/
      handler.py       — original stub, pending rewrite
    latency_probe/
      handler.py       — shared TCP latency probe, deployed in SEA + USE1
    auth/
      define_auth_challenge.py
      create_auth_challenge.py
      verify_auth_challenge.py
  terraform-cloudflare/     ← ACTIVE terraform directory (not backend/terraform/)
    main.tf            — AWS + Cloudflare providers, S3 backend
    variables.tf       — includes cloudflare_api_token, cloudflare_zone_name,
                         cloudflare_subdomain, cloudflare_account_id
    outputs.tf         — app_url, s3_website_endpoint (no cloudfront_id)
    s3.tf              — S3 bucket, website config, Cloudflare IP policy (no OAC)
    cloudflare.tf      — CNAME, Worker script, Worker route, Page Rule
    lambda.tf          — all Lambda functions + shared IAM role
    api_gateway.tf     — HTTP API v2 routes
    analysis_ssm.tf    — Azure OpenAI SSM params + IAM policy extension
    latency_probe.tf   — dual-region probe Lambdas (SEA + USE1)
    cognito.tf, dynamodb.tf, parameter_store.tf
    terraform.tfvars   — NOT committed to git (.gitignore)
    .gitignore         — excludes .terraform/, .build/, *.zip, tfplan, terraform.tfvars

scripts/
  deploy_handlers.sh   — hot-deploy Lambda handlers (bundles analysis_dns.py into dns zip)
  deploy.sh            — full Terraform + frontend deploy (updated for Cloudflare)
  get_token.sh         — gets fresh Cognito IdToken → writes VITE_DEMO_TOKEN to .env.local
```

---

## DnsPage — Current State (Step 1 COMPLETE)

**Section order in report:**

1. Discovery context bar (appDomain, apexDomain, probe time, source)
2. Lambda latency warning banner (when source=lambda)
3. Score gauge + severity counts (always visible, no collapse)
4. AI Analysis (collapsible, **default collapsed**) — GPT-4o generated, plain text display
   * Executive Summary / Risk Assessment / F5 Recommendation / Suggested Next Steps
   * Each sub-section has an `Edit` button → switches to textarea for editing
   * `Save Report` button (currently stub — wired in Step 2)
5. Findings list (critical → high → medium → low)
6. Raw Discovery Data (collapsed by default)
7. F5 XC promo strip + Print/PDF button

**Key component patterns:**

* `Collapsible` component accepts `label`, `labelSuffix`, `icon`, `defaultOpen`, `variant`
* `variant="ai"` — matches Findings heading size (14px/700)
* `variant="raw"` — bordered box
* `variant="remedy"` / `"verify"` — finding card sub-sections
* AI sections: plain `<p className={styles.aiText}>` for display, `<textarea>` only in edit mode
* `DiscoveryProgress` floater: `position: fixed`, `pointer-events: none`, light mode

**Discovery flow:**

```
runDnsDiscovery(domain, idToken, onPhase)
  → phase simulation timer (init→scoring)
  → POST /v1/discovery/dns  { domain }
  → response arrives → onPhase('analysis') → onPhase('done')
  → apiResult includes findings + aiAnalysis
```

**API URL resolution in discovery.js:**

```js
const API_BASE =
  (window.__ENV__ && window.__ENV__.API_URL) ||   // runtime injection (deploy-time)
  import.meta.env.VITE_API_BASE_URL ||            // build-time env var
  'https://0ol0f4sixh.execute-api.ap-southeast-1.amazonaws.com/v1';  // fallback
```

**Token resolution in discovery.js:**

```js
const rawToken = import.meta.env.VITE_DEMO_TOKEN   // real token from .env.local (priority)
  || sessionStorage.getItem('idToken')
  || idToken;
const token = rawToken && !rawToken.startsWith('demo.') ? rawToken : null;
```

---

## DynamoDB — Current Schema (single table: `f5-asean-score-cards-prod`)

**Discovery result item:**

```
PK: JOB#{jobId}
SK: PILLAR#dns
gsi1pk: JOB
jobId, accountId, domain, pillar, status, score
findings: { ...all DNS probe data including issues[] }
aiAnalysis: { status, model, tokensUsed, generatedAt, sections: { executive, riskAssessment, f5Recommendation, nextSteps } }
createdAt, completedAt
```

---

## Deploy Process

### Prerequisites

```bash
export TF_STATE_BUCKET=f5-asean-score-card-s3
export TF_VAR_cloudflare_api_token="your-token"
```

### Cloudflare API token required permissions

* Zone > Zone (Read)
* Zone > DNS (Edit)
* Zone > Page Rules (Edit)
* Zone > Workers Routes (Edit)
* Zone > Zone Settings (Edit)  ← for ssl mode
* Account > Workers Scripts (Edit)  ← must be Account level, not Zone
* Zone > Cache Purge  ← for cache purge after deploy

### Full deploy

```bash
./scripts/deploy.sh
```

### Frontend-only redeploy

```bash
cd frontend
npm run build

# Inject runtime config
sed -i 's|</head>|<script>window.__ENV__={API_URL:"https://0ol0f4sixh.execute-api.ap-southeast-1.amazonaws.com/v1",COGNITO_CLIENT_ID:"c2jgnds8kc9lk8rin6qj8fnco"};</script></head>|' dist/index.html

# Deploy assets (long cache)
aws s3 sync dist/ s3://f5-asean-score-cards-spa-prod-5ecbdcce/ \
  --delete --exclude "index.html" \
  --cache-control "public,max-age=31536000,immutable" --quiet

# Deploy index.html (no cache)
aws s3 cp dist/index.html s3://f5-asean-score-cards-spa-prod-5ecbdcce/index.html \
  --cache-control "no-cache,no-store,must-revalidate" --content-type "text/html"
```

### Purge Cloudflare cache after deploy

```bash
curl -s -X POST \
  "https://api.cloudflare.com/client/v4/zones/5fbe28ebf0a1447e7518efcd6eb07efc/purge_cache" \
  -H "Authorization: Bearer $TF_VAR_cloudflare_api_token" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
```

Or manually: Cloudflare Dashboard → f5-adsp.com → Caching → Cache Purge → Purge Everything

### Lambda-only redeploy (no Terraform)

```bash
cd backend/terraform-cloudflare

# Rebuild dnspython layer if needed
mkdir -p .build/layer_dnspython/python
pip3 install dnspython==2.6.1 \
  --target .build/layer_dnspython/python \
  --platform manylinux2014_x86_64 \
  --implementation cp --python-version 3.12 \
  --only-binary=:all: --upgrade --quiet

# Redeploy single Lambda
terraform apply -target=aws_lambda_function.dns_discovery -auto-approve
```

---

## Step 2 — What needs to be built

### Backend

**1. Report Lambda** (`backend/lambda/report/handler.py`)
Operations: save, load, list, archive, delete (soft)

```
POST   /v1/reports/dns          — save report (findings + edited aiSections)
GET    /v1/reports/dns          — list saved reports for current user (or domain filter)
GET    /v1/reports/dns/{id}     — load a specific saved report
PATCH  /v1/reports/dns/{id}     — update aiSections (after user edits)
DELETE /v1/reports/dns/{id}     — archive (status: active → archived)
DELETE /v1/reports/dns/{id}?hard=true — admin only: true delete
```

**Report DynamoDB item:**

```
PK: REPORT#{domain}
SK: REPORT#{reportId}
reportId, domain, pillar, userId, status (active|archived|deleted)
findings{}, issues[], scores{}, aiSections{ executive, riskAssessment, f5Recommendation, nextSteps }
createdAt, savedAt, archivedAt
GSI: by userId + createdAt (for "my reports" list)
```

**2. Audit Lambda** (`backend/lambda/audit/handler.py`)
Write and query audit events.
Events to log: `discovery.run`, `report.save`, `report.load`, `report.archive`, `report.delete`, `analysis.generate`, `user.login`

```
PK: AUDIT#{userId}
SK: AUDIT#{timestamp}#{eventType}
GSI: by timestamp for admin full-history view
sponsoredBy: set for non-@f5.com users (links to their F5 sponsor)
```

### Frontend

**DnsPage additions:**

* Saved Reports dropdown at top of DnsPage — lists past saves for current domain
  + Selecting one loads that saved report (findings + AI sections)
  + Shows domain, score, date saved
* Wire `Save Report` button to `POST /v1/reports/dns`
* After save: show confirmation, add to dropdown

**New page: AuditLogPage** (`frontend/src/components/AuditLogPage.jsx`)

* Left sidebar nav entry (all roles can see, filtered by role)
* Table: timestamp, user, event type, domain/detail
* Filters: date range, event type, user (admin only)
* Access matrix:
  + admin: all activities
  + @f5.com user: own + sponsored partner activities
  + non-@f5.com: own only

---

## Key Learnings / Principles

* **"Discovery" not "Probe"** in customer-facing strings; internal code identifiers unchanged
* **"Probe" not "Scan"** — "scan" triggers security approval friction in customer meetings
* **Competitor references:** always generic ("legacy CDN-WAF vendors"), never named
* **Anycast detection:** dual-region TCP probe (SEA + USE1), port 53 for NS IPs, port 443 for
  app IPs; < 30ms from both = confirmed anycast
* **TTL guidance:** 300s = high score (modern standard); 3600s = low score
* **DynamoDB:** boto3 resource API rejects Python floats — always use `_floats_to_decimal()`
  before `put_item`
* **Demo token:** auth.js generates `demo.{base64}.signature` — detect with `startsWith('demo.')`,
  never send to API Gateway. Token expires in 8 hours — use `get_token.sh` to refresh
* **Print PDF:** App.module.css has `overflow:hidden` on `.shell` — override with
  `[class*="_shell_"]` in `@media print`
* **CSS Modules:** Vite hashes class names — use `[class*="_shell_"]` substring selectors
  in `@media print`
* **analysis_dns bundling:** `deploy_handlers.sh` copies `analysis_dns/handler.py` →
  `dns_discovery/analysis_dns.py` before zipping; clean up temp file after. The file must
  also exist permanently at `dns_discovery/analysis_dns.py` for Terraform zip packaging
* **Azure endpoint:** use `/openai/v1/chat/completions` not `/openai/v1/responses`
  (Responses API uses different payload shape)
* **AI sections display:** plain `<p>` text by default, `<textarea>` only when Edit button
  clicked — avoids all scrollbar/height issues in print
* **Cloudflare Worker + S3:** Worker must use `cf: { resolveOverride: S3_HOST }` and explicit
  `Host` header rewrite — otherwise Cloudflare forwards the browser's Host header to S3,
  which causes NoSuchBucket error
* **S3 REST vs website endpoint:** REST endpoint supports HTTPS (port 443); website endpoint
  is HTTP-only. Must use REST endpoint when Cloudflare SSL mode is Full
* **Cloudflare SSL Full vs Flexible:** Flexible = Cloudflare→S3 over HTTP (causes issues with
  proxied CNAME). Full = Cloudflare→S3 over HTTPS using S3's AWS cert (correct for REST endpoint)
* **Terraform import pattern:** when migrating Terraform state (e.g. new tfvars/backend), all
  pre-existing AWS resources must be imported before apply, otherwise `ResourceAlreadyExists`
  errors or long hangs on Lambda creation
* **Terraform provider v4 Workers:** `cloudflare_workers_script` uses `content` field (not
  `module` block — that's v5). Use Service Worker format (`addEventListener`) not ES module
  format (`export default`) with v4 provider
* **runtime config injection:** `window.__ENV__` is injected into `index.html` via `sed` at
  deploy time (after `npm run build`). This allows redeployment with different backend URLs
  without rebuilding the JS bundle

---

## Dev Commands

```bash
# Frontend dev server
cd frontend && npm run dev

# Get fresh Cognito token (valid 8hr) → writes to .env.local
./scripts/get_token.sh

# Deploy + smoke test dns_discovery Lambda (includes analysis_dns.py)
SMOKE_TEST=true SMOKE_DOMAIN=f5.com ./scripts/deploy_handlers.sh dns

# Smoke test only (no deploy)
SMOKE_TEST=true SMOKE_DOMAIN=dbs.com ./scripts/deploy_handlers.sh dns --smoke-only

# Terraform apply (infra changes) — from terraform-cloudflare dir
cd backend/terraform-cloudflare && terraform apply -auto-approve

# Check Lambda logs (last 10 min)
aws logs tail /aws/lambda/f5-asean-score-cards-dns-discovery-prod \
  --region ap-southeast-1 --since 10m --format short

# Check AI analysis result from smoke test
cat backend/terraform-cloudflare/.build/smoke_dns.json | python3 -c "
import json, sys
body = json.loads(json.loads(sys.stdin.read())['body'])
ai = body.get('aiAnalysis', {})
print('status:', ai.get('status'))
print('tokens:', ai.get('tokensUsed'))
print(ai.get('sections',{}).get('executive','')[:300])
"

# Verify Cloudflare DNS record
curl -s "https://api.cloudflare.com/client/v4/zones/5fbe28ebf0a1447e7518efcd6eb07efc/dns_records?name=asean-score-cards.f5-adsp.com" \
  -H "Authorization: Bearer $TF_VAR_cloudflare_api_token" | python3 -m json.tool

# Verify Worker is attached
curl -s "https://api.cloudflare.com/client/v4/zones/5fbe28ebf0a1447e7518efcd6eb07efc/workers/routes" \
  -H "Authorization: Bearer $TF_VAR_cloudflare_api_token" | python3 -m json.tool

# Test site is live
curl -I https://asean-score-cards.f5-adsp.com
```

---

## Auth Users

| Email | Role |
|-------|------|
| j.yuliantoro@f5.com | admin |
| a.iswanto@f5.com | user |
| ky.cheong@f5.com | user |
| any other @f5.com | read-only |
| non-@f5.com | read-only (partner) |

OTP in demo mode: always `123456`

---

## Pending / Known Issues

* **CloudFront:** AWS account not enabled for CloudFront — replaced with Cloudflare (current)
* **F5 XC HTTP LB:** pending F5 IT security approval for internal tool use — future replacement
  for Cloudflare when approved (Step 8)
* **SES sandbox:** only verified addresses receive OTP emails; demo mode bypasses this
* **HttpsPage:** original stub, needs same treatment as DnsPage (Step 3+)
* **GitHub Actions CI/CD:** not yet set up (Step 7)
* **Cloudflare cache purge:** requires `Zone > Cache Purge` token permission — currently done
  manually via dashboard after each frontend deploy
* **Cloudflare ruleset (cache rules):** commented out in cloudflare.tf — requires Zone WAF
  permission which Cloudflare free plan may not expose via API token

---

## Full Step Roadmap

### Step 1 — AI Analysis inline with DNS Discovery ✅ COMPLETE

* `analysis_dns/handler.py` — Azure AI Foundry (GPT-4o), XML-tagged sections, graceful fallback
* `dns_discovery/handler.py` — calls `_run_ai_analysis()` inline, persists `aiAnalysis` to DynamoDB
* `DnsPage.jsx` — score first, AI Analysis collapsible (default collapsed), plain text + Edit mode
* `DiscoveryProgress.jsx` — floating light-mode progress window with phase simulation
* `discovery.js` — `onPhase` callback, dual AbortController (fetch vs simulator)
* `analysis_ssm.tf` — SSM parameter placeholders + IAM policy extension for shared Lambda role

---

### Step 1.5 — CloudFront → Cloudflare Migration ✅ COMPLETE

* Removed `aws_cloudfront_distribution`, `aws_cloudfront_origin_access_control`
* Added `cloudflare/cloudflare ~> 4.0` Terraform provider
* S3 bucket: switched from private (OAC) to public read restricted to Cloudflare IPs
* S3: enabled static website hosting + changed to REST endpoint for HTTPS support
* Cloudflare: CNAME record (proxied), Worker for SPA routing + Host header rewrite,
  Worker route, Page Rule for HTTPS redirect
* `scripts/deploy.sh` updated: removed CloudFront invalidation, added Cloudflare cache purge
* All infra now in `backend/terraform-cloudflare/` (Terraform state: `f5-asean-score-card-s3`)

---

### Step 2 — Report Save / Load / Audit Log 🔄 NEXT

*(spec as above)*

---

### Step 3 — HTTPS Discovery

*(unchanged from previous CLAUDE.md)*

---

### Step 4 — Discovery Agent

*(unchanged from previous CLAUDE.md)*

---

### Step 5 — Surface Probe & Deep Probe Pages

*(unchanged from previous CLAUDE.md)*

---

### Step 6 — Executive Brief Page

*(unchanged from previous CLAUDE.md)*

---

### Step 7 — GitHub Actions CI/CD

*(unchanged from previous CLAUDE.md)*

---

### Step 8 — F5 XC HTTP Load Balancer (replace Cloudflare)

* Currently blocked on F5 IT security approval for internal tool use
* When approved: replace Cloudflare Worker + S3 REST with F5 XC HTTP Load Balancer
* Benefits: auto-cert, WAF policy, Bot Defense, XC PoP delivery — dogfooding our own pitch
* Terraform: `volterraedge/volterra` provider, XC HTTPS LB resource
* SPA origin: existing S3 bucket (private, OAC restored)

---

### Ongoing / Parallel (no fixed step)

* **SES sandbox exit** — AWS support request to enable OTP to non-verified addresses
* **Multi-pillar dashboard** — aggregate scores across all four pillars on the Dashboard page
* **Probe History page** — already stubbed in SPA, wire to real DynamoDB data with pagination
* **Cloudflare → F5 XC migration** — when IT security approval granted

---

## Claude Chat vs Claude Code — Working Model

```
Claude Chat  →  Design + architecture + review + update CLAUDE.md
Claude Code  →  Build + deploy + debug
```

**Always start a Claude Code session with:**

```
Read CLAUDE.md at the repo root. Before writing any code, show me:
1. Which files you will create
2. Which files you will modify
3. Any assumptions you are making
```

**After each step completes:**

1. Upload key changed files to Claude Chat
2. Update CLAUDE.md (current state, new patterns, new issues)
3. Design the next step before opening Claude Code
