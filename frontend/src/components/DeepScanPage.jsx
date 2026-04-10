import { useState, useMemo } from 'react';
import { SCAN_GROUPS, scoreColor, fmtTimestamp } from '../data/appData';
import styles from './DeepScanPage.module.css';

// ── OWASP data (same as Surface but Deep adds richer CVE context) ─────────────
const OWASP_WEB = [
  { id: 'A01',  name: 'Broken Access Control',           risk: 'Critical', status: 'PASS', detail: 'Access controls enforced; no privilege escalation detected across 47 tested endpoints.' },
  { id: 'A02',  name: 'Cryptographic Failures',          risk: 'High',     status: 'WARN', detail: 'TLS 1.1 still negotiable; SHA-1 chain on legacy subdomain; no HTTP Public Key Pinning.' },
  { id: 'A03',  name: 'Injection',                       risk: 'Critical', status: 'FAIL', detail: 'SQL injection in /api/search?q= parameter — confirmed data extraction via blind SQLi.' },
  { id: 'A04',  name: 'Insecure Design',                 risk: 'High',     status: 'WARN', detail: 'Rate limiting absent on /api/auth; no CAPTCHA on registration; no account lockout policy.' },
  { id: 'A05',  name: 'Security Misconfiguration',       risk: 'High',     status: 'FAIL', detail: 'Server banner disclosure; directory listing on /static/; debug mode enabled in staging config found in repo.' },
  { id: 'A06',  name: 'Vulnerable & Outdated Components',risk: 'High',     status: 'FAIL', detail: '3 npm packages with known CVEs: lodash 4.17.11 (CVE-2021-23337), axios 0.21.1, moment 2.29.1.' },
  { id: 'A07',  name: 'Identification & Auth Failures',  risk: 'Critical', status: 'PASS', detail: 'JWT validated server-side; sessions expire correctly; MFA enforced on admin accounts.' },
  { id: 'A08',  name: 'Software & Data Integrity',       risk: 'High',     status: 'PASS', detail: 'SRI hashes on all CDN assets; CI pipeline signed; no untrusted deserialization found.' },
  { id: 'A09',  name: 'Security Logging & Monitoring',   risk: 'Medium',   status: 'WARN', detail: 'Login failures not forwarded to SIEM; log retention < 90 days; no alerting on privilege escalation.' },
  { id: 'A10',  name: 'Server-Side Request Forgery',     risk: 'High',     status: 'PASS', detail: 'Webhook URLs validated against allowlist; no internal RFC-1918 access confirmed via authenticated testing.' },
];

const OWASP_API = [
  { id: 'API1',  name: 'Broken Object Level Authorization',         risk: 'Critical', status: 'PASS', detail: 'Object-level permission checks validated across all 47 REST endpoints in authenticated testing.' },
  { id: 'API2',  name: 'Broken Authentication',                     risk: 'Critical', status: 'WARN', detail: 'API keys transmitted in query string on /api/v1/export and /api/v1/reports — logged in access logs.' },
  { id: 'API3',  name: 'Broken Object Property Authorization',      risk: 'High',     status: 'FAIL', detail: 'Mass assignment confirmed: PUT /api/v2/users/{id} allows role field write by regular authenticated users.' },
  { id: 'API4',  name: 'Unrestricted Resource Consumption',         risk: 'High',     status: 'WARN', detail: 'No pagination on /api/reports; /api/export has no size limit — confirmed 50 MB payload accepted.' },
  { id: 'API5',  name: 'Broken Function Level Authorization',       risk: 'Critical', status: 'PASS', detail: 'Admin-only functions correctly restricted; all 14 admin endpoints tested with user-role tokens — all blocked.' },
  { id: 'API6',  name: 'Unrestricted Access to Sensitive Flows',    risk: 'Medium',   status: 'WARN', detail: 'Bulk export endpoint has no per-user rate limiting; tested 100 concurrent requests without throttle.' },
  { id: 'API7',  name: 'Server-Side Request Forgery',               risk: 'High',     status: 'PASS', detail: 'Webhook URLs validated against allowlist; tested with aws metadata endpoint — blocked correctly.' },
  { id: 'API8',  name: 'Security Misconfiguration',                 risk: 'High',     status: 'FAIL', detail: 'CORS wildcard (*) on /api/public; stack traces with file paths returned on 500 errors.' },
  { id: 'API9',  name: 'Improper Inventory Management',             risk: 'Medium',   status: 'WARN', detail: 'Legacy /api/v1 still active; 12 undocumented endpoints discovered via forced browsing.' },
  { id: 'API10', name: 'Unsafe Consumption of APIs',                risk: 'Medium',   status: 'PASS', detail: 'All third-party API responses validated and sanitised before internal use; no prototype pollution.' },
];

