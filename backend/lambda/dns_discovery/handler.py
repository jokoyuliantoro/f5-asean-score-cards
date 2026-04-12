import json
import os
import uuid
import datetime
import socket
import time
import urllib.request
from decimal import Decimal
import boto3
import concurrent.futures
import dns.resolver
import dns.rdatatype
import dns.exception
import analysis_dns  # sibling module in the same Lambda package

# NOTE: lambda_timeout in terraform.tfvars should be >= 30s for this handler.
# Per-NS queries and TCP latency probes run in parallel via ThreadPoolExecutor
# but worst-case (all timeouts) still needs ~15s headroom.

dynamodb = boto3.resource('dynamodb')
lambda_client_sea  = boto3.client('lambda', region_name='ap-southeast-1')
lambda_client_use1 = boto3.client('lambda', region_name='us-east-1')

# Latency probe Lambda ARNs — deployed in two regions for anycast detection.
# Constructed from env vars set by Terraform at deploy time.
_ACCOUNT_ID = boto3.client('sts').get_caller_identity()['Account']     if os.environ.get('AWS_EXECUTION_ENV') else 'unknown'
APP_NAME    = os.environ.get('APP_NAME',    'f5-asean-score-cards')
ENVIRONMENT = os.environ.get('ENVIRONMENT', 'prod')
PROBE_ARN_SEA  = os.environ.get(
    'LATENCY_PROBE_ARN_SEA',
    f'arn:aws:lambda:ap-southeast-1:{_ACCOUNT_ID}:function:{APP_NAME}-latency-probe-{ENVIRONMENT}'
)
PROBE_ARN_USE1 = os.environ.get(
    'LATENCY_PROBE_ARN_USE1',
    f'arn:aws:lambda:us-east-1:{_ACCOUNT_ID}:function:{APP_NAME}-latency-probe-{ENVIRONMENT}'
)

# Anycast thresholds (ms) — from Lambda vantage points
# SEA probe: ap-southeast-1  — "local" if < 30ms
# USE1 probe: us-east-1      — "local" if < 30ms
# If BOTH are local → physically impossible for unicast → anycast confirmed
ANYCAST_LOCAL_MS = 30

LAMBDA_REGION        = os.environ.get('AWS_REGION', 'ap-southeast-1')
RIPE_LOOKUP_TIMEOUT  = 4    # seconds per RIPE stat API call — keep under API GW 29s budget
RIPE_API_BASE        = 'https://stat.ripe.net/data/prefix-overview/data.json?resource='

# ── Latency buckets (ms) ──────────────────────────────────────────────────────
# Measured from Lambda in ap-southeast-1 (Singapore).
# "Local"    = likely SEA PoP or regional cloud node
# "Regional" = APAC but not SEA-local (Tokyo, Sydney, Mumbai range)
# "Distant"  = outside APAC (US, EU, etc.)
LATENCY_LOCAL    = 30    # ms
LATENCY_REGIONAL = 120   # ms

