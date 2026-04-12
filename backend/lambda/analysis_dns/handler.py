"""
analysis_dns/handler.py

Generates AI-powered DNS resilience analysis using Azure OpenAI (GPT-4o).
Called inline by dns_discovery/handler.py — NOT exposed as a direct API endpoint.

Config (from Parameter Store, prefix /f5-asean/azure-openai/):
  endpoint    — e.g. https://joko-aifoundry.openai.azure.com/openai/v1/chat/completions
  key         — Azure OpenAI API key
  deployment  — model deployment name, e.g. gpt-4o
"""

import json
import os
import re
import boto3
import urllib.request
import urllib.error
from datetime import datetime, timezone

ssm = boto3.client("ssm", region_name=os.environ.get("AWS_REGION", "ap-southeast-1"))

_cfg_cache = {}

def _get_config():
    """Lazy-load Azure config from Parameter Store (cached per Lambda warm instance)."""
    if _cfg_cache:
        return _cfg_cache
    prefix = "/f5-asean/azure-openai/"
    for key in ("endpoint", "key", "deployment"):
        param = ssm.get_parameter(Name=f"{prefix}{key}", WithDecryption=True)
        _cfg_cache[key] = param["Parameter"]["Value"]
    return _cfg_cache


SYSTEM_PROMPT = """You are an expert application security and resilience analyst working for F5 Networks.
Your audience is a CISO or Head of Infrastructure at a large enterprise in Southeast Asia.
Write in clear, concise business English. Use prose only — no bullet points or numbered lists except
where explicitly instructed. Never name specific competitor vendors; refer to them generically as
"legacy CDN-WAF vendors" or "traditional DNS providers". Always position F5 Distributed Cloud (XC)
as the recommended remediation platform. Be direct and confident. Avoid marketing clichés."""


def _build_user_prompt(findings: dict, issues: list, scores: dict, domain: str) -> str:
    critical = [i for i in issues if i.get("severity") == "critical"]
    high     = [i for i in issues if i.get("severity") == "high"]
    medium   = [i for i in issues if i.get("severity") == "medium"]
    low      = [i for i in issues if i.get("severity") == "low"]

    overall_score = scores.get("overall", 0)

    # Summarise NS vendor names
    ns_vendors = findings.get("nsVendors", [])
    ns_names = ", ".join(set(v.get("name", v.get("sld", "unknown")) for v in ns_vendors)) or "unknown"

    # Format issues for prompt — title + one-line detail, capped at 8 most severe
    top_issues = (critical + high + medium + low)[:8]
    issues_text = "\n".join(
        f"{idx+1}. [{i['severity'].upper()}] {i['title']}: {i.get('detail','')[:200]}"
        for idx, i in enumerate(top_issues)
    )

    return f"""Analyse the following DNS resilience discovery results.

DOMAIN: {domain}
OVERALL SCORE: {overall_score}/100
SEVERITY COUNTS — Critical: {len(critical)}, High: {len(high)}, Medium: {len(medium)}, Low: {len(low)}

KEY FINDINGS:
{issues_text}

TECHNICAL CONTEXT:
- NS Anycast: {findings.get('nsAnycast', 'unknown')} (method: {findings.get('anycastMethod', 'unknown')})
- NS Vendors: {ns_names}
- DNSSEC: {findings.get('dnssecStatus', 'unknown')}
- DNS TTL: {findings.get('ttl', 'unknown')}s
- Health Failover Signal: {findings.get('healthFailoverSignal', 'none')}
- Geo-Steering: {findings.get('geoSteering', {}).get('label', 'unknown')}
- Latency Consistency: {findings.get('latencyConsistency', {}).get('label', 'unknown')}

Generate EXACTLY four sections using these XML tags. Do not include any text outside the tags.

<executive>
3 to 5 sentences in business language. Lead with what the score means for the organisation's
risk posture — frame it in terms of service availability, customer trust, and competitive exposure.
No technical jargon. Suitable for a CISO briefing.
</executive>

<riskassessment>
One paragraph per critical or high severity finding, in plain English. For each finding explain:
what the gap is, what a real-world failure or attack scenario looks like, and who in the business
is affected. Do not exceed 5 paragraphs total.
</riskassessment>

<f5recommendation>
One cohesive paragraph. Explain how F5 Distributed Cloud specifically addresses the gaps found above.
Reference specific F5 XC capabilities where relevant: Global DNS Load Balancing, Anycast PoP network,
DNSSEC signing and validation, AI-powered DDoS mitigation, multi-cloud load balancing.
Use language like "enables", "provides visibility into", "reduces exposure to" — do not promise
specific outcomes or SLA numbers.
</f5recommendation>

<nextsteps>
Exactly 3 action items as short numbered sentences. First item must be a concrete F5 XC
proof-of-value engagement (e.g. live demo, health check workshop, or PoC). Second and third
items should be near-term technical or organisational actions the customer can take.
</nextsteps>"""


def _parse_sections(text: str) -> dict:
    """Extract the four XML-tagged sections from the model response."""
    tags = {
        "executive":       "executive",
        "riskAssessment":  "riskassessment",
        "f5Recommendation":"f5recommendation",
        "nextSteps":       "nextsteps",
    }
    result = {}
    for key, tag in tags.items():
        pattern = rf"<{tag}>(.*?)</{tag}>"
        match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
        result[key] = match.group(1).strip() if match else ""
    return result


def _call_azure_openai(system: str, user: str, cfg: dict) -> tuple[str, dict]:
    """
    Call Azure OpenAI chat completions endpoint.
    Returns (response_text, usage_dict).
    """
    payload = {
        "model": cfg["deployment"],
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        "max_tokens": 1800,
        "temperature": 0.3,
    }

    req = urllib.request.Request(
        cfg["endpoint"],
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "api-key": cfg["key"],
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Azure OpenAI HTTP {e.code}: {err_body[:500]}")

    text  = body["choices"][0]["message"]["content"]
    usage = body.get("usage", {})
    return text, usage


def generate(findings: dict, issues: list, scores: dict, domain: str) -> dict:
    """
    Public entry point — called by dns_discovery handler.
    Returns dict ready to be embedded in the discovery response as `aiAnalysis`.
    """
    try:
        cfg          = _get_config()
        user_prompt  = _build_user_prompt(findings, issues, scores, domain)
        raw_text, usage = _call_azure_openai(SYSTEM_PROMPT, user_prompt, cfg)
        sections     = _parse_sections(raw_text)

        return {
            "status":      "success",
            "sections":    sections,
            "model":       cfg["deployment"],
            "tokensUsed":  usage.get("total_tokens", 0),
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as exc:
        # Never let AI failure break the discovery report
        return {
            "status":      "error",
            "error":       str(exc)[:300],
            "sections":    {
                "executive":        "",
                "riskAssessment":   "",
                "f5Recommendation": "",
                "nextSteps":        "",
            },
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        }


# Lambda handler stub — for direct invocation / testing
def lambda_handler(event, context):
    findings = event.get("findings", {})
    issues   = event.get("issues", [])
    scores   = event.get("scores", {})
    domain   = event.get("domain", "")
    result   = generate(findings, issues, scores, domain)
    return {"statusCode": 200, "body": json.dumps(result)}
