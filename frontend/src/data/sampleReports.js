// ── Fictitious sample report data ─────────────────────────────────────────────
// Used on the dashboard to show prospects what a real report looks like.
// All data is clearly labelled as sample / illustrative.

export const SAMPLE_CUSTOMER = 'Acme Bank (Sample)';
export const SAMPLE_DOMAIN   = 'acmebank-demo.example';
export const SAMPLE_DATE     = 'March 2025';

// ── DNS ───────────────────────────────────────────────────────────────────────
export const DNS_SAMPLE = {
  overallScore: 76,
  status: 'Good',
  summary:
    'DNS infrastructure performs well under normal load but shows single-point-of-failure risk '
    + 'with only one authoritative nameserver cluster active in the ASEAN region. '
    + 'DNSSEC is partially configured — 3 of 5 zones are signed.',
  dimensions: [
    {
      label: 'Resilience',
      score: 68,
      status: 'Fair',
      findings: [
        'Single authoritative NS cluster — no geographic redundancy in SEA',
        'DNSSEC partial: acmebank-demo.example signed, api.acmebank-demo.example unsigned',
        'TTL values set to 300s — too low for failover stability',
      ],
      recommendation: 'Deploy a secondary NS cluster in Singapore or Jakarta. Extend TTL to 3600s for A/AAAA records.',
    },
    {
      label: 'Stability',
      score: 81,
      status: 'Good',
      findings: [
        'Zero NXDOMAIN storms observed over 30-day window',
        'SOA serial increments consistent — no zone transfer anomalies',
        '0.3% query failure rate during peak hours (23:00–01:00 SGT)',
      ],
      recommendation: 'Investigate peak-hour failure rate — likely upstream resolver timeout. Consider Anycast-backed resolver.',
    },
    {
      label: 'Response Time',
      score: 79,
      status: 'Good',
      findings: [
        'Median query time: 42ms from Singapore',
        'Median query time: 187ms from Manila — above 150ms threshold',
        'Jakarta p95 latency: 310ms — exceeds acceptable range',
      ],
      recommendation: 'Add a PoP in Manila and Jakarta. F5 XC Anycast DNS reduces p95 to <80ms in measured deployments.',
    },
  ],
  lastRun: '14 Mar 2025 · 09:14 SGT',
};

// ── HTTPS ─────────────────────────────────────────────────────────────────────
export const HTTPS_SAMPLE = {
  overallScore: 82,
  status: 'Good',
  summary:
    'TLS posture is strong on primary domains but legacy endpoints still accept TLS 1.1. '
    + 'TTFB is within acceptable range from Singapore but degrades significantly '
    + 'across the wider ASEAN region. IP Anycast not yet deployed.',
  dimensions: [
    {
      label: 'IP Anycast',
      score: 61,
      status: 'Fair',
      findings: [
        'Origin IP exposed — no Anycast routing in place',
        'Single-origin architecture creates DDoS amplification risk',
        'BGP failover not configured for APAC edge',
      ],
      recommendation: 'Onboard to F5 XC Global Network — Anycast across 30+ APAC PoPs. Origin IP concealment included.',
    },
    {
      label: 'TLS',
      score: 88,
      status: 'Good',
      findings: [
        'TLS 1.3 enabled on www and api subdomains ✓',
        'TLS 1.1 still accepted on legacy.acmebank-demo.example',
        'Certificate expiry: 47 days — renewal automation not confirmed',
        'HSTS max-age set to 31536000 with includeSubDomains ✓',
      ],
      recommendation: 'Disable TLS 1.1 on legacy endpoint. Implement auto-renewal via F5 XC managed certificates.',
    },
    {
      label: 'TTFB',
      score: 77,
      status: 'Good',
      findings: [
        'Singapore TTFB: 68ms (excellent)',
        'Kuala Lumpur TTFB: 134ms (acceptable)',
        'Manila TTFB: 298ms (above 200ms threshold)',
        'Ho Chi Minh City TTFB: 341ms (poor — no local PoP)',
      ],
      recommendation: 'Deploy F5 XC App Connect in Manila and Ho Chi Minh City. Expected TTFB improvement: 60–70%.',
    },
  ],
  lastRun: '14 Mar 2025 · 09:31 SGT',
};

