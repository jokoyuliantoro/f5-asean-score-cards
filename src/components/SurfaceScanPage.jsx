import { useState, useMemo } from 'react';
import { SCAN_GROUPS, ACCOUNTS, scoreColor, fmtTimestamp } from '../data/appData';
import styles from './SurfaceScanPage.module.css';

// ── Static OWASP data ─────────────────────────────────────────────────────────
const OWASP_WEB = [
  { id: 'A01',  name: 'Broken Access Control',           risk: 'Critical', status: 'PASS', detail: 'Access controls enforced; no privilege escalation detected across tested endpoints.' },
  { id: 'A02',  name: 'Cryptographic Failures',          risk: 'High',     status: 'WARN', detail: 'TLS 1.1 still negotiable on 2 endpoints; SHA-1 certificate chain detected on legacy subdomain.' },
  { id: 'A03',  name: 'Injection',                       risk: 'Critical', status: 'PASS', detail: 'No SQL/LDAP/command injection vectors found in tested URL parameters and form fields.' },
  { id: 'A04',  name: 'Insecure Design',                 risk: 'High',     status: 'WARN', detail: 'Rate limiting absent on /api/auth; no CAPTCHA protection on public registration flow.' },
  { id: 'A05',  name: 'Security Misconfiguration',       risk: 'High',     status: 'FAIL', detail: 'Server version header exposed (nginx/1.21.6); directory listing enabled on /static/.' },
  { id: 'A06',  name: 'Vulnerable & Outdated Components',risk: 'High',     status: 'FAIL', detail: '3 outdated npm packages with known CVEs: lodash 4.17.11, axios 0.21.1, moment 2.29.1.' },
  { id: 'A07',  name: 'Identification & Auth Failures',  risk: 'Critical', status: 'PASS', detail: 'JWT tokens validated server-side; sessions expire correctly; no fixation vulnerabilities.' },
  { id: 'A08',  name: 'Software & Data Integrity',       risk: 'High',     status: 'PASS', detail: 'SRI hashes present on all CDN-loaded assets; CI pipeline integrity verified.' },
  { id: 'A09',  name: 'Security Logging & Monitoring',   risk: 'Medium',   status: 'WARN', detail: 'Login failures not forwarded to SIEM; log retention < 90 days on 2 services.' },
  { id: 'A10',  name: 'Server-Side Request Forgery',     risk: 'High',     status: 'PASS', detail: 'No SSRF vectors identified in file upload or URL fetch endpoints.' },
];

const OWASP_API = [
  { id: 'API1',  name: 'Broken Object Level Authorization',         risk: 'Critical', status: 'PASS', detail: 'Object-level permission checks validated across all tested REST endpoints.' },
  { id: 'API2',  name: 'Broken Authentication',                     risk: 'Critical', status: 'WARN', detail: 'API keys transmitted in query string on 2 legacy endpoints; should use Authorization header.' },
  { id: 'API3',  name: 'Broken Object Property Authorization',      risk: 'High',     status: 'FAIL', detail: 'Mass assignment vulnerability on PUT /api/v2/users/{id} — role field is writable by regular users.' },
  { id: 'API4',  name: 'Unrestricted Resource Consumption',         risk: 'High',     status: 'WARN', detail: 'No pagination limits on /api/reports; crafted requests can trigger large payload responses.' },
  { id: 'API5',  name: 'Broken Function Level Authorization',       risk: 'Critical', status: 'PASS', detail: 'Admin-only functions correctly restricted by role middleware; tested 14 endpoints.' },
  { id: 'API6',  name: 'Unrestricted Access to Sensitive Flows',    risk: 'Medium',   status: 'WARN', detail: 'Bulk export endpoint lacks per-user rate limiting; download abuse is possible.' },
  { id: 'API7',  name: 'Server-Side Request Forgery',               risk: 'High',     status: 'PASS', detail: 'Webhook URLs validated against allowlist; no access to internal RFC-1918 address space.' },
  { id: 'API8',  name: 'Security Misconfiguration',                 risk: 'High',     status: 'FAIL', detail: 'CORS wildcard (*) configured on /api/public; verbose stack traces returned on errors.' },
  { id: 'API9',  name: 'Improper Inventory Management',             risk: 'Medium',   status: 'WARN', detail: 'Legacy v1 API still reachable at /api/v1; no deprecation or sunset headers present.' },
  { id: 'API10', name: 'Unsafe Consumption of APIs',                risk: 'Medium',   status: 'PASS', detail: 'All third-party API responses are validated and sanitised before internal use.' },
];

