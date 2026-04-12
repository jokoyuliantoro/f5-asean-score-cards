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
- Auth: Cognito OTP flow (no password), demo mode fixed OTP = `123456`
- Dev: `npm run dev` → http://localhost:5173

### Backend (AWS ap-southeast-1)
- API Gateway (HTTP API v2): `https://4j10a2iuk7.execute-api.ap-southeast-1.amazonaws.com/v1`
- Lambda (Python 3.12), DynamoDB single-table (`f5-asean-score-cards-prod`)
- Cognito User Pool: `ap-southeast-1_ApP6AbUqs` / Client: `233vpvh8n0c3q95hn6021mpod8`
- SES: `joko.yuliantoro@gmail.com` (sandbox — only verified addresses receive email)
- Parameter Store prefix: `/f5-asean/` and `/f5-asean/azure-openai/`
- Terraform state in S3, all infra in `backend/terraform/`

### AI Analysis
- Azure AI Foundry (GPT-4o): `https://joko-asean-score-cards-resource.services.ai.azure.com/...`
- SSM params: `/f5-asean/azure-openai/endpoint`, `/key`, `/deployment`
- `analysis_dns/handler.py` is bundled as `analysis_dns.py` inside the `dns_discovery` zip

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
      create_auth_challenge.py
      verify_auth_challenge.py
  terraform/
    main.tf, variables.tf, outputs.tf
    lambda.tf          — all Lambda functions + shared IAM role
    api_gateway.tf     — HTTP API v2 routes
    analysis_ssm.tf    — Azure OpenAI SSM params + IAM policy extension
    latency_probe.tf   — dual-region probe Lambdas
    s3.tf, cognito.tf, dynamodb.tf

scripts/
  deploy_handlers.sh   — hot-deploy Lambda handlers (bundles analysis_dns.py into dns zip)
  deploy.sh            — full Terraform + frontend deploy
  get_token.sh         — gets fresh Cognito IdToken → writes VITE_DEMO_TOKEN to .env.local
```

---

## DnsPage — Current State (Step 1 COMPLETE)

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
- Saved Reports dropdown at top of DnsPage — lists past saves for current domain
  - Selecting one loads that saved report (findings + AI sections)
  - Shows domain, score, date saved
- Wire `Save Report` button to `POST /v1/reports/dns`
- After save: show confirmation, add to dropdown

**New page: AuditLogPage** (`frontend/src/components/AuditLogPage.jsx`)
- Left sidebar nav entry (all roles can see, filtered by role)
- Table: timestamp, user, event type, domain/detail
- Filters: date range, event type, user (admin only)
- Access matrix:
  - admin: all activities
  - @f5.com user: own + sponsored partner activities
  - non-@f5.com: own only

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
- **Azure endpoint:** use `/openai/v1/chat/completions` not `/openai/v1/responses` (Responses API uses different payload shape)
- **AI sections display:** plain `<p>` text by default, `<textarea>` only when Edit button clicked — avoids all scrollbar/height issues in print

---

## Dev Commands

```bash
# Frontend dev server
cd frontend && npm run dev

# Get fresh Cognito token (valid 1hr) → writes to .env.local
./scripts/get_token.sh

# Deploy + smoke test dns_discovery Lambda (includes analysis_dns.py)
SMOKE_TEST=true SMOKE_DOMAIN=f5.com ./scripts/deploy_handlers.sh dns

# Smoke test only (no deploy)
SMOKE_TEST=true SMOKE_DOMAIN=dbs.com ./scripts/deploy_handlers.sh dns --smoke-only

# Terraform apply (infra changes)
cd backend/terraform && terraform apply -auto-approve

# Check Lambda logs (last 10 min)
aws logs tail /aws/lambda/f5-asean-score-cards-dns-discovery-prod \
  --region ap-southeast-1 --since 10m --format short

# Check AI analysis result from smoke test
cat backend/terraform/.build/smoke_dns.json | python3 -c "
import json, sys
body = json.loads(json.loads(sys.stdin.read())['body'])
ai = body.get('aiAnalysis', {})
print('status:', ai.get('status'))
print('tokens:', ai.get('tokensUsed'))
print(ai.get('sections',{}).get('executive','')[:300])
"
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

OTP in demo mode: always `123456`

---

## Pending / Known Issues
- CloudFront: AWS Support case open — SPA served locally via `npm run dev`
- SES sandbox: only verified addresses receive OTP emails; demo mode bypasses this
- HttpsPage: original stub, needs same treatment as DnsPage (Step 3+)
- GitHub Actions CI/CD: not yet set up

---

## Full Step Roadmap

### Step 1 — AI Analysis inline with DNS Discovery ✅ COMPLETE
- `analysis_dns/handler.py` — Azure AI Foundry (GPT-4o), XML-tagged sections, graceful fallback
- `dns_discovery/handler.py` — calls `_run_ai_analysis()` inline, persists `aiAnalysis` to DynamoDB
- `DnsPage.jsx` — score first, AI Analysis collapsible (default collapsed), plain text + Edit mode
- `DiscoveryProgress.jsx` — floating light-mode progress window with phase simulation
- `discovery.js` — `onPhase` callback, dual AbortController (fetch vs simulator)
- `analysis_ssm.tf` — SSM parameter placeholders + IAM policy extension for shared Lambda role

---

