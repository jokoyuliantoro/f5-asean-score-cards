import json
import os
import uuid
import datetime
import boto3
import dns.resolver
import dns.rdatatype
import dns.exception

dynamodb = boto3.resource('dynamodb')

def lambda_handler(event, context):
    method = event.get('requestContext', {}).get('http', {}).get('method', 'POST')

    # ── GET /jobs/{jobId} ─────────────────────────────────────────────────────
    if method == 'GET':
        job_id = event.get('pathParameters', {}).get('jobId')
        if not job_id:
            return _resp(400, {'error': 'jobId path parameter required'})
        return _get_job(job_id)

    # ── POST /discovery/dns ───────────────────────────────────────────────────
    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return _resp(400, {'error': 'Invalid JSON body'})

    domain    = body.get('domain', '').strip().lower()
    account_id = body.get('accountId', 'unknown')
    job_id    = body.get('jobId') or str(uuid.uuid4())

    if not domain:
        return _resp(400, {'error': 'domain is required'})

    findings = _run_dns_discovery(domain)
    _save_result(job_id, account_id, domain, findings)

    return _resp(200, {
        'jobId':     job_id,
        'domain':    domain,
        'pillar':    'dns',
        'status':    'complete',
        'findings':  findings,
        'completedAt': datetime.datetime.utcnow().isoformat() + 'Z',
    })


def _run_dns_discovery(domain):
    findings = {}
    resolver = dns.resolver.Resolver()
    resolver.timeout  = 5
    resolver.lifetime = 10

    # ── A / AAAA ──────────────────────────────────────────────────────────────
    for rtype in ['A', 'AAAA']:
        try:
            ans = resolver.resolve(domain, rtype)
            findings[rtype] = [str(r) for r in ans]
        except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN,
                dns.resolver.NoNameservers, dns.exception.Timeout):
            findings[rtype] = []

    # ── TTL scoring ───────────────────────────────────────────────────────────
    # 300s  = high  (modern standard — fast failover / geo-steering)
    # 3600s = medium
    # >3600 = low   (too slow for resilience)
    try:
        ans = resolver.resolve(domain, 'A')
        ttl = ans.rrset.ttl
        findings['ttl']      = ttl
        findings['ttlScore'] = 'high' if ttl <= 300 else ('medium' if ttl <= 3600 else 'low')
    except Exception:
        findings['ttl']      = None
        findings['ttlScore'] = 'unknown'

    # ── NS records + geo redundancy check ────────────────────────────────────
    try:
        ans = resolver.resolve(domain, 'NS')
        ns_list = sorted([str(r).rstrip('.') for r in ans])
        findings['ns'] = ns_list
        # Simple heuristic: multiple NS from different TLDs = geo redundant
        tlds = set(ns.split('.')[-1] for ns in ns_list)
        findings['nsCount']       = len(ns_list)
        findings['nsGeoRedundant'] = len(ns_list) >= 2
    except Exception:
        findings['ns']             = []
        findings['nsCount']        = 0
        findings['nsGeoRedundant'] = False

    # ── MX ────────────────────────────────────────────────────────────────────
    try:
        ans = resolver.resolve(domain, 'MX')
        findings['mx'] = [str(r) for r in ans]
    except Exception:
        findings['mx'] = []

    # ── CAA ───────────────────────────────────────────────────────────────────
    try:
        ans = resolver.resolve(domain, 'CAA')
        findings['caa']        = [str(r) for r in ans]
        findings['caaPresent'] = True
    except Exception:
        findings['caa']        = []
        findings['caaPresent'] = False

    # ── DNSSEC ────────────────────────────────────────────────────────────────
    try:
        ans = resolver.resolve(domain, 'DNSKEY')
        findings['dnssec'] = len(list(ans)) > 0
    except Exception:
        findings['dnssec'] = False

    # ── SOA (negative TTL / zone info) ────────────────────────────────────────
    try:
        ans = resolver.resolve(domain, 'SOA')
        soa = list(ans)[0]
        findings['soaSerial']  = soa.serial
        findings['soaRefresh'] = soa.refresh
        findings['soaNegTTL']  = soa.minimum
    except Exception:
        findings['soaSerial']  = None
        findings['soaRefresh'] = None
        findings['soaNegTTL']  = None

    # ── Composite score (0–100) ───────────────────────────────────────────────
    findings['score'] = _compute_score(findings)
    findings['issues'] = _derive_issues(domain, findings)

    return findings


def _compute_score(f):
    score = 100

    # TTL
    if   f.get('ttlScore') == 'low':     score -= 20
    elif f.get('ttlScore') == 'medium':  score -= 10
    elif f.get('ttlScore') == 'unknown': score -= 15

    # NS redundancy
    if not f.get('nsGeoRedundant'):      score -= 20

    # DNSSEC
    if not f.get('dnssec'):              score -= 15

    # CAA
    if not f.get('caaPresent'):          score -= 10

    # IPv6
    if not f.get('AAAA'):               score -= 10

    # No A records at all
    if not f.get('A'):                   score -= 25

    return max(0, score)


def _derive_issues(domain, f):
    issues = []

    if not f.get('A'):
        issues.append({
            'id': 'dns-no-a-record', 'severity': 'critical',
            'title': f'No A records found for {domain}',
        })
    ttl = f.get('ttl')
    if ttl and ttl > 3600:
        issues.append({
            'id': 'dns-high-ttl', 'severity': 'high',
            'title': f'TTL is {ttl}s — too slow for failover (target: ≤300s)',
        })
    elif ttl and ttl > 300:
        issues.append({
            'id': 'dns-medium-ttl', 'severity': 'medium',
            'title': f'TTL is {ttl}s — acceptable but not optimised for geo-steering',
        })
    if not f.get('nsGeoRedundant'):
        issues.append({
            'id': 'dns-single-ns', 'severity': 'high',
            'title': 'Only one nameserver detected — no geographic redundancy',
        })
    if not f.get('dnssec'):
        issues.append({
            'id': 'dns-no-dnssec', 'severity': 'medium',
            'title': 'DNSSEC not enabled — DNS spoofing risk',
        })
    if not f.get('caaPresent'):
        issues.append({
            'id': 'dns-no-caa', 'severity': 'low',
            'title': 'No CAA record — any CA can issue certificates for this domain',
        })
    if not f.get('AAAA'):
        issues.append({
            'id': 'dns-no-ipv6', 'severity': 'low',
            'title': 'No IPv6 (AAAA) records — not dual-stack ready',
        })

    return issues


def _save_result(job_id, account_id, domain, findings):
    table = dynamodb.Table(os.environ['TABLE_NAME'])
    now   = datetime.datetime.utcnow().isoformat() + 'Z'
    table.put_item(Item={
        'pk':          f'JOB#{job_id}',
        'sk':          'PILLAR#dns',
        'gsi1pk':      'JOB',
        'jobId':       job_id,
        'accountId':   account_id,
        'domain':      domain,
        'pillar':      'dns',
        'status':      'complete',
        'score':       findings.get('score'),
        'findings':    findings,
        'createdAt':   now,
        'completedAt': now,
    })


def _get_job(job_id):
    table = dynamodb.Table(os.environ['TABLE_NAME'])
    resp  = table.get_item(Key={
        'pk': f'JOB#{job_id}',
        'sk': 'PILLAR#dns',
    })
    item = resp.get('Item')
    if not item:
        return _resp(404, {'error': f'Job {job_id} not found'})
    return _resp(200, item)


def _resp(status, body):
    return {
        'statusCode': status,
        'headers': {
            'Content-Type':                'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        'body': json.dumps(body, default=str),
    }