// ── Vulnerability findings ─────────────────────────────────────────────────────
const VULNS = [
  { id: 'DS-001', sev: 'High',   cat: 'Injection',          title: 'SQL Injection in /api/search',            cve: 'CVE-2024-1337', cvss: 7.8, status: 'Open',      fix: 'Use parameterised queries / prepared statements throughout data access layer.' },
  { id: 'DS-002', sev: 'High',   cat: 'Misconfiguration',   title: 'Server version banner disclosure',        cve: '—',             cvss: 5.3, status: 'Open',      fix: 'Set "server_tokens off" in nginx.conf to remove version from response headers.' },
  { id: 'DS-003', sev: 'High',   cat: 'Outdated Component', title: 'lodash prototype pollution (4.17.11)',    cve: 'CVE-2021-23337',cvss: 7.2, status: 'Open',      fix: 'Upgrade lodash to ≥ 4.17.21. Run npm audit fix to resolve all transitive issues.' },
  { id: 'DS-004', sev: 'Medium', cat: 'Authentication',     title: 'API keys exposed in query string',        cve: '—',             cvss: 4.3, status: 'In Review', fix: 'Move API credentials to Authorization: Bearer header; rotate all affected keys.' },
  { id: 'DS-005', sev: 'Medium', cat: 'API Security',       title: 'Mass assignment on user update endpoint', cve: '—',             cvss: 6.5, status: 'Open',      fix: 'Whitelist allowed writable fields in PUT/PATCH request validation schemas.' },
  { id: 'DS-006', sev: 'Medium', cat: 'Misconfiguration',   title: 'CORS wildcard on /api/public',            cve: '—',             cvss: 5.4, status: 'Open',      fix: 'Restrict Access-Control-Allow-Origin to known partner domains.' },
  { id: 'DS-007', sev: 'Medium', cat: 'TLS',                title: 'TLS 1.1 negotiable on 2 endpoints',      cve: '—',             cvss: 5.9, status: 'Open',      fix: 'Update ssl_protocols in nginx to "TLSv1.2 TLSv1.3" and remove TLSv1 TLSv1.1.' },
  { id: 'DS-008', sev: 'Low',    cat: 'Authentication',     title: 'No rate limiting on /api/auth',           cve: '—',             cvss: 3.7, status: 'Open',      fix: 'Implement rate limiting: 10 req/min per IP; add account lockout after 5 failures.' },
  { id: 'DS-009', sev: 'Low',    cat: 'Logging',            title: 'Insufficient login failure alerting',     cve: '—',             cvss: 2.6, status: 'Open',      fix: 'Configure SIEM alert for ≥ 5 failed logins within 5 minutes from same IP.' },
  { id: 'DS-010', sev: 'Low',    cat: 'Headers',            title: 'Content-Security-Policy not configured',  cve: '—',             cvss: 4.1, status: 'Open',      fix: "Define Content-Security-Policy header with 'default-src self'; restrict inline scripts." },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function deriveDeepData(scanGroup) {
  if (!scanGroup) return null;
  const base = scanGroup.pillars.deepScan?.score ?? 55;
  return {
    score: base,
    endpointsTested: 47,
    authenticated: true,
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

const SEV_COLORS = {
  Critical: { bg: 'var(--f5-pomegranate-light)', color: 'var(--f5-pomegranate)', border: '#ffc2b8' },
  High:     { bg: '#ffe5d0',                      color: '#c44f00',               border: '#ffc9a0' },
  Medium:   { bg: 'var(--f5-amber-light)',         color: '#8a6000',               border: '#ffe080' },
  Low:      { bg: 'var(--f5-green-light)',         color: '#1a7a3a',               border: '#a8efc1' },
};

const STATUS_META = {
  PASS: { bg: 'var(--f5-green-light)', color: '#1a7a3a'               },
  WARN: { bg: 'var(--f5-amber-light)', color: '#8a6000'               },
  FAIL: { bg: 'var(--f5-pomegranate-light)', color: 'var(--f5-pomegranate)' },
};

function cvssColor(v) {
  if (v >= 9)   return 'var(--f5-pomegranate)';
  if (v >= 7)   return '#c44f00';
  if (v >= 4)   return '#8a6000';
  return '#1a7a3a';
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.WARN;
  return (
    <span className={styles.pill} style={{ background: m.bg, color: m.color }}>
      {status === 'PASS' ? '✓' : status === 'FAIL' ? '✕' : '⚠'} {status}
    </span>
  );
}

function RiskBadge({ risk }) {
  const m = RISK_COLORS[risk] || RISK_COLORS.Info;
  return <span className={styles.riskBadge} style={{ background: m.bg, color: m.color }}>{risk}</span>;
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
        <div className={styles.summaryRow}>
          <span className={styles.pill} style={{ background: STATUS_META.PASS.bg, color: STATUS_META.PASS.color }}>✓ {pass} Pass</span>
          <span className={styles.pill} style={{ background: STATUS_META.WARN.bg, color: STATUS_META.WARN.color }}>⚠ {warn} Warn</span>
          <span className={styles.pill} style={{ background: STATUS_META.FAIL.bg, color: STATUS_META.FAIL.color }}>✕ {fail} Fail</span>
        </div>
      </div>
      <div className={styles.tableHead}>
        <span>ID</span><span>Vulnerability Category</span><span>Risk Level</span><span>Status</span>
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
              <div className={styles.rowDetail}>
                <span className={styles.detailLabel}>Finding:</span> {item.detail}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function DeepScanPage() {
  const [selectedGroup, setSelectedGroup] = useState(SCAN_GROUPS[0]?.id ?? '');
  const [expanded, setExpanded] = useState(null);

  const scanGroup = useMemo(
    () => SCAN_GROUPS.find(g => g.id === selectedGroup) ?? SCAN_GROUPS[0],
    [selectedGroup]
  );

  const data = useMemo(() => deriveDeepData(scanGroup), [scanGroup]);
  if (!data) return <div className={styles.page}>No probe data available.</div>;

  const sc = scoreColor(data.score);

  const bySev = (s) => VULNS.filter(v => v.sev === s).length;

  // Category breakdown for risk summary
  const byCategory = VULNS.reduce((acc, v) => {
    acc[v.cat] = (acc[v.cat] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className={styles.page}>

      {/* Page header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <span className={styles.pillarBadge}>
            <svg width="12" height="12" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="6.5" cy="6.5" r="4"/><line x1="9.5" y1="9.5" x2="13" y2="13"/>
              <circle cx="6.5" cy="6.5" r="1.8" strokeDasharray="2 1.5"/>
            </svg>
            Deep Probe · Authenticated
          </span>
          <h1 className={styles.pageTitle}>Deep Probe Report</h1>
          <p className={styles.pageSubtitle}>
            Authenticated vulnerability assessment — OWASP compliance + CVE findings
          </p>
        </div>

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
            Last probe: {fmtTimestamp(data.scanDate)} · Authenticated · {data.endpointsTested} endpoints
          </span>
        </div>
      </div>

      {/* Score + stat strip */}
      <div className={styles.statStrip}>
        <div className={styles.scoreBlock}>
          <span className={styles.scoreValue} style={{ color: sc }}>{data.score}</span>
          <span className={styles.scoreLabel}>Deep Probe Score</span>
        </div>
        <div className={styles.statDivider} />
        {[
          { label: 'Critical', value: bySev('Critical'), sev: 'Critical' },
          { label: 'High',     value: bySev('High'),     sev: 'High'     },
          { label: 'Medium',   value: bySev('Medium'),   sev: 'Medium'   },
          { label: 'Low',      value: bySev('Low'),      sev: 'Low'      },
        ].map(s => (
          <div key={s.label} className={styles.statItem}>
            <span className={styles.statValue} style={{ color: SEV_COLORS[s.sev].color }}>{s.value}</span>
            <span className={styles.statLabel}>{s.label}</span>
          </div>
        ))}
        <div className={styles.statDivider} />
        <div className={styles.statItem}>
          <span className={styles.statValue}>{data.endpointsTested}</span>
          <span className={styles.statLabel}>Endpoints Tested</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue} style={{ color: '#1a7a3a' }}>Yes</span>
          <span className={styles.statLabel}>Authenticated</span>
        </div>
      </div>

      {/* Vulnerability findings */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>Vulnerability Findings</span>
          <span className={styles.cardSub}>Authenticated deep probe · click any row to expand remediation</span>
        </div>
        <div className={[styles.tableHead, styles.tableHeadVulns].join(' ')}>
          <span>ID</span><span>Severity</span><span>Category</span><span>Title</span>
          <span>CVE</span><span>CVSS</span><span>Status</span>
        </div>
        {VULNS.map((v, i) => {
          const sv = SEV_COLORS[v.sev] || SEV_COLORS.Low;
          const isOpen = expanded === v.id;
          return (
            <div key={v.id}>
              <button
                className={[styles.vulnRow, isOpen ? styles.vulnRowOpen : '', i % 2 === 0 ? styles.tableRowAlt : ''].join(' ')}
                onClick={() => setExpanded(isOpen ? null : v.id)}
              >
                <span className={styles.mono}>{v.id}</span>
                <span>
                  <span className={styles.sevBadge} style={{ background: sv.bg, color: sv.color, borderColor: sv.border }}>{v.sev}</span>
                </span>
                <span className={styles.catLabel}>{v.cat}</span>
                <span className={styles.vulnTitle}>{v.title}</span>
                <span className={[styles.mono, v.cve === '—' ? styles.muted : styles.cveLink].join(' ')}>{v.cve}</span>
                <span className={styles.cvssScore} style={{ color: cvssColor(v.cvss) }}>{v.cvss}</span>
                <span>
                  <span className={styles.statusChip} data-status={v.status === 'Open' ? 'open' : 'review'}>
                    {v.status}
                  </span>
                </span>
              </button>
              {isOpen && (
                <div className={styles.vulnDetail}>
                  <span className={styles.detailLabel}>Remediation:</span> {v.fix}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* OWASP tables */}
      <OWASPTable title="OWASP Top 10 Web" badge="2021" items={OWASP_WEB} />
      <OWASPTable title="OWASP Top 10 API" badge="2023" items={OWASP_API} />

      {/* Risk summary grid */}
      <div className={styles.summaryGrid}>
        {/* By category */}
        <div className={styles.card} style={{ marginBottom: 0 }}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Findings by Category</span>
          </div>
          <div className={styles.categoryList}>
            {Object.entries(byCategory).map(([cat, cnt]) => (
              <div key={cat} className={styles.categoryRow}>
                <span className={styles.categoryName}>{cat}</span>
                <div className={styles.categoryBar}>
                  <div
                    className={styles.categoryBarFill}
                    style={{ width: `${(cnt / VULNS.length) * 100}%` }}
                  />
                </div>
                <span className={styles.categoryCount}>{cnt}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Remediation timeline */}
        <div className={styles.card} style={{ marginBottom: 0 }}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Remediation Priority</span>
          </div>
          <div className={styles.remList}>
            {[
              { label: 'Immediate — ≤ 7 days',   filter: v => v.sev === 'Critical' || v.sev === 'High',   color: 'var(--f5-pomegranate)' },
              { label: 'Short-term — ≤ 30 days',  filter: v => v.sev === 'Medium',                         color: '#c44f00'               },
              { label: 'Planned — ≤ 90 days',     filter: v => v.sev === 'Low',                            color: '#8a6000'               },
            ].map(({ label, filter, color }) => {
              const ids = VULNS.filter(filter).map(v => v.id);
              return (
                <div key={label} className={styles.remItem} style={{ borderLeftColor: color }}>
                  <span className={styles.remLabel} style={{ color }}>{label}</span>
                  <span className={styles.remIds}>{ids.length} finding{ids.length !== 1 ? 's' : ''}: {ids.join(', ')}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
}