### Step 2 — Report Save / Load / Audit Log 🔄 NEXT
**Backend:**
- `backend/lambda/report/handler.py` — save, load, list, archive, delete (soft-delete pattern)
  - Routes: `POST /v1/reports/dns`, `GET /v1/reports/dns`, `GET /v1/reports/dns/{id}`, `PATCH /v1/reports/dns/{id}`, `DELETE /v1/reports/dns/{id}`
  - Soft delete: `status: active → archived → deleted` (only admin can hard delete)
  - DynamoDB: `PK: REPORT#{domain}`, `SK: REPORT#{reportId}`, GSI by userId+createdAt
- `backend/lambda/audit/handler.py` — write + query audit events
  - Events: `discovery.run`, `report.save`, `report.load`, `report.archive`, `report.delete`, `analysis.generate`, `user.login`
  - DynamoDB: `PK: AUDIT#{userId}`, `SK: AUDIT#{timestamp}#{eventType}`, GSI by timestamp for admin view
  - `sponsoredBy` field links non-@f5.com users to their F5 sponsor

**Frontend:**
- `DnsPage.jsx` — saved reports dropdown (list by domain), wire Save button to API, confirmation after save
- `AuditLogPage.jsx` — new left sidebar nav entry
  - Table: timestamp, user, event type, domain/detail
  - Filters: date range, event type, user (admin only sees all users filter)
  - Access matrix: admin = all; @f5.com = own + sponsored partners; non-@f5.com = own only

---

### Step 3 — HTTPS Discovery
**Backend:**
- Rewrite `https_discovery/handler.py` — same depth as DNS:
  - TLS floor version, TLS 1.3 cipher strength, chain key progression, leaf signature algorithm
  - Session resumption, HTTP version via ALPN (`curl` + `openssl` methodology)
  - Dual-region latency probe on app IPs (anycast detection, same pattern as DNS)
  - HSTS, CSP, security headers
  - F5 XC HTTP LB + WAF remediation mapping per finding
  - `analysis_https` module bundled into zip (same pattern as `analysis_dns`)

**Frontend:**
- Rewrite `HttpsPage.jsx` — identical evidence-first layout to DnsPage
  - AI analysis inline (same pattern, same collapsible default)
  - Editable sections, save report, saved reports dropdown
  - `DiscoveryProgress` floater reused with HTTPS-specific phases

---

### Step 4 — Discovery Agent
- Evolve WSL Python script into proper cross-platform agent (Windows, Mac, Android, iOS)
- Capabilities beyond Lambda vantage point:
  - Multi-vantage anycast detection
  - Full `curl` timing: DNS resolve, TCP connect, TLS handshake, TTFB, total — per NS, per IP
  - Real user-perspective latency from the meeting room / customer location
- Submits to API Gateway with `latencyContext.source: "agent"` and `sourceLabel: "Discovery Agent (on-site)"`
- Overwrites Lambda result in DynamoDB with richer agent data
- Packaged via PyInstaller — zero-install single executable
- Connects via API Gateway with Cognito JWT or API key, exponential backoff retry
- `--offline` demo mode for air-gapped environments

---

### Step 5 — Surface Probe & Deep Probe Pages
- `SurfaceScanPage.jsx` and `DeepScanPage.jsx` — currently UI stubs with sample data
- Wire to real backend probes (handlers already exist as stubs)
- Surface Probe: HTTP response headers, WAF fingerprinting, exposed endpoints, robots.txt, error page leakage
- Deep Probe: authenticated scan — requires credentials, tests post-login attack surface
- Same evidence-first pattern: AI analysis + findings + raw data
- Same save/load/audit pattern from Step 2

---

### Step 6 — Executive Brief Page
- New page in SPA: competitive differentiation leave-behind for executive meetings
- Components:
  - Risk headline cards (one per pillar: DNS / HTTPS / Surface / Deep) with score + top issue
  - Capability map table: finding category → legacy CDN-WAF gap → F5 XC capability
  - Coverage bar chart across all four pillars (Chart.js)
  - Scan coverage strip showing which pillars have been run
- Print/PDF optimised as a polished leave-behind artifact
- Data layer: `xcRemediation.js` maps eight finding categories to competitor gaps and F5 XC capabilities
- Competitor references always generic: "legacy CDN-WAF vendors", "traditional DNS providers"

---

### Step 7 — GitHub Actions CI/CD
- `.github/workflows/deploy.yml` with three jobs:
  1. SPA build + deploy to S3 (`aws s3 sync`)
  2. Terraform apply for XC infra (`volterraedge/volterra` provider)
  3. XC cache purge via REST API (certificate-based auth)
- Terraform state in S3 backend (already configured)
- Secrets: AWS credentials, XC API cert, Azure OpenAI key — all via GitHub Secrets

---

### Step 8 — F5 XC HTTP Load Balancer (replace CloudFront)
- Currently blocked on AWS Support case for CloudFront account verification
- Once unblocked or bypassed: replace CloudFront with F5 XC HTTP Load Balancer
- Benefits: auto-cert, WAF policy, Bot Defense, XC PoP delivery — dogfooding our own pitch
- Terraform: `volterraedge/volterra` provider, XC HTTPS LB resource
- SPA origin: existing S3 bucket with OAC

---

### Ongoing / Parallel (no fixed step)
- **SES sandbox exit** — AWS support request to enable OTP to non-verified addresses; unblocks real user onboarding
- **Multi-pillar dashboard** — aggregate scores across all four pillars on the Dashboard page; currently shows sample data
- **Probe History page** — already stubbed in SPA, wire to real DynamoDB data with pagination, multi-select, bulk archive
- **CloudFront unblock** — AWS Support case pending; needed before Step 8

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