// ── Surface Scan ──────────────────────────────────────────────────────────────
export const SURFACE_SAMPLE = {
  overallScore: 71,
  status: 'Fair',
  summary:
    'Public-facing endpoints reveal several exploitable misconfigurations detectable '
    + 'without authentication. Security headers are inconsistently applied, '
    + 'and two API endpoints return verbose error messages that expose stack traces.',
  findings: [
    {
      severity: 'high',
      title: 'Missing Content-Security-Policy header',
      affected: 'www.acmebank-demo.example, portal.acmebank-demo.example',
      detail: 'CSP absent on 2 of 5 public subdomains. XSS risk elevated.',
      remediation: 'Deploy CSP via F5 XC WAF policy — no application code change required.',
    },
    {
      severity: 'high',
      title: 'Verbose error messages on public API',
      affected: 'api.acmebank-demo.example/v2/auth, /v2/transfer',
      detail: 'HTTP 500 responses include full Java stack trace. Framework version exposed.',
      remediation: 'Enable error sanitisation in WAF. Block stack trace patterns via custom signature.',
    },
    {
      severity: 'medium',
      title: 'X-Frame-Options not set',
      affected: '4 of 5 subdomains',
      detail: 'Clickjacking protection absent. Login page vulnerable.',
      remediation: 'Add X-Frame-Options: DENY via F5 XC response header injection.',
    },
    {
      severity: 'medium',
      title: 'Referrer-Policy missing',
      affected: 'All subdomains',
      detail: 'Full referrer URL sent cross-origin — leaks internal path structure.',
      remediation: 'Set Referrer-Policy: strict-origin-when-cross-origin in WAF header policy.',
    },
    {
      severity: 'low',
      title: 'Server version disclosure',
      affected: 'api.acmebank-demo.example',
      detail: 'Server: nginx/1.18.0 returned in all responses.',
      remediation: 'Strip Server header via F5 XC response sanitisation rule.',
    },
  ],
  lastRun: '13 Mar 2025 · 14:02 SGT',
};

// ── Deep Scan ─────────────────────────────────────────────────────────────────
export const DEEP_SAMPLE = {
  overallScore: 58,
  status: 'Fair',
  summary:
    'Authenticated probing and traffic analysis via F5 forward proxy revealed '
    + 'significant session management weaknesses and two critical API vulnerabilities '
    + 'not visible from the public surface. Recommend prioritising session token rotation '
    + 'and BOLA remediation before next audit cycle.',
  findings: [
    {
      severity: 'critical',
      title: 'Broken Object Level Authorisation (BOLA) on /v2/accounts',
      affected: 'api.acmebank-demo.example/v2/accounts/{id}',
      detail:
        'Authenticated user A can retrieve account details for user B by iterating account IDs. '
        + 'Detected via authenticated traffic replay through F5 forward proxy.',
      remediation: 'Implement server-side ownership validation. F5 XC API Security can detect and block BOLA patterns in transit.',
    },
    {
      severity: 'critical',
      title: 'Session token not rotated post-authentication',
      affected: 'portal.acmebank-demo.example',
      detail:
        'Pre-auth session token reused post-login. Session fixation attack possible. '
        + 'Observed across 100% of sampled login flows.',
      remediation: 'Invalidate and reissue session token on authentication. F5 XC Bot Defense detects session fixation attempts.',
    },
    {
      severity: 'high',
      title: 'Sensitive PII in query parameters',
      affected: '/v2/transfer?account_no=&nric=',
      detail:
        'Account number and NRIC passed as GET parameters — logged in server access logs '
        + 'and browser history. Detected via proxy traffic analysis.',
      remediation: 'Migrate to POST body. F5 XC can scrub PII from logs at the edge.',
    },
    {
      severity: 'high',
      title: 'JWT algorithm confusion (HS256 → RS256 downgrade)',
      affected: 'api.acmebank-demo.example/v2/*',
      detail:
        'API accepts HS256-signed tokens when RS256 is configured — allows token forgery '
        + 'using public key as HMAC secret. Confirmed via authenticated fuzzing.',
      remediation: 'Enforce algorithm in JWT validation. F5 XC API Gateway validates JWT signature and algorithm.',
    },
    {
      severity: 'medium',
      title: 'Excessive data exposure on /v2/profile',
      affected: 'api.acmebank-demo.example/v2/profile',
      detail:
        'Response returns 34 fields; UI renders 8. Includes date_of_birth, income_band, '
        + 'credit_score_internal. Not consumed by any known client.',
      remediation: 'Implement response filtering. F5 XC can strip undeclared fields via API schema enforcement.',
    },
  ],
  lastRun: '12 Mar 2025 · 10:45 SGT',
};

// ── Recent scan activity (dashboard feed) ─────────────────────────────────────
export const SCAN_ACTIVITY = [
  { type: 'Deep Probe',    domain: SAMPLE_DOMAIN, time: '12 Mar · 10:45', status: 'Complete', score: 58  },
  { type: 'Surface Probe', domain: SAMPLE_DOMAIN, time: '13 Mar · 14:02', status: 'Complete', score: 71  },
  { type: 'DNS',          domain: SAMPLE_DOMAIN, time: '14 Mar · 09:14', status: 'Complete', score: 76  },
  { type: 'HTTPS',        domain: SAMPLE_DOMAIN, time: '14 Mar · 09:31', status: 'Complete', score: 82  },
];

// ── Top issues (cross-pillar, ranked by severity) ─────────────────────────────
export const TOP_ISSUES = [
  { severity: 'critical', pillar: 'Deep Probe',    text: 'BOLA vulnerability on authenticated API allows cross-account data access' },
  { severity: 'critical', pillar: 'Deep Probe',    text: 'Session fixation risk — token not rotated post-login' },
  { severity: 'high',     pillar: 'Surface Probe', text: 'Verbose stack traces exposed on 2 public API endpoints' },
  { severity: 'high',     pillar: 'HTTPS',        text: 'TLS 1.1 still accepted on legacy subdomain' },
  { severity: 'medium',   pillar: 'DNS',          text: 'No geographic redundancy — single NS cluster for all of ASEAN' },
];
