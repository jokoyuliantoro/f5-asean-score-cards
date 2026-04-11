# F5 ASEAN Application Resilience Score Cards

A presales tool for F5 ASEAN engineers to assess customer application
resilience, surface security gaps, and position F5 Distributed Cloud (XC)
capabilities — before credentials are granted.

---

## What It Does

Run DNS and HTTPS discovery against a customer domain and get a scored,
findings-driven report in under 60 seconds. Results are stored per account
and can be presented directly in a customer meeting as evidence of gaps.

**Discovery pillars (current):**
- **DNS Discovery** — TTL scoring, nameserver redundancy, DNSSEC, CAA, IPv6
- **HTTPS Discovery** — TLS version, cipher, certificate health, HSTS, CSP, HTTP/2

**Coming next:** Surface Discovery, Deep Discovery

---

## Architecture

```
Browser (React SPA)
    |
    |-- Auth: Cognito OTP (email OTP, no passwords)
    |
    +-- API Gateway (JWT auth)
            |-- POST /discovery/dns   --> Lambda --> DynamoDB
            +-- POST /discovery/https --> Lambda --> DynamoDB

Hosted on S3 + CloudFront
Infra managed by Terraform
All resources in ap-southeast-1
```

---

## Repo Structure

```
frontend/                   React/Vite SPA
backend/
  lambda/
    dns_discovery/          Python - DNS checks via dnspython
    https_discovery/        Python - TLS/HTTP checks via stdlib ssl
    auth/                   Python - Cognito OTP custom auth triggers
  terraform/                All infrastructure as code
scripts/
  deploy.sh                 End-to-end deploy from WSL
```

---

## Deploy

### Prerequisites (WSL)

```bash
# AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && sudo ./aws/install

# Terraform
sudo apt install -y terraform

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### First-time setup

```bash
# 1. Configure AWS credentials
aws configure   # use the f5aseanscorecards IAM user keys

# 2. Create Terraform state bucket (once only)
export TF_STATE_BUCKET=f5-scorecard-tfstate-$(aws sts get-caller-identity \
  --query Account --output text)
aws s3 mb s3://$TF_STATE_BUCKET --region ap-southeast-1
echo "export TF_STATE_BUCKET=$TF_STATE_BUCKET" >> ~/.bashrc

# 3. Create terraform.tfvars
cp backend/terraform/terraform.tfvars.example backend/terraform/terraform.tfvars
# Edit ses_from_email and admin_email

# 4. Verify SES sender email
aws ses verify-email-identity \
  --email-address your@email.com --region ap-southeast-1
# Click the verification link in your inbox
```

### Deploy

```bash
cd ~/github/f5-asean-score-cards
./scripts/deploy.sh
```

Subsequent deploys after code changes use the same command.
Terraform only updates what changed.

---

## User Management

Users are managed in Cognito. Login is OTP-only — no passwords.
Only `@f5.com` addresses (or explicitly added personal emails) can log in.

**Add a new user:**

```bash
aws cognito-idp admin-create-user \
  --user-pool-id ap-southeast-1_ApP6AbUqs \
  --username "name@f5.com" \
  --user-attributes \
    Name=email,Value="name@f5.com" \
    Name=email_verified,Value=true \
    Name=custom:role,Value=user \
    Name=custom:display_name,Value="First Last" \
  --message-action SUPPRESS \
  --region ap-southeast-1

aws cognito-idp admin-set-user-password \
  --user-pool-id ap-southeast-1_ApP6AbUqs \
  --username "name@f5.com" \
  --password "Scorecard#2026!" \
  --permanent \
  --region ap-southeast-1
```

**Roles:** `admin` · `user` · `readonly`

---

## Local Development

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
# Uses mock data from src/data/appData.js (no AWS needed)
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| "Discovery" not "Probe" | "Scan" and "probe" trigger security approval friction in customer environments |
| OTP-only auth | No password management overhead; works with any verified email |
| DynamoDB single table | Minimises operational complexity for a low-traffic presales tool |
| Lambda + API Gateway | Zero cost when idle; no servers to manage |
| Terraform for infra | Reproducible, version-controlled, one-command deploy |
| No React Router | Keeps the SPA simple; plain switch in App.jsx is sufficient |

---

## SES Sandbox Note

New AWS accounts start in SES sandbox mode — OTP emails can only be sent
to verified addresses. To send to any `@f5.com` address, submit a
production access request:

```
AWS Console -> SES -> Account dashboard -> Request production access
```

---

## Project Context (for AI-assisted development)

Full technical context for continuing development in a new chat session:

```
https://raw.githubusercontent.com/jokoyuliantoro/f5-asean-score-cards/main/CONTEXT.md
```