# ── Anycast provider registry ─────────────────────────────────────────────────
NS_PROVIDER_REGISTRY = {
    'awsdns.com':        {'name': 'AWS Route 53',            'anycast': True},
    'awsdns.net':        {'name': 'AWS Route 53',            'anycast': True},
    'awsdns.org':        {'name': 'AWS Route 53',            'anycast': True},
    'awsdns.co.uk':      {'name': 'AWS Route 53',            'anycast': True},
    'cloudflare.com':    {'name': 'Cloudflare DNS',          'anycast': True},
    'ns.cloudflare.com': {'name': 'Cloudflare DNS',          'anycast': True},
    'nsone.net':         {'name': 'NS1 / IBM NS1',           'anycast': True},
    'p-acquia.net':      {'name': 'Acquia DNS',              'anycast': True},
    'ultradns.net':      {'name': 'UltraDNS',                'anycast': True},
    'ultradns.com':      {'name': 'UltraDNS',                'anycast': True},
    'ultradns.org':      {'name': 'UltraDNS',                'anycast': True},
    'ultradns.biz':      {'name': 'UltraDNS',                'anycast': True},
    'dynect.net':        {'name': 'Dyn / Oracle DNS',        'anycast': True},
    'dnsimple.com':      {'name': 'DNSimple',                'anycast': True},
    'googledomains.com': {'name': 'Google Domains DNS',      'anycast': True},
    'google.com':        {'name': 'Google Cloud DNS',        'anycast': True},
    'azure-dns.com':     {'name': 'Azure DNS',               'anycast': True},
    'azure-dns.net':     {'name': 'Azure DNS',               'anycast': True},
    'azure-dns.org':     {'name': 'Azure DNS',               'anycast': True},
    'azure-dns.info':    {'name': 'Azure DNS',               'anycast': True},
    'akamai.com':        {'name': 'Akamai DNS',              'anycast': True},
    'akam.net':          {'name': 'Akamai DNS',              'anycast': True},
    'akamaiedge.net':    {'name': 'Akamai DNS',              'anycast': True},
    'edgesuite.net':     {'name': 'Akamai DNS',              'anycast': True},
    'neustar.biz':       {'name': 'Neustar UltraDNS',        'anycast': True},
    'verisigndns.com':   {'name': 'Verisign DNS',            'anycast': True},
    'markmonitor.com':   {'name': 'MarkMonitor DNS',         'anycast': True},
    'hichina.com':       {'name': 'Alibaba Cloud DNS',       'anycast': True},
    'aliyun.com':        {'name': 'Alibaba Cloud DNS',       'anycast': True},
    'registrar-servers.com': {'name': 'Namecheap DNS',       'anycast': False},
    'name-servers.net':  {'name': 'Generic registrar DNS',   'anycast': False},
    'domaincontrol.com': {'name': 'GoDaddy DNS',             'anycast': False},
    'secureserver.net':  {'name': 'GoDaddy DNS',             'anycast': False},
    'dnsmadeeasy.com':   {'name': 'DNS Made Easy',           'anycast': True},
    'constellix.com':    {'name': 'Constellix DNS',          'anycast': True},
    'cdnetworks.net':    {'name': 'CDNetworks DNS',          'anycast': True},
    'f5clouddns.com':    {'name': 'F5 Distributed Cloud DNS','anycast': True},
    # APAC / SEA
    'dnspod.net':        {'name': 'DNSPod (Tencent Cloud)',  'anycast': True},
    'tencentdns.net':    {'name': 'Tencent Cloud DNS',       'anycast': True},
    'huaweicloud.com':   {'name': 'Huawei Cloud DNS',        'anycast': True},
    'idns.net':          {'name': 'Infoblox DNS',            'anycast': True},
    'myhostadmin.net':   {'name': 'Hosting.com DNS',         'anycast': False},
    'starhub.net.sg':    {'name': 'StarHub DNS',             'anycast': False},
    'singnet.com.sg':    {'name': 'SingNet DNS',             'anycast': False},
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_sld(hostname):
    parts = hostname.rstrip('.').split('.')
    if len(parts) >= 2:
        return '.'.join(parts[-2:])
    return hostname

def _lookup_provider(ns_hostname, apex_domain=None):
    hostname = ns_hostname.rstrip('.').lower()
    parts = hostname.split('.')
    for i in range(len(parts) - 1):
        candidate = '.'.join(parts[i:])
        if candidate in NS_PROVIDER_REGISTRY:
            return NS_PROVIDER_REGISTRY[candidate]
    if apex_domain:
        if _get_sld(hostname) == _get_sld(apex_domain):
            return {'name': f'Self-hosted ({_get_sld(apex_domain)})', 'anycast': None}
    return None

def _get_apex_domain(app_domain):
    """
    Walk up labels until we find the SOA — that's the zone apex.
    www.payments.dbs.com -> dbs.com  (if zone is at dbs.com)
    Falls back to stripping one label if SOA walk fails.
    """
    resolver = dns.resolver.Resolver()
    resolver.timeout  = 3
    resolver.lifetime = 6
    labels = app_domain.rstrip('.').split('.')
    # Start from full domain, walk up (skip TLD-only)
    for i in range(len(labels) - 1):
        candidate = '.'.join(labels[i:])
        try:
            resolver.resolve(candidate, 'SOA')
            return candidate   # first SOA response = zone apex
        except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
            continue           # no SOA here, walk up
        except Exception:
            continue
    # Fallback: strip one label
    if len(labels) >= 2:
        return '.'.join(labels[1:])
    return app_domain

def _make_resolver(nameserver_ip=None, timeout=3):
    r = dns.resolver.Resolver()
    r.timeout  = timeout
    r.lifetime = timeout * 2
    if nameserver_ip:
        r.nameservers = [nameserver_ip]
    return r

def _resolve_ns_ip(ns_hostname):
    """Resolve a nameserver hostname to its first IPv4 address."""
    try:
        r = _make_resolver(timeout=3)
        ans = r.resolve(ns_hostname, 'A')
        return str(list(ans)[0])
    except Exception:
        return None

def _tcp_latency(ip, port=443, timeout=5):
    """
    Measure TCP connect latency to ip:port in milliseconds.
    Returns (ms: float, error: str|None).
    Falls back to port 80 if 443 times out.
    """
    for p in [port, 80]:
        try:
            start = time.perf_counter()
            with socket.create_connection((ip, p), timeout=timeout):
                ms = (time.perf_counter() - start) * 1000
                return round(ms, 1), None
        except socket.timeout:
            continue
        except (ConnectionRefusedError, OSError) as e:
            # Port refused is still a successful TCP probe for latency purposes
            # (the host responded, just not on this port)
            if 'refused' in str(e).lower():
                ms = (time.perf_counter() - start) * 1000
                return round(ms, 1), 'port_refused'
            continue
    return None, 'unreachable'

def _latency_bucket(ms):
    if ms is None:
        return 'unreachable', 'Unreachable'
    if ms < LATENCY_LOCAL:
        return 'local', 'Local PoP'
    if ms < LATENCY_REGIONAL:
        return 'regional', 'Regional'
    return 'distant', 'Distant'

def _subnet24(ip):
    """Return /24 prefix: 1.2.3.4 -> 1.2.3"""
    parts = ip.split('.')
    return '.'.join(parts[:3]) if len(parts) == 4 else ip

def _ripe_lookup(ip):
    """
    Query RIPE stat prefix-overview for ASN and holder name.
    Works across all RIRs (RIPE, ARIN, APNIC, LACNIC, AFRINIC).
    Returns dict with keys: asn (int), asnNumber (str), holder (str), announced (bool).
    Falls back gracefully on any error.
    """
    try:
        url = RIPE_API_BASE + ip
        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'F5-Scorecard-Discovery/1.0 (presales-tool)'},
        )
        with urllib.request.urlopen(req, timeout=RIPE_LOOKUP_TIMEOUT) as resp:
            data = json.loads(resp.read())

        if data.get('status') != 'ok':
            return {'asn': None, 'asnNumber': None, 'holder': 'Unknown', 'announced': False}

        d = data.get('data', {})
        announced = d.get('announced', False)
        asns = d.get('asns', [])

        if not asns:
            return {'asn': None, 'asnNumber': None, 'holder': 'Unknown', 'announced': announced}

        asn_num  = asns[0].get('asn')
        holder   = asns[0].get('holder', 'Unknown')
        # Truncate holder at first " - " for brevity: "AKAMAI-AS - Akamai Technologies" -> "Akamai Technologies"
        if ' - ' in holder:
            holder = holder.split(' - ', 1)[1]

        return {
            'asn':       asn_num,
            'asnNumber': f'AS{asn_num}' if asn_num else None,
            'holder':    holder,
            'announced': announced,
        }
    except Exception:
        return {'asn': None, 'asnNumber': None, 'holder': 'Unknown', 'announced': False}

def _run_ai_analysis(findings: dict, issues: list, scores: dict, domain: str) -> dict:
    """
    Call the AI analysis module. Wrapped so any failure is isolated.
    Returns the aiAnalysis dict (status=success or status=error).
    """
    try:
        return analysis_dns.generate(findings, issues, scores, domain)
    except Exception as exc:
        return {
            "status": "error",
            "error":  str(exc)[:200],
            "sections": {
                "executive":        "",
                "riskAssessment":   "",
                "f5Recommendation": "",
                "nextSteps":        "",
            },
        }

# ── Lambda entry point ────────────────────────────────────────────────────────

def _floats_to_decimal(obj):
    """
    Recursively convert float values to Decimal for DynamoDB compatibility.
    DynamoDB boto3 resource API rejects Python floats — must use Decimal.
    Called only on the findings dict just before put_item.
    """
    if isinstance(obj, float):
        return Decimal(str(obj))   # str() avoids floating-point precision artifacts
    if isinstance(obj, dict):
        return {k: _floats_to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_floats_to_decimal(v) for v in obj]
    return obj


def _invoke_latency_probe(arn, ips, port=443, client=None):
    """
    Invoke the latency probe Lambda in the given region (via ARN).
    client must be a boto3 Lambda client for the same region as the ARN.
    Returns list of {ip, ms, error} dicts, or [] on failure.
    """
    if not ips:
        return []
    if client is None:
        client = lambda_client_sea
    try:
        payload = json.dumps({'ips': ips, 'port': port}).encode()
        resp = client.invoke(
            FunctionName   = arn,
            InvocationType = 'RequestResponse',
            Payload        = payload,
        )
        result = json.loads(resp['Payload'].read())
        if resp.get('FunctionError'):
            return []
        return result.get('results', [])
    except Exception:
        return []