// ── Security Headers ──────────────────────────────────────────────────────────
const HEADERS_DATA = [
  { header: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains', status: 'PASS' },
  { header: 'Content-Security-Policy',   value: 'Not set',                              status: 'FAIL' },
  { header: 'X-Frame-Options',           value: 'DENY',                                 status: 'PASS' },
  { header: 'X-Content-Type-Options',    value: 'nosniff',                              status: 'PASS' },
  { header: 'Referrer-Policy',           value: 'no-referrer-when-downgrade',           status: 'WARN' },
  { header: 'Permissions-Policy',        value: 'Not set',                              status: 'FAIL' },
  { header: 'Cache-Control',             value: 'no-store, no-cache',                   status: 'PASS' },
  { header: 'Server',                    value: 'nginx/1.21.6',                         status: 'FAIL' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function deriveSurfaceData(scanGroup) {
  if (!scanGroup) return null;
  const base = scanGroup.pillars.surfaceScan?.score ?? 60;
  return {
    score: base,
    portCount: 6,
    headerScore: Math.min(99, Math.max(30, base - 5)),
    critical: 0,
    high:     Math.max(0, Math.round((100 - base) / 15)),
    medium:   Math.max(0, Math.round((100 - base) / 8)),
    low:      Math.max(0, Math.round((100 - base) / 5)),
    info:     Math.round(base / 4),
    scanDate: scanGroup.lastScan,
  };
}

const RISK_COLORS = {
  Critical: { bg: 'var(--f5-pomegranate-light)', color: 'var(--f5-pomegranate)' },
  High:     { bg: '#ffe5d0',                      color: '#c44f00'               },
  Medium:   { bg: 'var(--f5-amber-light)',         color: '#8a6000'               },
  Low:      { bg: 'var(--f5-green-light)',         color: '#1a7a3a'               },
  Info:     { bg: 'var(--f5-blue-light)',          color: 'var(--f5-blue)'        },
};

const STATUS_META = {
  PASS: { bg: 'var(--f5-green-light)', color: '#1a7a3a',               label: 'PASS' },
  WARN: { bg: 'var(--f5-amber-light)', color: '#8a6000',               label: 'WARN' },
  FAIL: { bg: 'var(--f5-pomegranate-light)', color: 'var(--f5-pomegranate)', label: 'FAIL' },
};

// ── Sub-components ────────────────────────────────────────────────────────────
function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.WARN;
  return (
    <span className={styles.pill} style={{ background: m.bg, color: m.color }}>
      {status === 'PASS' ? '✓' : status === 'FAIL' ? '✕' : '⚠'} {m.label}
    </span>
  );
}

function RiskBadge({ risk }) {
  const m = RISK_COLORS[risk] || RISK_COLORS.Info;
  return (
    <span className={styles.riskBadge} style={{ background: m.bg, color: m.color }}>
      {risk}
    </span>
  );
}

function OWASPTable({ title, badge, items }) {
  const [expanded, setExpanded] = useState(null);
  const pass = items.filter(i => i.status === 'PASS').length;
  const warn = items.filter(i => i.status === 'WARN').length;
  const fail = items.filter(i => i.status === 'FAIL').length;

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleRow}>
          <span className={styles.cardTitle}>{title}</span>
          <span className={styles.pillBadge}>{badge}</span>
        </div>
        <div className={styles.owaspSummary}>
          <span className={styles.pill} style={{ background: STATUS_META.PASS.bg, color: STATUS_META.PASS.color }}>✓ {pass} Pass</span>
          <span className={styles.pill} style={{ background: STATUS_META.WARN.bg, color: STATUS_META.WARN.color }}>⚠ {warn} Warn</span>
          <span className={styles.pill} style={{ background: STATUS_META.FAIL.bg, color: STATUS_META.FAIL.color }}>✕ {fail} Fail</span>
        </div>
      </div>

      <div className={styles.tableHead}>
        <span>ID</span>
        <span>Vulnerability Category</span>
        <span>Risk Level</span>
        <span>Status</span>
      </div>

      {items.map((item, i) => {
        const isOpen = expanded === item.id;
        return (
          <div key={item.id}>
            <button
              className={[styles.tableRow, isOpen ? styles.tableRowOpen : '', i % 2 === 0 ? styles.tableRowAlt : ''].join(' ')}
              onClick={() => setExpanded(isOpen ? null : item.id)}
            >
              <span className={styles.mono}>{item.id}</span>
              <span className={styles.rowName}>{item.name}</span>
              <RiskBadge risk={item.risk} />
              <StatusPill status={item.status} />
            </button>
            {isOpen && (
              <div className={styles.tableRowDetail}>
                <span className={styles.detailLabel}>Finding:</span> {item.detail}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SurfaceScanPage() {
  const [selectedGroup, setSelectedGroup] = useState(SCAN_GROUPS[0]?.id ?? '');

  const scanGroup = useMemo(
    () => SCAN_GROUPS.find(g => g.id === selectedGroup) ?? SCAN_GROUPS[0],
    [selectedGroup]
  );

  const data = useMemo(() => deriveSurfaceData(scanGroup), [scanGroup]);
  if (!data) return <div className={styles.page}>No probe data available.</div>;

  const sc = scoreColor(data.score);

  const PORTS = [
    { port: 443,  proto: 'TCP', service: 'HTTPS', state: 'Open',     risk: 'Low',    detail: 'TLS 1.2/1.3 — Valid cert, Let\'s Encrypt' },
    { port: 80,   proto: 'TCP', service: 'HTTP',  state: 'Open',     risk: 'Medium', detail: 'Redirects to HTTPS; Server header exposed' },
    { port: 8443, proto: 'TCP', service: 'HTTPS', state: 'Open',     risk: 'Low',    detail: 'Mgmt interface — restricted by IP allowlist' },
    { port: 22,   proto: 'TCP', service: 'SSH',   state: 'Open',     risk: 'High',   detail: 'Open to 0.0.0.0 — key auth only, no fail2ban' },
    { port: 3306, proto: 'TCP', service: 'MySQL', state: 'Filtered', risk: 'Info',   detail: 'Filtered at perimeter — not internet-facing' },
    { port: 6379, proto: 'TCP', service: 'Redis', state: 'Filtered', risk: 'Info',   detail: 'Filtered — internal access via VPC peering' },
  ];

  return (
    <div className={styles.page}>

      {/* Page header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <span className={styles.pillarBadge}>
            <svg width="12" height="12" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="6.5" cy="6.5" r="4"/><line x1="9.5" y1="9.5" x2="13" y2="13"/>
            </svg>
            Surface Probe · Public
          </span>
          <h1 className={styles.pageTitle}>Surface Probe Report</h1>
          <p className={styles.pageSubtitle}>
            External attack surface — ports, headers, and OWASP compliance
          </p>
        </div>

        {/* Scan group selector */}
        <div className={styles.scanGroupSelector}>
          <span className={styles.selectorLabel}>Probe Group</span>
          <div className={styles.selectWrap}>
            <select
              className={styles.select}
              value={selectedGroup}
              onChange={e => setSelectedGroup(e.target.value)}
            >
              {SCAN_GROUPS.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <span className={styles.selectChevron}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M2 4l4 4 4-4"/>
              </svg>
            </span>
          </div>
          <span className={styles.scanMeta}>
            Last probe: {fmtTimestamp(data.scanDate)} · {scanGroup.domains.length} domain{scanGroup.domains.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Score + stat strip */}
      <div className={styles.statStrip}>
        <div className={styles.scoreBlock}>
          <span className={styles.scoreValue} style={{ color: sc }}>{data.score}</span>
          <span className={styles.scoreLabel}>Surface Score</span>
        </div>
        <div className={styles.statDivider} />
        {[
          { label: 'Critical', value: data.critical, risk: 'Critical' },
          { label: 'High',     value: data.high,     risk: 'High'     },
          { label: 'Medium',   value: data.medium,   risk: 'Medium'   },
          { label: 'Low',      value: data.low,      risk: 'Low'      },
          { label: 'Info',     value: data.info,     risk: 'Info'     },
        ].map(s => (
          <div key={s.label} className={styles.statItem}>
            <span className={styles.statValue} style={{ color: RISK_COLORS[s.risk].color }}>{s.value}</span>
            <span className={styles.statLabel}>{s.label}</span>
          </div>
        ))}
        <div className={styles.statDivider} />
        <div className={styles.statItem}>
          <span className={styles.statValue}>{data.portCount}</span>
          <span className={styles.statLabel}>Ports Probed</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{HEADERS_DATA.length}</span>
          <span className={styles.statLabel}>Headers Tested</span>
        </div>
      </div>

      {/* Port enumeration */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>Port &amp; Service Enumeration</span>
          <span className={styles.cardSub}>External attack surface — TCP/UDP probe</span>
        </div>
        <div className={[styles.tableHead, styles.tableHeadPorts].join(' ')}>
          <span>Port</span><span>Proto</span><span>Service</span><span>State</span><span>Risk</span><span>Details</span>
        </div>
        {PORTS.map((p, i) => (
          <div key={p.port} className={[styles.portRow, i % 2 === 0 ? styles.tableRowAlt : ''].join(' ')}>
            <span className={styles.mono} style={{ fontWeight: 600 }}>{p.port}</span>
            <span className={styles.muted}>{p.proto}</span>
            <span className={styles.serviceLabel}>{p.service}</span>
            <span>
              <span className={styles.statePill} data-state={p.state.toLowerCase()}>{p.state}</span>
            </span>
            <RiskBadge risk={p.risk} />
            <span className={styles.muted}>{p.detail}</span>
          </div>
        ))}
      </div>

      {/* Security headers */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleRow}>
            <span className={styles.cardTitle}>Security Headers Analysis</span>
            <span className={styles.cardSub}>HTTP response header inspection</span>
          </div>
          <div className={styles.owaspSummary}>
            {(['PASS', 'WARN', 'FAIL']).map(s => (
              <span key={s} className={styles.pill} style={{ background: STATUS_META[s].bg, color: STATUS_META[s].color }}>
                {s === 'PASS' ? '✓' : s === 'FAIL' ? '✕' : '⚠'} {HEADERS_DATA.filter(h => h.status === s).length} {s}
              </span>
            ))}
          </div>
        </div>
        <div className={[styles.tableHead, styles.tableHeadHeaders].join(' ')}>
          <span>Header</span><span>Value</span><span>Status</span>
        </div>
        {HEADERS_DATA.map((h, i) => (
          <div key={h.header} className={[styles.headerRow, i % 2 === 0 ? styles.tableRowAlt : ''].join(' ')}>
            <span className={styles.mono}>{h.header}</span>
            <span className={[styles.headerValue, h.status === 'FAIL' ? styles.headerValueFail : ''].join(' ')}>
              {h.value}
            </span>
            <StatusPill status={h.status} />
          </div>
        ))}
      </div>

      {/* OWASP tables */}
      <OWASPTable title="OWASP Top 10 Web" badge="2021" items={OWASP_WEB} />
      <OWASPTable title="OWASP Top 10 API" badge="2023" items={OWASP_API} />

    </div>
  );
}
