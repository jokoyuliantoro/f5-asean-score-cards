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
- Cognito User Pool: `ap-southeast-1_ApP6AbUqs` / Client: `1gnr4oqpj7jfqcdk7s9ljnnceo`
- SES: `joko.yuliantoro@gmail.com` (sandbox — only verified addresses receive email)
- Parameter Store prefix: `/f5-asean/` and `/f5-asean/azure-openai/`
- Terraform state in S3, all infra in `backend/terraform-cloudflare/`

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
      auditLog.js      — postAuditEvent(), fetchAuditEvents() — audit API client
    components/
      App.jsx          — top-level routing switch, idToken state
      DnsPage.jsx      — DNS discovery report (COMPLETE)
      DnsPage.module.css
      DiscoveryProgress.jsx     — floating progress floater (light mode)
      DiscoveryProgress.module.css
      AuditLogPage.jsx          — persistent audit log viewer (COMPLETE)
      AuditLogPage.module.css
      HttpsPage.jsx    — pending rewrite (original stub)
    data/
      appData.js       — scoreColor, fmtTimestamp, SCAN_GROUPS
      auditLog.js      — in-memory store + write-through to DynamoDB
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
    audit/
      handler.py       — persistent audit log Lambda (COMPLETE)
    auth/
      define_auth_challenge.py
      create_auth_challenge.py
      verify_auth_challenge.py
  terraform/
    main.tf, variables.tf, outputs.tf
    lambda.tf          — all Lambda functions + shared IAM role
    api_gateway.tf     — HTTP API v2 routes
    audit.tf           — audit Lambda + POST /audit + GET /audit routes
    analysis_ssm.tf    — Azure OpenAI SSM params + IAM policy extension
    latency_probe.tf   — dual-region probe Lambdas
    s3.tf, cognito.tf, dynamodb.tf

scripts/
  deploy_handlers.sh   — hot-deploy dns_discovery and/or https_discovery handlers
  deploy_audit.sh      — hot-deploy audit Lambda (--infra for first-time Terraform)
  deploy.sh            — full Terraform + frontend deploy
  build.sh             — npm build + inject window.__ENV__ + S3 sync + cache purge
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

## Audit Log — COMPLETE (Step 2 partial)

### What was built
Persistent audit log stored in DynamoDB. All login, logout, and DNS probe events are
recorded permanently and survive across sessions and browser reloads.

**Event types:** `login`, `logout`, `dns_probe_start`, `dns_probe_done`, `dns_probe_error`

### DynamoDB access pattern (single table)
```
pk       = AUDIT#<actor-email>
sk       = <ISO-ts>#<uuid>        — lexicographically sortable, newest-last on read (reversed)
gsi1pk   = AUDIT                  — reuses existing gsi1-entityType-createdAt GSI
createdAt = <ISO-ts>#<uuid>       — same value as sk, used as GSI sort key
```
Admin all-events query uses the existing `gsi1-entityType-createdAt` GSI — no new GSI needed.

### API routes
```
POST /audit   — write one event (any authenticated user)
GET  /audit   — list events (admin: all; others: own only)
```
Both routes use the existing Cognito JWT authorizer.

### Frontend architecture
```
logEvent(type, actor, role, meta, idToken)       — in data/auditLog.js
  → push to in-memory array (instant UI)
  → sessionStorage persist (survives page refresh within session)
  → fire-and-forget POST /audit via api/auditLog.js

loadRemoteEvents(idToken)                        — called by AuditLogPage on mount
  → GET /audit
  → merge with in-memory cache, deduplicate by id
  → historical events from previous sessions appear
```

### Critical: token and actor passing
- **`idToken` is passed explicitly** from App state through to every `logEvent()` call and
  to `AuditLogPage` as a prop. Never read lazily from sessionStorage.
- **`VITE_DEMO_TOKEN` must NOT be used in `api/auditLog.js`** — it is always
  `j.yuliantoro@f5.com`'s token and would mis-attribute all other users' events.
- The **frontend UUID is authoritative**: `logEvent()` generates `id = crypto.randomUUID()`,
  passes it to `postAuditEvent()`, which sends it in the POST body. The Lambda stores
  `body.get("id") or str(uuid.uuid4())`. This ensures the in-memory event and the DynamoDB
  item share the same ID so deduplication in `loadRemoteEvents()` works correctly.
- The **actor email is sent in the POST body** (`{ id, type, actor, role, meta }`) and the
  Lambda uses it as the authoritative source. JWT claim extraction is a fallback only.

### AuditLogPage access matrix
| Role | Sees |
|---|---|
| admin | All events, filter by type + user |
| user | Own events only |
| readonly | Own events only |