def _assess_anycast_from_probes(sea_results, use1_results):
    """
    Determine anycast status for each IP from two-vantage-point latency results.

    Decision rules (per IP):
      Both SEA and USE1 < ANYCAST_LOCAL_MS  → anycast_confirmed
        (physically impossible for unicast — BGP routing to nearest PoP)
      SEA < ANYCAST_LOCAL_MS, USE1 >= threshold → unicast_sea
        (low latency locally, high from US — single region, no anycast)
      SEA >= threshold, USE1 < ANYCAST_LOCAL_MS → unicast_us
        (high from SEA, low from US — hosted in US)
      Both high                                → unicast_distant
      Either probe failed / unreachable        → probe_failed

    Returns:
      {
        ip: {
          "ms_sea":   float|None,
          "ms_use1":  float|None,
          "anycast":  "confirmed"|"unicast_sea"|"unicast_us"|"unicast_distant"|"probe_failed",
          "label":    str,
        }
      }
    """
    sea_map  = {r['ip']: r for r in sea_results}
    use1_map = {r['ip']: r for r in use1_results}
    all_ips  = list({r['ip'] for r in sea_results + use1_results})

    result = {}
    for ip in all_ips:
        sea  = sea_map.get(ip,  {})
        use1 = use1_map.get(ip, {})
        ms_s = sea.get('ms')
        ms_u = use1.get('ms')

        if ms_s is None or ms_u is None:
            status = 'probe_failed'
            label  = 'Probe inconclusive — one vantage point unreachable'
        elif ms_s < ANYCAST_LOCAL_MS and ms_u < ANYCAST_LOCAL_MS:
            status = 'confirmed'
            label  = f'Anycast confirmed — {ms_s}ms from SEA, {ms_u}ms from US-East'
        elif ms_s < ANYCAST_LOCAL_MS:
            status = 'unicast_sea'
            label  = f'Unicast (SEA-local) — {ms_s}ms from SEA, {ms_u}ms from US-East'
        elif ms_u < ANYCAST_LOCAL_MS:
            status = 'unicast_us'
            label  = f'Unicast (US-hosted) — {ms_s}ms from SEA, {ms_u}ms from US-East'
        else:
            status = 'unicast_distant'
            label  = f'Unicast (distant) — {ms_s}ms from SEA, {ms_u}ms from US-East'

        result[ip] = {
            'ms_sea':  ms_s,
            'ms_use1': ms_u,
            'anycast': status,
            'label':   label,
        }
    return result


def _maybe_promote_to_www(domain):
    """
    If the domain has only one label before the TLD (bare apex like ifastcorp.com),
    check if www.<domain> resolves. If it does, use that as the app domain.
    This matches how users think — they type the brand name, not the DNS zone.

    Examples:
      ifastcorp.com  -> www.ifastcorp.com  (if www resolves)
      ifastcorp.com  -> ifastcorp.com      (if www has no A record)
      www.dbs.com    -> www.dbs.com        (already has subdomain, no change)
      app.dbs.com    -> app.dbs.com        (already has subdomain, no change)
    """
    parts = domain.rstrip('.').split('.')
    # Already has a subdomain (3+ labels) — leave as-is
    if len(parts) >= 3:
        return domain
    # Two labels = bare apex — try www first
    www_domain = f'www.{domain}'
    try:
        r = _make_resolver(timeout=3)
        r.resolve(www_domain, 'A')
        return www_domain   # www resolves — use it
    except Exception:
        return domain        # www doesn't resolve — use apex as-is


def lambda_handler(event, context):
    method = event.get('requestContext', {}).get('http', {}).get('method', 'POST')

    if method == 'GET':
        job_id = (event.get('pathParameters') or {}).get('jobId')
        if not job_id:
            return _resp(400, {'error': 'jobId path parameter required'})
        return _get_job(job_id)

    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return _resp(400, {'error': 'Invalid JSON body'})

    app_domain = body.get('domain', '').strip().lower()
    account_id = body.get('accountId', 'unknown')
    job_id     = body.get('jobId') or str(uuid.uuid4())

    if not app_domain:
        return _resp(400, {'error': 'domain is required'})

    # If user entered a bare apex domain (e.g. "ifastcorp.com" with no subdomain),
    # promote to www.<domain> — users think in app URLs, not zone apexes.
    # We still probe the apex for NS/DNSSEC/CAA, but A record queries run on www.
    app_domain = _maybe_promote_to_www(app_domain)

    findings = _run_dns_discovery(app_domain)
    ai_analysis = _run_ai_analysis(
        findings,
        findings.get('issues', []),
        {'overall': findings.get('score', 0)},
        app_domain,
    )
    _save_result(job_id, account_id, app_domain, findings, ai_analysis)

    return _resp(200, {
        'jobId':       job_id,
        'domain':      app_domain,
        'pillar':      'dns',
        'status':      'complete',
        'findings':    findings,
        'aiAnalysis':  ai_analysis,
        'completedAt': datetime.datetime.utcnow().isoformat() + 'Z',
    })


# ── Core discovery ────────────────────────────────────────────────────────────

