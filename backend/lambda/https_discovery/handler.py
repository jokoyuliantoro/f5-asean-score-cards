import json
import os
import uuid
import datetime
import ssl
import socket
import urllib.request
import urllib.error
import boto3

dynamodb = boto3.resource('dynamodb')

def lambda_handler(event, context):
    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return _resp(400, {'error': 'Invalid JSON body'})

    domain     = body.get('domain', '').strip().lower()
    account_id = body.get('accountId', 'unknown')
    job_id     = body.get('jobId') or str(uuid.uuid4())

    if not domain:
        return _resp(400, {'error': 'domain is required'})

    findings = _run_https_discovery(domain)
    _save_result(job_id, account_id, domain, findings)

    return _resp(200, {
        'jobId':       job_id,
        'domain':      domain,
        'pillar':      'https',
        'status':      'complete',
        'findings':    findings,
        'completedAt': datetime.datetime.utcnow().isoformat() + 'Z',
    })


def _run_https_discovery(domain):
    findings = {}

    # ── TLS handshake ─────────────────────────────────────────────────────────
    ctx = ssl.create_default_context()
    ctx.set_alpn_protocols(['h2', 'http/1.1'])
    ctx.check_hostname = True
    ctx.verify_mode    = ssl.CERT_REQUIRED

    try:
        with socket.create_connection((domain, 443), timeout=10) as raw:
            with ctx.wrap_socket(raw, server_hostname=domain) as tls:
                findings['tlsVersion']  = tls.version()          # 'TLSv1.3'
                cipher = tls.cipher()
                findings['cipher']      = cipher[0] if cipher else None
                findings['alpn']        = tls.selected_alpn_protocol()
                findings['httpVersion'] = 'HTTP/2' if findings['alpn'] == 'h2' else 'HTTP/1.1'

                cert = tls.getpeercert()
                findings['certSubject'] = _flatten_cert_field(cert.get('subject', []))
                findings['certIssuer']  = _flatten_cert_field(cert.get('issuer', []))
                findings['certExpiry']  = cert.get('notAfter')
                findings['certSANs']    = [v for t, v in cert.get('subjectAltName', []) if t == 'DNS']
                findings['certExpired'] = _is_expired(cert.get('notAfter'))
                findings['certDaysLeft']= _days_until_expiry(cert.get('notAfter'))
                findings['tlsError']    = None

    except ssl.SSLCertVerificationError as e:
        findings['tlsError']  = f'Certificate verification failed: {e.reason}'
        findings['tlsVersion'] = None
    except ssl.SSLError as e:
        findings['tlsError']  = f'TLS error: {str(e)}'
        findings['tlsVersion'] = None
    except (socket.timeout, ConnectionRefusedError, OSError) as e:
        findings['tlsError']  = f'Connection failed: {str(e)}'
        findings['tlsVersion'] = None

    # ── TLS version scoring ───────────────────────────────────────────────────
    tls = findings.get('tlsVersion')
    if   tls == 'TLSv1.3': findings['tlsScore'] = 'high'
    elif tls == 'TLSv1.2': findings['tlsScore'] = 'medium'
    elif tls is None:       findings['tlsScore'] = 'unknown'
    else:                   findings['tlsScore'] = 'low'   # 1.0 or 1.1

    # ── HTTP headers (HSTS, CSP, etc.) ───────────────────────────────────────
    try:
        req = urllib.request.Request(
            f'https://{domain}',
            headers={'User-Agent': 'F5-Scorecard-Discovery/1.0'},
            method='HEAD',
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            headers = {k.lower(): v for k, v in resp.headers.items()}
            findings['hsts']              = headers.get('strict-transport-security')
            findings['hstsPresent']       = 'strict-transport-security' in headers
            findings['csp']               = headers.get('content-security-policy')
            findings['cspPresent']        = 'content-security-policy' in headers
            findings['xFrameOptions']     = headers.get('x-frame-options')
            findings['xContentTypeOpts']  = headers.get('x-content-type-options')
            findings['referrerPolicy']    = headers.get('referrer-policy')
            findings['server']            = headers.get('server')
            findings['httpStatusCode']    = resp.status
            findings['headerError']       = None
    except urllib.error.HTTPError as e:
        findings['httpStatusCode'] = e.code
        findings['headerError']    = f'HTTP {e.code}'
    except Exception as e:
        findings['headerError']    = str(e)

    # ── HTTP → HTTPS redirect check ───────────────────────────────────────────
    try:
        req = urllib.request.Request(
            f'http://{domain}',
            headers={'User-Agent': 'F5-Scorecard-Discovery/1.0'},
            method='HEAD',
        )
        # Don't follow redirects — check if it IS a redirect
        opener = urllib.request.build_opener(urllib.request.HTTPRedirectHandler())
        # Use a simple socket check instead
        with socket.create_connection((domain, 80), timeout=5):
            findings['port80Open'] = True
        # Actually try the request
        try:
            urllib.request.urlopen(req, timeout=5)
            findings['httpRedirectsToHttps'] = False  # Didn't redirect
        except urllib.error.HTTPError as e:
            findings['httpRedirectsToHttps'] = e.headers.get('location', '').startswith('https')
        except Exception:
            findings['httpRedirectsToHttps'] = False
    except Exception:
        findings['port80Open']           = False
        findings['httpRedirectsToHttps'] = False

    # ── Composite score and issues ────────────────────────────────────────────
    findings['score']  = _compute_score(findings)
    findings['issues'] = _derive_issues(domain, findings)

    return findings


def _compute_score(f):
    score = 100

    tls = f.get('tlsScore')
    if   tls == 'low':     score -= 30
    elif tls == 'medium':  score -= 10
    elif tls == 'unknown': score -= 30

    if not f.get('hstsPresent'):             score -= 15
    if not f.get('cspPresent'):              score -= 10
    if f.get('certExpired'):                 score -= 30
    days = f.get('certDaysLeft')
    if days is not None and days < 30:       score -= 20
    elif days is not None and days < 14:     score -= 30
    if not f.get('httpRedirectsToHttps') and f.get('port80Open'):
        score -= 10
    if f.get('httpVersion') != 'HTTP/2':     score -= 5

    return max(0, score)


def _derive_issues(domain, f):
    issues = []

    tls = f.get('tlsVersion')
    if f.get('tlsError'):
        issues.append({'id': 'https-tls-error', 'severity': 'critical',
                       'title': f'TLS connection failed: {f["tlsError"]}'})
    elif tls in ('TLSv1.0', 'TLSv1.1'):
        issues.append({'id': 'https-legacy-tls', 'severity': 'critical',
                       'title': f'Legacy {tls} accepted — deprecated and insecure'})
    elif tls == 'TLSv1.2':
        issues.append({'id': 'https-no-tls13', 'severity': 'medium',
                       'title': 'TLS 1.3 not negotiated — upgrade recommended'})

    if f.get('certExpired'):
        issues.append({'id': 'https-cert-expired', 'severity': 'critical',
                       'title': 'TLS certificate has expired'})
    elif (f.get('certDaysLeft') or 999) < 30:
        issues.append({'id': 'https-cert-expiring', 'severity': 'high',
                       'title': f'Certificate expires in {f["certDaysLeft"]} days — renew immediately'})

    if not f.get('hstsPresent'):
        issues.append({'id': 'https-no-hsts', 'severity': 'high',
                       'title': 'HSTS header missing — browsers may allow HTTP downgrade'})

    if not f.get('cspPresent'):
        issues.append({'id': 'https-no-csp', 'severity': 'medium',
                       'title': 'Content-Security-Policy header absent — XSS risk'})

    if f.get('port80Open') and not f.get('httpRedirectsToHttps'):
        issues.append({'id': 'https-no-redirect', 'severity': 'high',
                       'title': 'Port 80 open but HTTP does not redirect to HTTPS'})

    if f.get('httpVersion') != 'HTTP/2':
        issues.append({'id': 'https-no-http2', 'severity': 'low',
                       'title': 'HTTP/2 not supported — performance and multiplexing impact'})

    return issues


def _save_result(job_id, account_id, domain, findings):
    table = dynamodb.Table(os.environ['TABLE_NAME'])
    now   = datetime.datetime.utcnow().isoformat() + 'Z'
    table.put_item(Item={
        'pk':          f'JOB#{job_id}',
        'sk':          'PILLAR#https',
        'gsi1pk':      'JOB',
        'jobId':       job_id,
        'accountId':   account_id,
        'domain':      domain,
        'pillar':      'https',
        'status':      'complete',
        'score':       findings.get('score'),
        'findings':    findings,
        'createdAt':   now,
        'completedAt': now,
    })


def _flatten_cert_field(field):
    result = {}
    for entry in field:
        for k, v in entry:
            result[k] = v
    return result


def _is_expired(not_after_str):
    if not not_after_str:
        return True
    try:
        expiry = datetime.datetime.strptime(not_after_str, '%b %d %H:%M:%S %Y %Z')
        return expiry < datetime.datetime.utcnow()
    except Exception:
        return False


def _days_until_expiry(not_after_str):
    if not not_after_str:
        return None
    try:
        expiry = datetime.datetime.strptime(not_after_str, '%b %d %H:%M:%S %Y %Z')
        delta  = expiry - datetime.datetime.utcnow()
        return max(0, delta.days)
    except Exception:
        return None


def _resp(status, body):
    return {
        'statusCode': status,
        'headers': {
            'Content-Type':                'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        'body': json.dumps(body, default=str),
    }