### deploy_audit.sh usage
```bash
# First-time infra (creates Lambda + API routes via Terraform)
./scripts/deploy_audit.sh --infra

# Hot-deploy handler only (no Terraform)
./scripts/deploy_audit.sh

# Smoke test
SMOKE_TEST=true ./scripts/deploy_audit.sh
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

**Audit event item:**
```
PK: AUDIT#{actor-email}
SK: <ISO-ts>#<uuid>
gsi1pk: AUDIT
createdAt: <ISO-ts>#<uuid>   (same as SK)
id: <uuid>                   (frontend-generated, used for deduplication)
type: login|logout|dns_probe_start|dns_probe_done|dns_probe_error
actor: email
role: admin|user|readonly
meta: { domain?, score?, error? }
ts: ISO-8601
```

---

## Step 2 — What still needs to be built

### Report save/load (not yet started)

**Report Lambda** (`backend/lambda/report/handler.py`)
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

**DnsPage additions:**
- Saved Reports dropdown at top of DnsPage — lists past saves for current domain
- Wire `Save Report` button to `POST /v1/reports/dns`
- After save: show confirmation, add to dropdown

---

## Key Learnings / Principles

- **"Discovery" not "Probe"** in customer-facing strings; internal code identifiers unchanged
- **"Probe" not "Scan"** — "scan" triggers security approval friction in customer meetings
- **Competitor references:** always generic ("legacy CDN-WAF vendors"), never named
- **Anycast detection:** dual-region TCP probe (SEA + USE1), port 53 for NS IPs, port 443 for app IPs; < 30ms from both = confirmed anycast
- **TTL guidance:** 300s = high score (modern standard); 3600s = low score
- **DynamoDB:** boto3 resource API rejects Python floats — always use `_floats_to_decimal()` before `put_item`
- **Demo token:** auth.js generates `demo.{base64}.signature` — detect with `startsWith('demo.')`, never send to API Gateway
- **VITE_DEMO_TOKEN** is a real Cognito JWT for `j.yuliantoro@f5.com` stored in `.env.local`. It is used by `discovery.js` to authenticate DNS probe calls in demo mode. It must NOT be used in `api/auditLog.js` — doing so attributes all users' audit events to Joko.
- **Cognito client ID:** current value is `1gnr4oqpj7jfqcdk7s9ljnnceo`. Both `get_token.sh` and `build.sh` must use this. If Terraform recreates the Cognito pool, update both scripts.
- **API Gateway ID:** current value is `4j10a2iuk7`. Lambda invoke permissions (`aws lambda add-permission`) must reference this ID in `SourceArn`. If Terraform creates a new API Gateway, update Lambda permissions for all functions.
- **build.sh injects `window.__ENV__`** at deploy time via `sed` into `dist/index.html`. This overrides `VITE_API_BASE_URL` and hardcoded fallbacks — it is the authoritative runtime config. Always update the URL and Cognito client ID in `build.sh` when they change.
- **Print PDF:** App.module.css has `overflow:hidden` on `.shell` — override with `[class*="_shell_"]` in `@media print`
- **CSS Modules:** Vite hashes class names — use `[class*="_shell_"]` substring selectors in `@media print`
- **analysis_dns bundling:** `deploy_handlers.sh` copies `analysis_dns/handler.py` → `dns_discovery/analysis_dns.py` before zipping; clean up temp file after
- **Azure endpoint:** use `/openai/v1/chat/completions` not `/openai/v1/responses` (Responses API uses different payload shape)
- **AI sections display:** plain `<p>` text by default, `<textarea>` only when Edit button clicked — avoids all scrollbar/height issues in print
- **Double-event bug (fixed):** OTP `handleOtpComplete` in LoginPage.jsx needed an `if (isLoading) return` guard. Without it, React StrictMode or rapid keypresses could fire `onAuthenticated` twice.
- **Double-probe bug (fixed):** `handleRun` in DnsPage.jsx needed an `if (isRunning) return` guard at the top to prevent Enter key + button click both firing.

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

# Deploy audit Lambda (handler only, no Terraform)
./scripts/deploy_audit.sh

# First-time audit infra (Terraform + handler)
./scripts/deploy_audit.sh --infra

# Full build + S3 sync + cache purge
./scripts/build.sh

# Terraform apply (infra changes)
cd backend/terraform && terraform apply -auto-approve

# Check Lambda logs (last 10 min)
aws logs tail /aws/lambda/f5-asean-score-cards-dns-discovery-prod \
  --region ap-southeast-1 --since 10m --format short

aws logs tail /aws/lambda/f5-asean-score-cards-audit-prod \
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

# Verify what URL is baked into the live site
curl -s "https://asean-score-cards.f5-adsp.com/" | grep -o '__ENV__[^<;]*'

# Fix stale Lambda invoke permission after API Gateway recreation
aws lambda remove-permission \
  --function-name f5-asean-score-cards-dns-discovery-prod \
  --region ap-southeast-1 --statement-id AllowAPIGatewayDNS
aws lambda add-permission \
  --function-name f5-asean-score-cards-dns-discovery-prod \
  --region ap-southeast-1 --statement-id AllowAPIGatewayDNS \
  --action lambda:InvokeFunction --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:ap-southeast-1:120864355486:4j10a2iuk7/*/*"
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

## AWS Resource IDs (ap-southeast-1)
| Resource | ID / Name |
|---|---|
| API Gateway | `4j10a2iuk7` |
| Cognito User Pool | `ap-southeast-1_ApP6AbUqs` |
| Cognito Client ID | `1gnr4oqpj7jfqcdk7s9ljnnceo` |
| DynamoDB table | `f5-asean-score-cards-prod` |
| S3 SPA bucket | `f5-asean-score-cards-spa-prod-5ecbdcce` |
| Account ID | `120864355486` |

---

## Pending / Known Issues
- HttpsPage: original stub, needs same treatment as DnsPage (Step 3+)
- Report save/load (Step 2): Lambda + DnsPage dropdown not yet built
- GitHub Actions CI/CD: not yet set up
- SES sandbox: only verified addresses receive OTP emails; demo mode bypasses this