def _run_dns_discovery(app_domain):
    # ── Execution time budget (API Gateway hard limit = 29s) ─────────────────
    # SOA walk:          up to  6s  (3s timeout × 2 attempts)
    # Per-NS queries:    up to 12s  (parallel, ThreadPoolExecutor timeout=12)
    # NS IP RIPE lookup: up to  8s  (parallel, timeout=8)
    # Probe+enrich IPs:  up to 15s  (parallel, timeout=15, each probe 4s)
    # DNSSEC/CAA/SOA:    up to  3s
    # Worst case total: ~22s — 7s headroom before API GW kills connection
    # ─────────────────────────────────────────────────────────────────────────
    findings = {}

    # ── Domain context ────────────────────────────────────────────────────────
    apex_domain = _get_apex_domain(app_domain)
    findings['appDomain']  = app_domain
    findings['apexDomain'] = apex_domain

    resolver = _make_resolver(timeout=5)

    # ── A / AAAA (on app domain) ──────────────────────────────────────────────
    for rtype in ['A', 'AAAA']:
        try:
            ans = resolver.resolve(app_domain, rtype)
            findings[rtype] = [str(r) for r in ans]
        except Exception:
            findings[rtype] = []

    # ── TTL (on app domain A record) ──────────────────────────────────────────
    try:
        ans = resolver.resolve(app_domain, 'A')
        ttl = ans.rrset.ttl
        findings['ttl'] = ttl
        findings['ttlScore'] = (
            'high'   if ttl <= 300  else
            'medium' if ttl <= 3600 else
            'low'
        )
    except Exception:
        findings['ttl']      = None
        findings['ttlScore'] = 'unknown'

    # ── NS analysis on apex (multi-vendor, anycast) ───────────────────────────
    ns_list = []
    try:
        ans     = resolver.resolve(apex_domain, 'NS')
        ns_list = sorted([str(r).rstrip('.').lower() for r in ans])
        findings['ns']      = ns_list
        findings['nsCount'] = len(ns_list)

        vendor_map = {}
        for ns in ns_list:
            sld = _get_sld(ns)
            vendor_map[sld] = _lookup_provider(ns, apex_domain)

        unique_slds = list(vendor_map.keys())
        findings['nsVendors'] = [
            {
                'sld':     sld,
                'name':    (vendor_map[sld] or {}).get('name', 'Unknown provider'),
                'anycast': (vendor_map[sld] or {}).get('anycast'),
            }
            for sld in unique_slds
        ]
        findings['nsVendorCount'] = len(unique_slds)
        findings['nsMultiVendor'] = len(unique_slds) >= 2

        anycast_statuses = [(vendor_map[sld] or {}).get('anycast') for sld in unique_slds]
        if all(s is True for s in anycast_statuses):
            findings['nsAnycast'] = 'yes'
        elif any(s is False for s in anycast_statuses):
            findings['nsAnycast'] = 'no'
        else:
            findings['nsAnycast'] = 'unknown'

        findings['nsGeoRedundant'] = findings['nsMultiVendor']

    except Exception:
        findings['ns']             = []
        findings['nsCount']        = 0
        findings['nsVendors']      = []
        findings['nsVendorCount']  = 0
        findings['nsMultiVendor']  = False
        findings['nsGeoRedundant'] = False
        findings['nsAnycast']      = 'unknown'

    # ── Per-NS direct query (parallel) ────────────────────────────────────────
    # Query each NS directly for the app_domain A record.
    # Reveals: geo-steering (different NSes return different IPs),
    #          NS disagreement (inconsistent answers), and
    #          anycast (single IP returned by all NSes).
    default_ips = set(findings.get('A', []))

    def _query_ns_direct(ns_hostname):
        ns_ip = _resolve_ns_ip(ns_hostname)
        if not ns_ip:
            return {
                'ns': ns_hostname, 'nsIp': None,
                'ips': [], 'cname': None,
                'error': 'could not resolve NS hostname',
                'matchesDefault': False,
            }
        try:
            r = _make_resolver(nameserver_ip=ns_ip, timeout=3)

            # First try A record directly
            try:
                ans = r.resolve(app_domain, 'A')
                ips = sorted([str(x) for x in ans])
                return {
                    'ns':             ns_hostname,
                    'nsIp':           ns_ip,
                    'ips':            ips,
                    'cname':          None,
                    'error':          None,
                    'matchesDefault': set(ips) == default_ips,
                }
            except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
                pass

            # A record empty — check if NS returns a CNAME
            # (common with CDN/Akamai: NS returns CNAME to edge hostname,
            #  which resolves in a different zone the NS doesn't authorise)
            try:
                ans   = r.resolve(app_domain, 'CNAME')
                cname = str(list(ans)[0].target).rstrip('.')
                # Fall back to default resolver IPs — we know the domain resolves,
                # the NS just can't follow the CNAME chain past its own zone
                return {
                    'ns':             ns_hostname,
                    'nsIp':           ns_ip,
                    'ips':            list(default_ips),  # use default resolver result
                    'cname':          cname,
                    'error':          None,
                    'matchesDefault': True,  # CNAME path agrees with default
                }
            except Exception:
                pass

            # Neither A nor CNAME — genuinely no answer
            return {
                'ns':             ns_hostname,
                'nsIp':           ns_ip,
                'ips':            [],
                'cname':          None,
                'error':          'no A or CNAME record returned by this NS',
                'matchesDefault': False,
            }

        except Exception as e:
            return {
                'ns':             ns_hostname,
                'nsIp':           ns_ip,
                'ips':            [],
                'cname':          None,
                'error':          str(e),
                'matchesDefault': False,
            }

    per_ns_results = []
    if ns_list:
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
            futures = {ex.submit(_query_ns_direct, ns): ns for ns in ns_list}
            for fut in concurrent.futures.as_completed(futures, timeout=12):
                try:
                    per_ns_results.append(fut.result())
                except Exception:
                    pass

    findings['perNsResults'] = sorted(per_ns_results, key=lambda x: x['ns'])

    # ── Anycast method annotation ─────────────────────────────────────────────
    # "registry-inferred" = based on NS hostname SLD lookup (not ground truth)
    # "looking-glass"     = confirmed via multi-vantage-point ping (agent only)
    findings['anycastMethod'] = 'registry-inferred'

    # ── Enrich nsVendors with actual IP owner from RIPE ───────────────────────
    # The NS hostname owner (e.g. StarHub) may differ from the IP owner
    # (e.g. Akamai) — as seen with ifastcorp.com. Surface both so the
    # frontend can show "StarHub DNS → serving Akamai IPs".
    all_ns_ips = list({r['nsIp'] for r in per_ns_results if r.get('nsIp')})
    ns_ip_ripe = {}
    if all_ns_ips:
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
            ripe_futures = {ex.submit(_ripe_lookup, ip): ip for ip in all_ns_ips}
            for fut in concurrent.futures.as_completed(ripe_futures, timeout=8):
                ip = ripe_futures[fut]
                try:
                    ns_ip_ripe[ip] = fut.result()
                except Exception:
                    ns_ip_ripe[ip] = {'asnNumber': None, 'holder': 'Unknown'}

    # Map nsIp back to each NS result, then annotate nsVendors
    ns_to_ip = {r['ns']: r.get('nsIp') for r in per_ns_results}
    for vendor in findings.get('nsVendors', []):
        # Find the NS IPs belonging to this vendor's SLD
        vendor_sld = vendor.get('sld', '')
        vendor_ns_ips = [
            ns_to_ip[ns] for ns in ns_to_ip
            if ns_to_ip[ns] and _get_sld(ns) == vendor_sld
        ]
        if vendor_ns_ips:
            sample_ip  = vendor_ns_ips[0]
            ripe_info  = ns_ip_ripe.get(sample_ip, {})
            ip_holder  = ripe_info.get('holder', 'Unknown')
            ip_asn     = ripe_info.get('asnNumber')
            vendor['nsIpSample'] = sample_ip
            vendor['ipHolder']   = ip_holder
            vendor['ipAsn']      = ip_asn
            # Note: we intentionally do NOT compare NS IP owner vs A record IP owner.
            # It is normal and expected for the NS server (e.g. F5 XC DNS) to serve
            # answers pointing to IPs owned by a different provider (e.g. AWS).
            # The NS resolves DNS — it does not own the destination.

    # Geo-steering assessment from per-NS results
    successful = [r for r in per_ns_results if r['ips']]
    all_returned_ips = [ip for r in successful for ip in r['ips']]
    unique_returned_ips  = list(set(all_returned_ips))
    unique_returned_subnets = list(set(_subnet24(ip) for ip in unique_returned_ips))

    # Do NSes return different answers depending on which one you ask?
    ns_answer_sets = [frozenset(r['ips']) for r in successful]
    ns_answers_differ = len(set(ns_answer_sets)) > 1

    findings['geoSteering'] = _assess_geo_steering(
        unique_returned_ips, unique_returned_subnets,
        ns_answers_differ, findings.get('nsAnycast', 'unknown')
    )

    # ── Latency context annotation ────────────────────────────────────────────
    findings['latencyContext'] = {
        'source':       'lambda-dual-region',
        'sourceRegion': LAMBDA_REGION,
        'sourceLabel':  f'AWS Lambda (dual-region: {LAMBDA_REGION} + us-east-1)',
        'warning': (
            'Latency measured from two AWS Lambda vantage points (ap-southeast-1 and us-east-1). '
            'If an IP shows low latency from BOTH regions, anycast is confirmed. '
            'For end-user perspective latency, run the F5 Discovery Agent from a user device.'
        ),
        'agentSuggestion': True,
        'agentNote': (
            'For accurate user-perspective latency, run the F5 Discovery Agent '
            'from a device on the customer\'s network or a user\'s laptop/mobile.'
        ),
    }

    # ── Dual-region probes + RIPE enrichment — all run in parallel ────────────
    # Three things run concurrently per unique IP:
    #   1. TCP latency from ap-southeast-1 (local Lambda — direct call)
    #   2. TCP latency from us-east-1      (remote Lambda — cross-region invoke)
    #   3. RIPE ASN lookup                 (HTTP to stat.ripe.net)
    # The cross-region Lambda invoke is batched (one invoke for all IPs) so
    # it adds minimal overhead vs a single-region probe.

    def _probe_sea(ip):
        ms, err = _tcp_latency(ip, 443, 4)
        return ip, ms, err

    def _enrich_ripe(ip):
        return ip, _ripe_lookup(ip)

    ip_info = []
    if unique_returned_ips:
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
            # Kick off SEA probes and RIPE lookups per-IP (parallel)
            sea_futures  = {ex.submit(_probe_sea,    ip): ip for ip in unique_returned_ips}
            ripe_futures = {ex.submit(_enrich_ripe,  ip): ip for ip in unique_returned_ips}
            # Kick off USE1 batch probe in parallel (single Lambda invoke for all IPs)
            use1_future  = ex.submit(_invoke_latency_probe, PROBE_ARN_USE1, unique_returned_ips, 443, lambda_client_use1)

            # Collect SEA results
            sea_map = {}
            for fut in concurrent.futures.as_completed(sea_futures, timeout=12):
                try:
                    ip, ms, err = fut.result()
                    sea_map[ip] = {'ms': ms, 'error': err}
                except Exception:
                    pass

            # Collect RIPE results
            ripe_map = {}
            for fut in concurrent.futures.as_completed(ripe_futures, timeout=12):
                try:
                    ip, info = fut.result()
                    ripe_map[ip] = info
                except Exception:
                    pass

            # Collect USE1 batch result
            try:
                use1_results = use1_future.result(timeout=15)
            except Exception:
                use1_results = []

        # Build per-IP anycast assessment from both vantage points
        use1_sea_results = [{'ip': ip, **sea_map.get(ip, {'ms': None, 'error': 'no result'})}
                            for ip in unique_returned_ips]
        anycast_map = _assess_anycast_from_probes(use1_sea_results, use1_results)

        for ip in unique_returned_ips:
            sea   = sea_map.get(ip, {})
            ripe  = ripe_map.get(ip, {})
            ac    = anycast_map.get(ip, {})
            ms    = sea.get('ms')
            bucket, bucket_label = _latency_bucket(ms)
            ip_info.append({
                'ip':           ip,
                'ms':           ms,                         # SEA latency (ms)
                'ms_use1':      ac.get('ms_use1'),          # US-East latency (ms)
                'bucket':       bucket,                     # SEA bucket for consistency check
                'label':        bucket_label,
                'error':        sea.get('error'),
                # Anycast assessment from dual-region probe
                'anycast':      ac.get('anycast', 'probe_failed'),
                'anycastLabel': ac.get('label', 'Probe inconclusive'),
                # RIPE ASN enrichment
                'asn':          ripe.get('asnNumber'),
                'holder':       ripe.get('holder'),
                'announced':    ripe.get('announced'),
            })

    ip_info.sort(key=lambda x: (x.get('ms') or 9999))
    findings['ipInfo'] = ip_info

    # Derive overall nsAnycast from dual-region probe results on NS IPs
    # (replaces the registry-based inference for known + unknown providers)
    ns_ips = list({r['nsIp'] for r in per_ns_results if r.get('nsIp')})
    if ns_ips:
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
            # Use port 53 for NS IP probes — DNS servers listen on port 53, not 443/80
            sea_ns_futs  = {ex.submit(lambda ip: (ip, *_tcp_latency(ip, 53, 4)), ip): ip for ip in ns_ips}
            use1_ns_fut  = ex.submit(_invoke_latency_probe, PROBE_ARN_USE1, ns_ips, 53, lambda_client_use1)
            sea_ns_map = {}
            for fut in concurrent.futures.as_completed(sea_ns_futs, timeout=10):
                try:
                    result = fut.result()
                    # result is (ip, ms, err) from lambda ip: (ip, *_tcp_latency(...))
                    ip, ms, err = result
                    sea_ns_map[ip] = {'ms': ms, 'error': err}
                except Exception:
                    pass
            try:
                use1_ns_results = use1_ns_fut.result(timeout=12)
            except Exception:
                use1_ns_results = []
        sea_ns_list = [{'ip': ip, **sea_ns_map.get(ip, {'ms': None})} for ip in ns_ips]
        ns_anycast_map = _assess_anycast_from_probes(sea_ns_list, use1_ns_results)
        # Aggregate: if ANY NS IP is confirmed anycast → yes
        #            if ALL are unicast variants → no
        #            otherwise → unknown
        statuses = [v['anycast'] for v in ns_anycast_map.values()]
        if any(s == 'confirmed' for s in statuses):
            findings['nsAnycast']       = 'yes'
            findings['nsAnycastMethod'] = 'dual-region-probe'
        elif all(s.startswith('unicast') for s in statuses):
            findings['nsAnycast']       = 'no'
            findings['nsAnycastMethod'] = 'dual-region-probe'
        elif statuses:
            findings['nsAnycast']       = 'unknown'
            findings['nsAnycastMethod'] = 'dual-region-probe-inconclusive'
        # Store per-NS-IP anycast details for raw data display
        findings['nsIpAnycast'] = {
            ip: ns_anycast_map[ip] for ip in ns_anycast_map
        }
    findings['anycastMethod'] = findings.get('nsAnycastMethod', 'registry-inferred')

    # Latency consistency (based on SEA bucket — user-facing latency context)
    findings['latencyConsistency'] = _assess_latency_consistency(ip_info)
    bucket_counts = {'local': 0, 'regional': 0, 'distant': 0, 'unreachable': 0}
    for r in ip_info:
        bucket_counts[r['bucket']] = bucket_counts.get(r['bucket'], 0) + 1
    findings['latencyBuckets'] = bucket_counts

    # ── DNSSEC on apex ────────────────────────────────────────────────────────
    dnskey_present = False
    ds_present     = False
    try:
        resolver.resolve(apex_domain, 'DNSKEY')
        dnskey_present = True
    except Exception:
        pass
    try:
        resolver.resolve(apex_domain, 'DS')
        ds_present = True
    except Exception:
        pass

    if dnskey_present and ds_present:
        findings['dnssec']       = True
        findings['dnssecStatus'] = 'full'
    elif dnskey_present:
        findings['dnssec']       = False
        findings['dnssecStatus'] = 'partial'
    else:
        findings['dnssec']       = False
        findings['dnssecStatus'] = 'none'

    # ── CAA on apex ───────────────────────────────────────────────────────────
    try:
        ans = resolver.resolve(apex_domain, 'CAA')
        findings['caa']        = [str(r) for r in ans]
        findings['caaPresent'] = True
    except Exception:
        findings['caa']        = []
        findings['caaPresent'] = False

    # ── SOA on apex ───────────────────────────────────────────────────────────
    try:
        ans = resolver.resolve(apex_domain, 'SOA')
        soa = list(ans)[0]
        findings['soaSerial']  = soa.serial
        findings['soaRefresh'] = soa.refresh
        findings['soaNegTTL']  = soa.minimum
    except Exception:
        findings['soaSerial']  = None
        findings['soaRefresh'] = None
        findings['soaNegTTL']  = None

    # ── Health-check failover signal ──────────────────────────────────────────
    a_records = findings.get('A', [])
    ns_anycast = findings.get('nsAnycast', 'unknown')
    if len(a_records) == 0:
        findings['healthFailoverSignal'] = 'none'
    elif len(a_records) == 1 and ns_anycast == 'yes':
        findings['healthFailoverSignal'] = 'anycast'   # single IP but anycast OK
    elif len(a_records) == 1:
        findings['healthFailoverSignal'] = 'poor'
    elif len(set(_subnet24(ip) for ip in a_records)) == 1:
        findings['healthFailoverSignal'] = 'roundrobin'  # multiple IPs, same subnet
    else:
        findings['healthFailoverSignal'] = 'geo-distributed'  # multiple subnets

    # ── Score + issues ────────────────────────────────────────────────────────
    findings['score']  = _compute_score(findings)
    findings['issues'] = _derive_issues(app_domain, apex_domain, findings)

    return findings


# ── Geo-steering assessment ───────────────────────────────────────────────────

def _assess_geo_steering(unique_ips, unique_subnets, ns_answers_differ, ns_anycast):
    """
    Returns a geo-steering assessment dict.

    Key insight: anycast delivers geo-steering at the network layer (BGP routing),
    so a single IP returned by all NSes is fine if the NS provider uses anycast.
    Multiple IPs only make sense for unicast geo-steering (DNS does the work).
    """
    if ns_anycast == 'yes':
        if len(unique_ips) == 1:
            return {
                'status': 'anycast',
                'label':  'Anycast — geo-routing handled at network layer',
                'detail': (
                    'A single IP is returned by all nameservers. '
                    'Because the DNS infrastructure uses a confirmed anycast network, '
                    'traffic is routed to the nearest PoP automatically via BGP — '
                    'DNS-level geo-steering is not required.'
                ),
            }
        else:
            return {
                'status': 'anycast-plus-dns',
                'label':  'Anycast network + DNS geo-steering',
                'detail': (
                    'Multiple IPs returned across nameservers, all served via an anycast network. '
                    'Both BGP-level and DNS-level geo-distribution are active — optimal resilience.'
                ),
            }

    # Unicast path
    if ns_answers_differ:
        return {
            'status': 'dns-geo-steering-active',
            'label':  'DNS geo-steering active — NSes return different IPs by region',
            'detail': (
                'Different nameservers return different IPs for the same query, '
                'indicating DNS-level geo-steering is configured. '
                'Users are directed to the nearest endpoint based on their DNS resolver location.'
            ),
        }
    if len(unique_subnets) > 1:
        return {
            'status': 'dns-multi-ip',
            'label':  'Multiple IPs across different subnets — basic geo-distribution',
            'detail': (
                'Multiple IPs from different network blocks are returned. '
                'This provides basic geographic distribution but without health-check awareness. '
                'Failed endpoints remain in rotation until manually removed.'
            ),
        }
    if len(unique_ips) > 1:
        return {
            'status': 'roundrobin',
            'label':  'Round-robin only — multiple IPs in same subnet, no geo-steering',
            'detail': (
                'Multiple IPs are returned but all belong to the same network block, '
                'suggesting they are in the same datacenter. '
                'This is round-robin load balancing, not geographic distribution. '
                'A single datacenter failure takes down all endpoints simultaneously.'
            ),
        }
    # Single unicast IP, no anycast
    return {
        'status': 'no-geo-steering',
        'label':  'No geo-steering — single unicast IP, all users hit the same endpoint',
        'detail': (
            'All nameservers return a single IP with no anycast distribution. '
            'Every user worldwide is directed to the same physical endpoint regardless of location. '
            'There is no geographic failover — if this IP goes down, the application is unavailable globally.'
        ),
    }


# ── Latency consistency assessment ───────────────────────────────────────────

def _assess_latency_consistency(ip_latency):
    if not ip_latency:
        return {'status': 'unknown', 'label': 'No IPs to measure'}

    buckets = [r['bucket'] for r in ip_latency]
    unreachable = [r for r in ip_latency if r['bucket'] == 'unreachable']

    if unreachable:
        return {
            'status': 'critical',
            'label':  'One or more IPs unreachable',
            'detail': (
                f'{len(unreachable)} of {len(ip_latency)} IP(s) did not respond to TCP probes. '
                'These IPs are in DNS but returning no traffic — users hitting these IPs '
                'will experience connection failures.'
            ),
        }

    unique_buckets = set(buckets)
    if len(unique_buckets) == 1:
        bucket = buckets[0]
        label_map = {
            'local':    'Consistent — all endpoints are local to Southeast Asia',
            'regional': 'Consistent — all endpoints are regional (APAC)',
            'distant':  'Consistent but distant — all endpoints are outside APAC',
        }
        return {
            'status': f'consistent-{bucket}',
            'label':  label_map.get(bucket, f'Consistent ({bucket})'),
            'detail': (
                f'All {len(ip_latency)} IP(s) responded from the same latency tier. '
                'DNS is directing traffic consistently. '
                '(Note: measured from AWS Lambda in ap-southeast-1 — '
                'run the Discovery Agent for user-perspective latency.)'
            ),
        }

    # Mixed buckets
    has_distant = 'distant' in unique_buckets
    has_local   = 'local'   in unique_buckets
    if has_local and has_distant:
        return {
            'status': 'inconsistent-critical',
            'label':  'Inconsistent — mix of local and distant endpoints',
            'detail': (
                'DNS is returning a mix of nearby and far-away IPs. '
                'Some users will get fast local responses while others are routed '
                'to distant endpoints — likely a geo-steering misconfiguration or '
                'stale records from a migration. '
                'Users hitting distant IPs may experience significantly higher latency.'
            ),
        }
    return {
        'status': 'inconsistent-minor',
        'label':  'Minor inconsistency — mix of local and regional endpoints',
        'detail': (
            'DNS is returning IPs across local and regional latency tiers. '
            'This is acceptable if intentional (e.g. overflow to regional PoPs) '
            'but may indicate incomplete geo-steering coverage.'
        ),
    }


# ── Scoring ───────────────────────────────────────────────────────────────────

def _compute_score(f):
    score = 100

    if not f.get('A'):
        score -= 25

    if not f.get('nsMultiVendor'):
        score -= 20

    anycast = f.get('nsAnycast')
    if anycast == 'no':
        score -= 15
    elif anycast == 'unknown':
        score -= 8

    ttl_score = f.get('ttlScore')
    if   ttl_score == 'low':     score -= 15
    elif ttl_score == 'medium':  score -= 8
    elif ttl_score == 'unknown': score -= 10

    # Geo-steering
    gs = (f.get('geoSteering') or {}).get('status', '')
    if gs == 'no-geo-steering':    score -= 15
    elif gs == 'roundrobin':       score -= 8

    # Latency consistency
    lc = (f.get('latencyConsistency') or {}).get('status', '')
    if lc == 'critical':               score -= 15
    elif lc == 'inconsistent-critical': score -= 12
    elif lc == 'inconsistent-minor':    score -= 5
    elif 'distant' in lc:              score -= 8

    dnssec_status = f.get('dnssecStatus', 'none')
    if   dnssec_status == 'none':    score -= 10
    elif dnssec_status == 'partial': score -= 5

    ns_count = f.get('nsCount', 0)
    if   ns_count == 0: score -= 10
    elif ns_count < 4:  score -= 5

    hf = f.get('healthFailoverSignal')
    if   hf in ('none', 'poor'): score -= 8
    elif hf == 'roundrobin':     score -= 4

    if not f.get('caaPresent'): score -= 5
    if not f.get('AAAA'):       score -= 5

    return max(0, score)


# ── Issue derivation ──────────────────────────────────────────────────────────

LAMBDA_LATENCY_NOTE = (
    '\n\nNote: latency measured from AWS Lambda in ap-southeast-1. '
    'Run the F5 Discovery Agent from a user device for accurate end-user perspective.'
)

def _derive_issues(app_domain, apex_domain, f):
    issues = []

    # ── No A records ──────────────────────────────────────────────────────────
    if not f.get('A'):
        issues.append({
            'id': 'dns-no-a-record', 'severity': 'critical',
            'title': f'No A records found for {app_domain}',
            'detail': 'The domain does not resolve — unreachable to users and monitoring systems.',
            'xcRemediation': None,
        })

    # ── Unreachable IPs ───────────────────────────────────────────────────────
    unreachable_ips = [r['ip'] for r in f.get('ipInfo', []) if r['bucket'] == 'unreachable']
    if unreachable_ips:
        issues.append({
            'id': 'dns-unreachable-ip', 'severity': 'critical',
            'title': f'{len(unreachable_ips)} IP(s) in DNS are unreachable',
            'detail': (
                f'The following IPs are returned by DNS but did not respond to TCP probes: '
                f'{", ".join(unreachable_ips)}. '
                f'Users resolved to these IPs will experience connection failures. '
                f'These are likely stale records from decommissioned servers.'
                + LAMBDA_LATENCY_NOTE
            ),
            'xcRemediation': (
                'F5 Distributed Cloud DNS with built-in health monitoring automatically '
                'removes unreachable IPs from DNS responses — preventing users from '
                'being directed to dead endpoints.'
            ),
        })

    # ── Single DNS vendor / self-hosted ───────────────────────────────────────
    if not f.get('nsMultiVendor'):
        vendors    = f.get('nsVendors', [])
        vname      = vendors[0]['name'] if vendors else 'a single provider'
        is_selfhost = vname.startswith('Self-hosted')
        if is_selfhost:
            title  = f'Self-hosted nameservers ({vname}) — no external DNS redundancy'
            detail = (
                'All nameservers are on the organisation\'s own infrastructure. '
                'A network outage, DDoS attack, or infrastructure failure takes down '
                'DNS alongside the application — there is no independent provider to '
                'maintain resolution during an incident.'
            )
        else:
            title  = f'All nameservers with one vendor ({vname}) — single point of failure'
            detail = (
                'A single DNS provider is a single point of failure. '
                'Provider outages have caused widespread internet disruptions globally. '
                'Industry best practice requires nameservers from at least two independent vendors.'
            )
        issues.append({
            'id': 'dns-single-vendor', 'severity': 'critical',
            'title': title, 'detail': detail,
            'xcRemediation': (
                'F5 Distributed Cloud DNS serves as secondary authoritative DNS alongside '
                'your existing provider — instant multi-vendor resilience with zero-touch '
                'automatic failover and built-in anycast DDoS protection.'
            ),
        })

    # ── Anycast ───────────────────────────────────────────────────────────────
    anycast = f.get('nsAnycast')
    if anycast == 'no':
        issues.append({
            'id': 'dns-unicast-ns', 'severity': 'high',
            'title': 'Nameservers use unicast — no DDoS absorption capacity',
            'detail': (
                'Unicast nameservers have fixed IPs with no geographic distribution. '
                'A volumetric DDoS attack targets those IPs directly — '
                'there is no network-layer mechanism to absorb or distribute the traffic.'
            ),
            'xcRemediation': (
                'F5 Distributed Cloud DNS is built on a global anycast network. '
                'DDoS traffic is absorbed at the nearest PoP — your DNS infrastructure '
                'is never directly exposed.'
            ),
        })
    elif anycast == 'unknown':
        vendors    = f.get('nsVendors', [])
        is_selfhost = any(v.get('name', '').startswith('Self-hosted') for v in vendors)
        issues.append({
            'id': 'dns-anycast-unknown', 'severity': 'medium',
            'title': (
                'Self-hosted nameservers have no anycast DDoS protection'
                if is_selfhost else
                'Anycast status of nameservers could not be confirmed'
            ),
            'detail': (
                'Self-hosted DNS uses unicast addressing — each nameserver has a single '
                'fixed IP with no geographic absorption of DDoS traffic.'
                if is_selfhost else
                'One or more nameserver providers are unrecognised. '
                'Verify with your DNS provider whether anycast is included in your service tier.'
            ),
            'xcRemediation': (
                'F5 Distributed Cloud DNS provides confirmed global anycast coverage '
                'across PoPs in every major region including Southeast Asia.'
            ),
        })

    # ── Geo-steering ──────────────────────────────────────────────────────────
    gs = f.get('geoSteering') or {}
    gs_status = gs.get('status', '')
    if gs_status == 'no-geo-steering':
        issues.append({
            'id': 'dns-no-geo-steering', 'severity': 'high',
            'title': 'No geo-steering — all users directed to a single unicast endpoint',
            'detail': gs.get('detail', ''),
            'xcRemediation': (
                'F5 Distributed Cloud DNS provides geo-steering and latency-based routing — '
                'directing users to the nearest healthy endpoint automatically. '
                'Combined with health monitoring, failed endpoints are removed from DNS '
                'within seconds without manual intervention.'
            ),
        })
    elif gs_status == 'roundrobin':
        issues.append({
            'id': 'dns-roundrobin-only', 'severity': 'medium',
            'title': 'Round-robin DNS only — multiple IPs in same datacenter, no geo-distribution',
            'detail': gs.get('detail', ''),
            'xcRemediation': (
                'F5 Distributed Cloud DNS geo-steering distributes traffic across '
                'geographically separate endpoints — not just within a single datacenter.'
            ),
        })

    # ── Latency consistency ───────────────────────────────────────────────────
    lc = f.get('latencyConsistency') or {}
    lc_status = lc.get('status', '')
    if lc_status == 'inconsistent-critical':
        issues.append({
            'id': 'dns-latency-inconsistent', 'severity': 'high',
            'title': 'Latency inconsistency — DNS returning mix of local and distant endpoints',
            'detail': (lc.get('detail', '') + LAMBDA_LATENCY_NOTE),
            'xcRemediation': (
                'F5 Distributed Cloud DNS geo-steering with health monitoring ensures '
                'users are always directed to the nearest responsive endpoint — '
                'eliminating the mix of local and distant IP assignments.'
            ),
        })
    elif lc_status == 'consistent-distant':
        issues.append({
            'id': 'dns-latency-all-distant', 'severity': 'high',
            'title': 'All endpoints are distant from Southeast Asia — high latency for regional users',
            'detail': (
                'All IPs returned by DNS are geographically distant from Southeast Asia. '
                'Users in SG, MY, ID, PH, TH will experience elevated latency for every request.'
                + LAMBDA_LATENCY_NOTE
            ),
            'xcRemediation': (
                'F5 Distributed Cloud has PoPs across Southeast Asia. '
                'XC DNS + HTTP Load Balancer can serve traffic from the nearest regional PoP '
                'without requiring changes to origin infrastructure.'
            ),
        })
    elif lc_status == 'inconsistent-minor':
        issues.append({
            'id': 'dns-latency-inconsistent-minor', 'severity': 'medium',
            'title': 'Minor latency inconsistency — mix of local and regional endpoints',
            'detail': (lc.get('detail', '') + LAMBDA_LATENCY_NOTE),
            'xcRemediation': None,
        })

    # ── NS disagreement ───────────────────────────────────────────────────────
    per_ns = f.get('perNsResults', [])
    disagreeing = [r['ns'] for r in per_ns if r['ips'] and not r['matchesDefault']]
    if disagreeing and gs_status not in ('dns-geo-steering-active', 'anycast', 'anycast-plus-dns'):
        issues.append({
            'id': 'dns-ns-disagreement', 'severity': 'medium',
            'title': f'{len(disagreeing)} nameserver(s) return different IPs than the default resolver',
            'detail': (
                f'Nameservers {", ".join(disagreeing)} returned IP sets that differ from '
                f'the default resolver response. This may indicate split-horizon DNS, '
                f'a partially-completed migration, or misconfigured zone data.'
            ),
            'xcRemediation': None,
        })

    # ── TTL ───────────────────────────────────────────────────────────────────
    ttl = f.get('ttl')
    ttl_score = f.get('ttlScore')
    if ttl_score == 'low' and ttl:
        issues.append({
            'id': 'dns-high-ttl', 'severity': 'high',
            'title': f'TTL is {ttl}s — too slow for health-check failover',
            'detail': (
                f'At {ttl}s TTL, DNS changes take up to {ttl // 60} minutes to propagate. '
                'Health-check-based failover and geo-steering are effectively disabled — '
                'failed endpoints stay cached for the full TTL. Modern standard is ≤300s.'
            ),
            'xcRemediation': (
                'F5 Distributed Cloud DNS manages low-TTL zones at scale. '
                'XC DNS health monitoring combined with TTL ≤300s enables '
                'sub-minute failover without operational overhead.'
            ),
        })
    elif ttl_score == 'medium' and ttl:
        issues.append({
            'id': 'dns-medium-ttl', 'severity': 'medium',
            'title': f'TTL is {ttl}s — suboptimal for geo-steering agility',
            'detail': (
                f'TTL of {ttl}s is acceptable but slows failover response. '
                'Target ≤300s for cloud-era resilience.'
            ),
            'xcRemediation': (
                'F5 Distributed Cloud DNS geo-steering and health-check failover '
                'are most effective at TTL ≤300s.'
            ),
        })

    # ── DNSSEC ────────────────────────────────────────────────────────────────
    dnssec_status = f.get('dnssecStatus', 'none')
    if dnssec_status == 'none':
        issues.append({
            'id': 'dns-no-dnssec', 'severity': 'medium',
            'title': 'DNSSEC not enabled — DNS cache poisoning risk',
            'detail': (
                'Without DNSSEC, DNS responses can be spoofed or poisoned in transit, '
                'redirecting users to attacker-controlled servers without detection.'
            ),
            'xcRemediation': (
                'F5 Distributed Cloud DNS supports DNSSEC with automated key signing, '
                'rotation, and DS record publishing — removing the operational complexity '
                'that causes most organisations to defer DNSSEC.'
            ),
        })
    elif dnssec_status == 'partial':
        issues.append({
            'id': 'dns-dnssec-partial', 'severity': 'medium',
            'title': 'DNSSEC incomplete — DNSKEY present but DS record missing in parent zone',
            'detail': (
                'DNSSEC keys exist but the chain of trust is broken at the parent zone. '
                'Resolvers cannot validate responses — DNSSEC protection is not active.'
            ),
            'xcRemediation': (
                'F5 Distributed Cloud DNS automates DS record publication in the parent zone '
                'to ensure the full DNSSEC chain of trust is always maintained.'
            ),
        })

    # ── NS count ──────────────────────────────────────────────────────────────
    ns_count = f.get('nsCount', 0)
    if 0 < ns_count < 4:
        issues.append({
            'id': 'dns-low-ns-count', 'severity': 'medium',
            'title': f'Only {ns_count} nameserver(s) — below the recommended minimum of 4',
            'detail': (
                f'{ns_count} nameserver(s) detected. Losing one significantly reduces resilience. '
                'Production domains should have ≥4 nameservers across multiple regions.'
            ),
            'xcRemediation': (
                'F5 Distributed Cloud DNS automatically provisions zones across its global '
                'PoP network — customers get many nameservers spanning multiple continents.'
            ),
        })

    # ── Health-check failover ─────────────────────────────────────────────────
    hf = f.get('healthFailoverSignal')
    detail_map = {
        'poor': (
            'A single static IP with no anycast means there is no DNS-level failover. '
            'If the origin goes down, users see failures until an operator manually updates DNS.'
        ),
        'roundrobin': (
            'Multiple IPs in the same subnet suggest round-robin load balancing, not '
            'health-aware failover. Failed backends stay in rotation until manually removed.'
        ),
    }
    if hf in detail_map:
        issues.append({
            'id': 'dns-no-health-failover', 'severity': 'medium',
            'title': 'No health-check-aware DNS failover detected',
            'detail': detail_map[hf],
            'xcRemediation': (
                'F5 Distributed Cloud DNS includes built-in endpoint health monitoring. '
                'Unhealthy IPs are removed from DNS responses in seconds — '
                'combining DNS authority and health intelligence on one platform.'
            ),
        })

    # ── CAA ───────────────────────────────────────────────────────────────────
    if not f.get('caaPresent'):
        issues.append({
            'id': 'dns-no-caa', 'severity': 'low',
            'title': 'No CAA record — any CA can issue certificates for this domain',
            'detail': (
                'Without CAA, any trusted certificate authority can issue TLS certs for '
                f'{apex_domain}. Misissued certificates have been exploited in targeted attacks.'
            ),
            'xcRemediation': None,
        })

    # ── IPv6 ──────────────────────────────────────────────────────────────────
    if not f.get('AAAA'):
        issues.append({
            'id': 'dns-no-ipv6', 'severity': 'low',
            'title': 'No AAAA records — not dual-stack (IPv6) ready',
            'detail': (
                'IPv6 adoption exceeds 40% globally and is higher in mobile-first SEA markets. '
                'Dual-stack is increasingly a baseline requirement.'
            ),
            'xcRemediation': (
                'F5 Distributed Cloud DNS and the XC global network are fully dual-stack — '
                'enabling IPv6 delivery without changes to origin infrastructure.'
            ),
        })

    return issues


# ── Persistence ───────────────────────────────────────────────────────────────

def _save_result(job_id, account_id, domain, findings, ai_analysis=None):
    table = dynamodb.Table(os.environ['TABLE_NAME'])
    now   = datetime.datetime.utcnow().isoformat() + 'Z'
    item  = {
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
    }
    if ai_analysis:
        item['aiAnalysis'] = ai_analysis
    table.put_item(Item=_floats_to_decimal(item))

def _get_job(job_id):
    table = dynamodb.Table(os.environ['TABLE_NAME'])
    resp  = table.get_item(Key={'pk': f'JOB#{job_id}', 'sk': 'PILLAR#dns'})
    item  = resp.get('Item')
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
