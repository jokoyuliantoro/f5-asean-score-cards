import React, { useState, useRef } from 'react';
import { runDnsDiscovery } from '../api/discovery';
import { scoreColor, fmtTimestamp } from '../data/appData';
import DiscoveryProgress from './DiscoveryProgress';
import { logEvent, EVENT_TYPES } from '../data/auditLog';
import styles from './DnsPage.module.css';

// ── Score deduction rules (mirrors backend _compute_score logic) ──────────────
// Used to render the transparent score breakdown table.
// Each rule maps a findings condition to a label, observed value, and deduction.
function buildScoreBreakdown(f) {
  const rows = [];

  const add = (condition, label, observed, deduction, passing) => {
    rows.push({ pass: condition, label, observed, deduction: condition ? 0 : deduction, passing });
  };

  add(!f.A?.length,       'A records present',           f.A?.length ? `${f.A.length} record(s)` : 'None found',                                    25, true);
  add(f.nsMultiVendor,    'Multi-vendor nameservers',    f.nsMultiVendor ? `${f.nsVendorCount} vendors` : `Single vendor (${f.nsVendors?.[0]?.name ?? '?'})`, 20, false);

  const anycast = f.nsAnycast;
  if (anycast === 'no') {
    add(false, 'Anycast nameservers',  'Confirmed unicast', 15, false);
  } else if (anycast === 'unknown') {
    add(false, 'Anycast nameservers',  'Unknown — registry inference only', 8, false);
  } else {
    add(true,  'Anycast nameservers',  'Confirmed anycast', 0, false);
  }

  const ttl = f.ttlScore;
  if (ttl === 'low')         add(false, 'DNS TTL ≤ 300s',  `${f.ttl}s — too slow for failover`,           15, false);
  else if (ttl === 'medium') add(false, 'DNS TTL ≤ 300s',  `${f.ttl}s — suboptimal for geo-steering`,      8, false);
  else if (ttl === 'unknown') add(false, 'DNS TTL readable', 'Could not read TTL',                         10, false);
  else                        add(true,  'DNS TTL ≤ 300s',  `${f.ttl}s ✓`,                                 0, false);

  const gs = f.geoSteering?.status ?? '';
  if (gs === 'no-geo-steering')  add(false, 'Geo-steering / anycast routing', 'No geo-steering detected — single unicast IP', 15, false);
  else if (gs === 'roundrobin')  add(false, 'Geo-steering / anycast routing', 'Round-robin only — same subnet', 8, false);
  else                           add(true,  'Geo-steering / anycast routing', f.geoSteering?.label ?? 'Active', 0, false);

  const lc = f.latencyConsistency?.status ?? '';
  if (lc === 'critical')                add(false, 'Latency — all IPs reachable',   'Unreachable IPs detected',                      15, false);
  else if (lc === 'inconsistent-critical') add(false, 'Latency consistency',         'Mix of local and distant endpoints',             12, false);
  else if (lc === 'inconsistent-minor')  add(false, 'Latency consistency',           'Mix of local and regional endpoints',             5, false);
  else if (lc?.includes('distant'))      add(false, 'Latency — regional endpoints', 'All endpoints distant from Southeast Asia',        8, false);
  else if (lc)                           add(true,  'Latency consistency',           f.latencyConsistency?.label ?? 'Consistent',       0, false);

  const dnssec = f.dnssecStatus ?? 'none';
  if (dnssec === 'none')        add(false, 'DNSSEC enabled',           'Not configured',                                              10, false);
  else if (dnssec === 'partial') add(false, 'DNSSEC chain complete',   'DNSKEY present but DS record missing in parent',               5, false);
  else                           add(true,  'DNSSEC enabled',          'Full chain of trust verified',                                 0, false);

  const nsCount = f.nsCount ?? 0;
  if (nsCount === 0)       add(false, 'Nameservers found',     'None',                          10, false);
  else if (nsCount < 4)    add(false, 'NS count ≥ 4 (recommended)', `${nsCount} nameserver(s)`, 5, false);
  else                     add(true,  'NS count ≥ 4 (recommended)', `${nsCount} nameserver(s)`, 0, false);

  const hf = f.healthFailoverSignal;
  if (hf === 'none' || hf === 'poor')    add(false, 'Health-check failover signal', hf === 'poor' ? 'Single static IP, no failover path' : 'No A records', 8, false);
  else if (hf === 'roundrobin')          add(false, 'Health-check failover signal', 'Round-robin — no health awareness',                                    4, false);
  else                                   add(true,  'Health-check failover signal', hf === 'anycast' ? 'Anycast — health routing at network layer' : 'Geo-distributed endpoints', 0, false);

  add(f.caaPresent, 'CAA record present', f.caaPresent ? 'Present' : 'Missing', 5, false);
  add(f.AAAA?.length > 0, 'IPv6 (AAAA) records', f.AAAA?.length ? `${f.AAAA.length} record(s)` : 'None', 5, false);

  const totalDeducted = rows.reduce((s, r) => s + r.deduction, 0);
  return { rows, totalDeducted };
}

// ── Severity config ───────────────────────────────────────────────────────────
const SEV = {
  critical: { bg: '#fff0f0', border: '#fca5a5', text: '#b91c1c', label: 'CRITICAL' },
  high:     { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', label: 'HIGH'     },
  medium:   { bg: '#fffbeb', border: '#fde68a', text: '#92400e', label: 'MEDIUM'   },
  low:      { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', label: 'LOW'      },
};

// ── Dig command generator ─────────────────────────────────────────────────────
function digCommands(issueId, appDomain, apexDomain, findings) {
  const d  = appDomain  ?? 'example.com';
  const ad = apexDomain ?? 'example.com';
  const cmds = {
    'dns-single-vendor':       [`dig ${ad} NS +short`, `# All NS hostnames should span ≥2 different provider domains`],
    'dns-unicast-ns':          [`dig ${ad} NS +short`, `# Then for each NS IP: check if RTT from multiple regions differs`],
    'dns-anycast-unknown':     [`dig ${ad} NS +short`, `# Then: nslookup <ns-hostname>  — check ASN via https://stat.ripe.net/`],
    'dns-no-geo-steering':     [`dig ${d} A +short`, `dig @<each-ns-ip> ${d} A +short`, `# Compare: all NSes should return different IPs if geo-steering is active`],
    'dns-roundrobin-only':     [`dig ${d} A +short`, `# Check if returned IPs are in same /24 subnet`],
    'dns-latency-inconsistent':[`dig ${d} A +short`, `# Then: curl -o /dev/null -w "%{time_connect}" https://<each-ip>/ --resolve ${d}:443:<ip>`],
    'dns-latency-all-distant': [`dig ${d} A +short`, `curl -o /dev/null -w "%{time_connect}ms" --connect-to ${d}::$(dig ${d} A +short | head -1): https://${d}/`],
    'dns-unreachable-ip':      [`dig ${d} A +short`, `# Then: curl -v --connect-timeout 5 https://${d}/ --resolve ${d}:443:<unreachable-ip>`],
    'dns-no-dnssec':           [`dig ${ad} DNSKEY +short`, `dig ${ad} DS +short`, `# Empty output = DNSSEC not configured`],
    'dns-dnssec-partial':      [`dig ${ad} DNSKEY +short`, `dig ${ad} DS +short`, `# DNSKEY present but DS empty = incomplete chain of trust`],
    'dns-high-ttl':            [`dig ${d} A +short`, `dig ${d} A | grep -i ttl`],
    'dns-medium-ttl':          [`dig ${d} A | grep -i ttl`],
    'dns-low-ns-count':        [`dig ${ad} NS +short | wc -l`, `# Should return ≥4`],
    'dns-no-health-failover':  [`dig ${d} A +short`, `# Single static IP with no managed DNS = no automatic failover`],
    'dns-ns-disagreement':     [`dig @<ns1-ip> ${d} A +short`, `dig @<ns2-ip> ${d} A +short`, `# Compare results — differences indicate disagreement`],
    'dns-ns-ip-owner-mismatch':[`dig ${ad} NS +short`, `# Then: nslookup <ns-hostname>  →  check returned IP ASN at https://stat.ripe.net/`],
    'dns-no-caa':              [`dig ${ad} CAA +short`, `# Empty = no CAA policy, any CA can issue certs`],
    'dns-no-ipv6':             [`dig ${d} AAAA +short`, `# Empty = no IPv6 records`],
  };
  return cmds[issueId] ?? [`dig ${d} A +short`];
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Collapsible({ label, labelSuffix, icon, children, defaultOpen = false, variant = 'default' }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyRef = React.useRef(null);

  function toggle() {
    setOpen(o => {
      const next = !o;
      // After opening, trigger resize on any textareas inside (edit mode)
      if (next) {
        requestAnimationFrame(() => {
          if (!bodyRef.current) return;
          bodyRef.current.querySelectorAll('textarea').forEach(el => {
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
          });
        });
      }
      return next;
    });
  }

  return (
    <div className={`${styles.collapsible} ${styles[`collapsible_${variant}`] ?? ''}`}>
      <button className={styles.collapsibleTrigger} onClick={toggle}>
        {icon && <span className={styles.collapsibleIcon}>{icon}</span>}
        <span className={styles.collapsibleLabel}>{label}</span>
        {labelSuffix && <span className={styles.collapsibleSuffix}>{labelSuffix}</span>}
        <svg
          className={styles.collapsibleChevron}
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          width="14" height="14" viewBox="0 0 14 14" fill="none"
        >
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && <div ref={bodyRef} className={styles.collapsibleBody}>{children}</div>}
    </div>
  );
}

function ScoreGauge({ score }) {
  const color = scoreColor(score);
  const r = 44;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className={styles.gaugeWrap}>
      <svg width="112" height="112" viewBox="0 0 112 112">
        <circle cx="56" cy="56" r={r} fill="none" stroke="var(--f5-N200)" strokeWidth="8"/>
        <circle cx="56" cy="56" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`}
          strokeDashoffset={circ * 0.25}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        <text x="56" y="52" textAnchor="middle" fill={color}
          style={{ fontSize: 26, fontWeight: 800, fontFamily: 'inherit' }}>{score ?? '—'}</text>
        <text x="56" y="67" textAnchor="middle" fill="var(--f5-N400)"
          style={{ fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>/ 100</text>
      </svg>
    </div>
  );
}

function IssueSeverityCount({ issues }) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  issues.forEach(i => { if (counts[i.severity] !== undefined) counts[i.severity]++; });
  return (
    <div className={styles.sevCounts}>
      {Object.entries(counts).map(([sev, count]) => count > 0 && (
        <div key={sev} className={styles.sevCount}
          style={{ background: SEV[sev].bg, border: `1px solid ${SEV[sev].border}`, color: SEV[sev].text }}>
          <span className={styles.sevCountNum}>{count}</span>
          <span className={styles.sevCountLabel}>{SEV[sev].label}</span>
        </div>
      ))}
    </div>
  );
}

function ScoreBreakdown({ findings }) {
  const { rows, totalDeducted } = buildScoreBreakdown(findings);
  return (
    <div className={styles.breakdownTable}>
      <div className={styles.breakdownHeader}>
        <span>Check</span>
        <span>Observed value</span>
        <span className={styles.breakdownDeductCol}>Points</span>
      </div>
      {rows.map((row, i) => (
        <div key={i} className={`${styles.breakdownRow} ${row.pass ? styles.breakdownRowPass : styles.breakdownRowFail}`}>
          <span className={styles.breakdownCheck}>
            <span className={styles.breakdownPassIcon}>{row.pass ? '✓' : '✗'}</span>
            {row.label}
          </span>
          <span className={styles.breakdownObserved}>{row.observed}</span>
          <span className={styles.breakdownDeduct}>
            {row.deduction > 0 ? `−${row.deduction}` : '—'}
          </span>
        </div>
      ))}
      <div className={styles.breakdownFooter}>
        <span>Total deducted</span>
        <span />
        <span className={styles.breakdownTotal}>−{totalDeducted}</span>
      </div>
    </div>
  );
}

function FindingCard({ issue, appDomain, apexDomain, findings }) {
  const sev = SEV[issue.severity] ?? SEV.low;
  const cmds = digCommands(issue.id, appDomain, apexDomain, findings);
  return (
    <div className={styles.findingCard}
      style={{ borderLeft: `3px solid ${sev.text}`, background: sev.bg }}>
      {/* Header */}
      <div className={styles.findingCardHeader}>
        <span className={styles.findingBadge}
          style={{ background: sev.bg, border: `1px solid ${sev.border}`, color: sev.text }}>
          {sev.label}
        </span>
        <span className={styles.findingTitle}>{issue.title}</span>
      </div>

      {/* Detail — always visible */}
      {issue.detail && (
        <p className={styles.findingDetail}>{issue.detail}</p>
      )}

      {/* F5 XC Remediation — collapsible */}
      {issue.xcRemediation && (
        <Collapsible
          label="F5 XC Remediation"
          variant="remedy"
          icon={
            <svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="var(--f5-blue)" strokeWidth="1.5">
              <path d="M7.5 1.5v12M1.5 7.5h12"/>
              <circle cx="7.5" cy="7.5" r="6"/>
            </svg>
          }
        >
          <p className={styles.findingRemedy}>{issue.xcRemediation}</p>
        </Collapsible>
      )}

      {/* Verify yourself — collapsible */}
      <Collapsible
        label="Verify yourself"
        variant="verify"
        icon={
          <svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="2" y="3" width="11" height="9" rx="1"/>
            <path d="M5 7h5M5 9.5h3"/>
          </svg>
        }
      >
        <div className={styles.codeBlock}>
          {cmds.map((cmd, i) => (
            <div key={i} className={cmd.startsWith('#') ? styles.codeComment : styles.codeLine}>
              {cmd}
            </div>
          ))}
        </div>
      </Collapsible>
    </div>
  );
}

function NsVendorTable({ vendors }) {
  if (!vendors?.length) return <p className={styles.rawEmpty}>No nameserver data</p>;
  return (
    <table className={styles.rawTable}>
      <thead>
        <tr>
          <th>Provider (NS hostname)</th>
          <th>Anycast</th>
          <th>NS IP Owner (RIPE)</th>
          <th>ASN</th>
        </tr>
      </thead>
      <tbody>
        {vendors.map((v, i) => (
          <tr key={i}>
            <td><strong>{v.name}</strong><br/><span className={styles.rawSub}>{v.sld}</span></td>
            <td>
              <span className={styles.pill}
                style={{
                  background: v.anycast === true ? '#f0fdf4' : v.anycast === false ? '#fff0f0' : '#fffbeb',
                  color:      v.anycast === true ? '#166534' : v.anycast === false ? '#b91c1c' : '#92400e',
                  border:     `1px solid ${v.anycast === true ? '#bbf7d0' : v.anycast === false ? '#fca5a5' : '#fde68a'}`,
                }}>
                {v.anycast === true ? 'Yes' : v.anycast === false ? 'No' : 'Unknown'}
              </span>
            </td>
            <td>{v.ipHolder ?? '—'}</td>
            <td><span className={styles.mono}>{v.ipAsn ?? '—'}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function IpInfoTable({ ipInfo, latencyContext }) {
  if (!ipInfo?.length) return <p className={styles.rawEmpty}>No IP latency data</p>;
  const bucketStyle = (bucket) => ({
    local:       { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
    regional:    { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
    distant:     { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c' },
    unreachable: { bg: '#fff0f0', border: '#fca5a5', text: '#b91c1c' },
  }[bucket] ?? { bg: '#f5f5f5', border: '#ddd', text: '#555' });

  return (
    <>
      {latencyContext?.source === 'lambda' && (
        <div className={styles.latencyWarning}>
          <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="#92400e" strokeWidth="1.4">
            <path d="M7.5 1L14 13H1L7.5 1z"/><line x1="7.5" y1="6" x2="7.5" y2="9"/><circle cx="7.5" cy="11" r="0.5" fill="#92400e"/>
          </svg>
          <span>
            Measured from <strong>{latencyContext.sourceLabel}</strong> — cloud-to-cloud connectivity,
            not end-user experience. {latencyContext.agentNote}
          </span>
        </div>
      )}
      <table className={styles.rawTable}>
        <thead>
          <tr>
            <th>IP Address</th>
            <th>Latency</th>
            <th>Bucket</th>
            <th>ASN</th>
            <th>Network Owner (RIPE)</th>
          </tr>
        </thead>
        <tbody>
          {ipInfo.map((r, i) => {
            const s = bucketStyle(r.bucket);
            return (
              <tr key={i}>
                <td><span className={styles.mono}>{r.ip}</span></td>
                <td><span className={styles.mono}>{r.ms != null ? `${r.ms}ms` : '—'}</span></td>
                <td>
                  <span className={styles.pill}
                    style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}>
                    {r.label}
                  </span>
                </td>
                <td><span className={styles.mono}>{r.asn ?? '—'}</span></td>
                <td>{r.holder ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function PerNsTable({ perNsResults }) {
  if (!perNsResults?.length) return <p className={styles.rawEmpty}>No per-NS query data</p>;
  return (
    <table className={styles.rawTable}>
      <thead>
        <tr>
          <th>Nameserver</th>
          <th className={styles.printHide}>NS IP</th>
          <th>IPs Returned</th>
          <th>CNAME</th>
          <th>Matches Default?</th>
          <th className={styles.printHide}>Error</th>
        </tr>
      </thead>
      <tbody>
        {perNsResults.map((r, i) => (
          <tr key={i}>
            <td><span className={styles.mono}>{r.ns}</span></td>
            <td className={styles.printHide}><span className={styles.mono}>{r.nsIp ?? '—'}</span></td>
            <td>
              {r.ips?.length
                ? r.ips.map((ip, j) => <div key={j} className={styles.mono}>{ip}</div>)
                : <span className={styles.rawEmpty}>—</span>}
            </td>
            <td>
              <span className={styles.mono}>
                {r.cname
                  ? r.cname.length > 35
                    ? '…' + r.cname.slice(-32)
                    : r.cname
                  : '—'}
              </span>
            </td>
            <td>
              {r.error ? '—' :
                <span style={{ color: r.matchesDefault ? '#166534' : '#c2410c', fontWeight: 600 }}>
                  {r.matchesDefault ? 'Yes' : 'No ⚠'}
                </span>
              }
            </td>
            <td className={styles.printHide}>
              {r.error
                ? <span className={styles.warnText}>{r.error}</span>
                : <span className={styles.okText}>—</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DnsRecordsTable({ findings }) {
  const rows = [
    { key: 'A records',       val: findings.A?.join(', ')    || 'None' },
    { key: 'AAAA records',    val: findings.AAAA?.join(', ') || 'None' },
    { key: 'TTL',             val: findings.ttl != null ? `${findings.ttl}s (${findings.ttlScore})` : '—' },
    { key: 'CAA',             val: findings.caaPresent ? (findings.caa?.join(', ') || 'Present') : 'Not present' },
    { key: 'DNSSEC',          val: findings.dnssecStatus === 'full' ? 'Full chain verified'
                                 : findings.dnssecStatus === 'partial' ? 'Partial — DS record missing'
                                 : 'Not configured' },
    { key: 'SOA serial',      val: findings.soaSerial  ?? '—' },
    { key: 'SOA refresh',     val: findings.soaRefresh != null ? `${findings.soaRefresh}s` : '—' },
    { key: 'SOA neg TTL',     val: findings.soaNegTTL  != null ? `${findings.soaNegTTL}s`  : '—' },
    { key: 'Health failover', val: findings.healthFailoverSignal ?? '—' },
    { key: 'Anycast method',  val: findings.anycastMethod === 'registry-inferred'
                                   ? 'Registry-inferred (not ground truth — run agent for confirmation)'
                                   : findings.anycastMethod ?? '—' },
  ];
  return (
    <table className={styles.rawTable}>
      <thead><tr><th>Field</th><th>Value</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td className={styles.rawKey}>{r.key}</td>
            <td className={styles.mono}>{String(r.val)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}


// ── AI Analysis Section ───────────────────────────────────────────────────────

const AI_SECTIONS = [
  { key: 'executive',        label: 'Executive Summary',    defaultOpen: true  },
  { key: 'riskAssessment',   label: 'Risk Assessment',      defaultOpen: true  },
  { key: 'f5Recommendation', label: 'F5 Recommendation',    defaultOpen: true  },
  { key: 'nextSteps',        label: 'Suggested Next Steps', defaultOpen: true  },
];

function AiAnalysisSection({ aiAnalysis, onSectionsChange }) {
  const [edits, setEdits] = useState(() => ({
    executive:        aiAnalysis?.sections?.executive        ?? '',
    riskAssessment:   aiAnalysis?.sections?.riskAssessment   ?? '',
    f5Recommendation: aiAnalysis?.sections?.f5Recommendation ?? '',
    nextSteps:        aiAnalysis?.sections?.nextSteps        ?? '',
  }));
  const [dirty,    setDirty]    = useState(false);
  const [saveMsg,  setSaveMsg]  = useState('');
  const [editing,  setEditing]  = useState(null); // which section key is in edit mode

  function handleChange(key, value) {
    const next = { ...edits, [key]: value };
    setEdits(next);
    setDirty(true);
    onSectionsChange?.(next);
  }

  function handleSave() {
    setSaveMsg('Saving…');
    setTimeout(() => { setSaveMsg('Saved ✓'); setDirty(false); }, 800);
  }

  const isError = aiAnalysis?.status === 'error';

  const headerMeta = !isError
    ? <span className={styles.aiMetaInline}>
        {aiAnalysis?.model ?? 'GPT-4o'}
        {aiAnalysis?.generatedAt && (
          <span className={styles.aiMetaTime}>
            {' · ' + new Date(aiAnalysis.generatedAt).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        )}
        {dirty && <span className={styles.aiMetaDirty}> · Unsaved edits</span>}
      </span>
    : <span className={styles.aiMetaError}>Generation failed</span>;

  return (
    <Collapsible
      label="AI Analysis"
      defaultOpen={false}
      labelSuffix={headerMeta}
      variant="ai"
      icon={
        <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
          <circle cx="7.5" cy="7.5" r="6"/>
          <path d="M5 7.5h5M7.5 5v5"/>
        </svg>
      }
    >
    <div className={styles.aiSection}>
      {isError ? (
        <div className={styles.aiErrorBox}>
          <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="#c2410c" strokeWidth="1.4">
            <path d="M7.5 1L14 13H1L7.5 1z"/>
            <line x1="7.5" y1="6" x2="7.5" y2="9"/>
            <circle cx="7.5" cy="11" r="0.5" fill="#c2410c"/>
          </svg>
          AI analysis could not be generated: {aiAnalysis?.error ?? 'unknown error'}.
          Re-run discovery or contact your administrator.
        </div>
      ) : (
        <>
          {AI_SECTIONS.map(sec => (
            <div key={sec.key} className={styles.aiSubSection}>
              <div className={styles.aiSubHeader}>
                <span className={styles.aiSubTitle}>{sec.label}</span>
                <button
                  className={styles.aiEditBtn}
                  onClick={() => setEditing(editing === sec.key ? null : sec.key)}
                  aria-label={editing === sec.key ? 'Done editing' : `Edit ${sec.label}`}
                >
                  {editing === sec.key ? 'Done' : 'Edit'}
                </button>
              </div>
              {editing === sec.key ? (
                <textarea
                  className={styles.aiTextarea}
                  value={edits[sec.key]}
                  onChange={e => handleChange(sec.key, e.target.value)}
                  autoFocus
                  rows={8}
                  aria-label={sec.label}
                />
              ) : (
                <p className={styles.aiText}>
                  {edits[sec.key] || <span className={styles.aiTextEmpty}>No content generated.</span>}
                </p>
              )}
            </div>
          ))}

          <div className={styles.aiSaveRow}>
            <button className={styles.aiSaveBtn} onClick={handleSave} disabled={!dirty}>
              Save Report
            </button>
            <span className={styles.aiSaveHint}>Click Edit on any section to refine the wording.</span>
          </div>
        </>
      )}
    </div>
    </Collapsible>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DnsPage({ idToken, currentUserEmail, currentUserRole }) {
  const [domainInput,    setDomainInput]    = useState('');
  const [isRunning,      setIsRunning]      = useState(false);
  const [error,          setError]          = useState(null);
  const [apiResult,      setApiResult]      = useState(null);  // raw API response
  const [discoveryPhase, setDiscoveryPhase] = useState('init');
  // Holds edited AI section text — ref avoids re-render on every keystroke
  const editedAiSections = useRef(null);

  const handleRun = async () => {
    if (isRunning) return;
    const domain = domainInput.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!domain) return;
    setIsRunning(true);
    setDiscoveryPhase('init');
    setError(null);
    setApiResult(null);
    editedAiSections.current = null;
    logEvent(EVENT_TYPES.DNS_PROBE_START, currentUserEmail, currentUserRole, { domain }, idToken);
    try {
      const data = await runDnsDiscovery(domain, idToken, setDiscoveryPhase);
      setApiResult(data);
      const score = data?.findings?.score ?? null;
      logEvent(EVENT_TYPES.DNS_PROBE_DONE, currentUserEmail, currentUserRole, { domain, score }, idToken);
    } catch (err) {
      setError(err.message || 'Discovery failed. Please try again.');
      logEvent(EVENT_TYPES.DNS_PROBE_ERROR, currentUserEmail, currentUserRole, { domain, error: err.message }, idToken);
    } finally {
      // Give floater time to show 'done' then fade
      setTimeout(() => setIsRunning(false), 1400);
    }
  };

  const handleKeyDown = e => { if (e.key === 'Enter') handleRun(); };

  const f           = apiResult?.findings ?? null;
  const issues      = f?.issues ?? [];
  const appDomain   = f?.appDomain  ?? apiResult?.domain ?? '';
  const apexDomain  = f?.apexDomain ?? '';
  const score       = f?.score ?? null;
  const aiAnalysis  = apiResult?.aiAnalysis ?? null;

  return (
    <div className={styles.page}>

      {/* ── Discovery Progress Floater ── */}
      <DiscoveryProgress
        visible={isRunning}
        phase={discoveryPhase}
        domain={domainInput.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')}
      />

      {/* ── Page Header ── */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div className={styles.pillarBadge}>
            <svg width="16" height="16" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="7.5" cy="7.5" r="6"/>
              <ellipse cx="7.5" cy="7.5" rx="2.6" ry="6"/>
              <line x1="1.5" y1="7.5" x2="13.5" y2="7.5"/>
              <line x1="2" y1="4.5" x2="13" y2="4.5"/>
              <line x1="2" y1="10.5" x2="13" y2="10.5"/>
            </svg>
            DNS
          </div>
          <h1 className={styles.pageTitle}>DNS Discovery Report</h1>
          <p className={styles.pageSubtitle}>Live DNS resilience assessment with verifiable evidence</p>
        </div>

        {/* ── Input ── */}
        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>Target Domain</label>
          <div className={styles.inputRow}>
            <input
              className={styles.domainInput}
              type="text"
              placeholder="e.g. www.f5.com or f5.com"
              value={domainInput}
              onChange={e => setDomainInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isRunning}
            />
            <button
              className={styles.runBtn}
              onClick={handleRun}
              disabled={isRunning || !domainInput.trim()}
            >
              {isRunning ? 'Running…' : 'Run Discovery'}
            </button>
          </div>
          <p className={styles.inputHint}>
            Enter an app URL — e.g. <code>www.f5.com</code>. Bare domains like <code>f5.com</code> are
            auto-promoted to <code>www.</code> if it resolves.
          </p>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className={styles.errorBar}>{error}</div>
      )}

      {/* ── Empty state ── */}
      {!apiResult && !isRunning && !error && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <svg width="40" height="40" viewBox="0 0 15 15" fill="none" stroke="var(--f5-N400)" strokeWidth="1">
              <circle cx="7.5" cy="7.5" r="6"/>
              <ellipse cx="7.5" cy="7.5" rx="2.6" ry="6"/>
              <line x1="1.5" y1="7.5" x2="13.5" y2="7.5"/>
            </svg>
          </div>
          <p className={styles.emptyTitle}>Enter a domain to run a DNS discovery</p>
          <p className={styles.emptySub}>
            Results include live DNS facts, transparent score breakdown, and verifiable
            <code>dig</code> commands for each finding.
          </p>
        </div>
      )}

      {/* ── Loading — minimal inline state; floater handles detailed progress ── */}
      {isRunning && !apiResult && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <svg width="40" height="40" viewBox="0 0 15 15" fill="none" stroke="var(--f5-red)" strokeWidth="1.2"
              style={{ animation: 'spin 1s linear infinite' }}>
              <circle cx="7.5" cy="7.5" r="6" strokeDasharray="20 18"/>
            </svg>
          </div>
          <p className={styles.emptyTitle}>Running DNS discovery…</p>
          <p className={styles.emptySub}>
            Probing {domainInput} — see the progress window at the bottom-right corner.
          </p>
        </div>
      )}

      {/* ── Results ── */}
      {apiResult && f && (
        <div className={styles.results}>

          {/* ── 1. Discovery context bar ── */}
          <div className={styles.contextBar}>
            <div className={styles.contextItem}>
              <span className={styles.contextDot} style={{ background: 'var(--f5-green)' }} />
              <span className={styles.contextKey}>App Domain</span>
              <span className={styles.contextVal}>{appDomain}</span>
            </div>
            {apexDomain && apexDomain !== appDomain && (
              <>
                <div className={styles.contextSep} />
                <div className={styles.contextItem}>
                  <span className={styles.contextKey}>DNS Zone</span>
                  <span className={styles.contextVal}>{apexDomain}</span>
                </div>
              </>
            )}
            <div className={styles.contextSep} />
            <div className={styles.contextItem}>
              <span className={styles.contextKey}>Probed</span>
              <span className={styles.contextVal}>{fmtTimestamp(apiResult.completedAt)}</span>
            </div>
            <div className={styles.contextSep} />
            <div className={styles.contextItem}>
              <span className={styles.contextKey}>Source</span>
              <span className={styles.contextVal}>
                {f.latencyContext?.sourceLabel ?? 'AWS Lambda'}
              </span>
            </div>
          </div>

          {/* ── Lambda latency warning banner ── */}
          {f.latencyContext?.source === 'lambda' && (
            <div className={styles.agentBanner}>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="#92400e" strokeWidth="1.4">
                <path d="M7.5 1L14 13H1L7.5 1z"/>
                <line x1="7.5" y1="6" x2="7.5" y2="9"/>
                <circle cx="7.5" cy="11" r="0.6" fill="#92400e"/>
              </svg>
              <span>
                <strong>Latency results are from {f.latencyContext.sourceLabel}.</strong>{' '}
                Cloud infrastructure has better connectivity than real users in Jakarta, Manila, or KL.{' '}
                {f.latencyContext.agentNote}
              </span>
            </div>
          )}

          {/* ── 2. Score + issue counts ── */}
          <div className={styles.scoreRow}>
            <div className={styles.scoreCard}>
              <ScoreGauge score={score} />
              <div className={styles.scoreCardText}>
                <p className={styles.scoreCardTitle}>Overall Score</p>
                <p className={styles.scoreCardSub}>
                  Based on {issues.length} finding{issues.length !== 1 ? 's' : ''} across
                  NS resilience, geo-steering, latency, and security checks.
                </p>
                <Collapsible label="Show score breakdown" defaultOpen={false}>
                  <ScoreBreakdown findings={f} />
                </Collapsible>
              </div>
            </div>
            <IssueSeverityCount issues={issues} />
          </div>

          {/* ── 3. AI Analysis (generated inline with discovery, collapsed by default) ── */}
          {aiAnalysis && (
            <AiAnalysisSection
              aiAnalysis={aiAnalysis}
              onSectionsChange={sections => { editedAiSections.current = sections; }}
            />
          )}

          {/* ── 4. Findings ── */}
          {issues.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M7.5 1L14 13H1L7.5 1z"/>
                  <line x1="7.5" y1="6" x2="7.5" y2="9"/>
                  <circle cx="7.5" cy="11" r="0.5" fill="currentColor"/>
                </svg>
                Findings
                <span className={styles.sectionCount}>{issues.length}</span>
              </h2>
              <div className={styles.findingsList}>
                {['critical', 'high', 'medium', 'low'].map(sev =>
                  issues
                    .filter(i => i.severity === sev)
                    .map(issue => (
                      <FindingCard
                        key={issue.id}
                        issue={issue}
                        appDomain={appDomain}
                        apexDomain={apexDomain}
                        findings={f}
                      />
                    ))
                )}
              </div>
            </div>
          )}

          {/* ── 5. Raw discovery data (collapsed) ── */}
          <div className={styles.section}>
            <Collapsible
              label="Raw Discovery Data"
              defaultOpen={false}
              variant="raw"
              icon={
                <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3">
                  <rect x="2" y="2" width="11" height="11" rx="1"/>
                  <path d="M5 5h5M5 7.5h5M5 10h3"/>
                </svg>
              }
            >
              <div className={styles.rawSections}>

                <div className={styles.rawSection}>
                  <h4 className={styles.rawSectionTitle}>Nameserver Vendors &amp; Anycast</h4>
                  <NsVendorTable vendors={f.nsVendors} />
                </div>

                <div className={styles.rawSection}>
                  <h4 className={styles.rawSectionTitle}>
                    IP Latency &amp; Network Owner
                    <span className={styles.rawSectionNote}>
                      Probed from {f.latencyContext?.sourceLabel ?? 'Lambda'}
                    </span>
                  </h4>
                  <IpInfoTable ipInfo={f.ipInfo} latencyContext={f.latencyContext} />
                </div>

                <div className={styles.rawSection}>
                  <h4 className={styles.rawSectionTitle}>Per-Nameserver Query Results</h4>
                  <p className={styles.rawSectionDesc}>
                    Each authoritative NS was queried directly for <code>{appDomain}</code>.
                    Differences in returned IPs indicate geo-steering is active.
                  </p>
                  <PerNsTable perNsResults={f.perNsResults} />
                </div>

                <div className={styles.rawSection}>
                  <h4 className={styles.rawSectionTitle}>DNS Record Values</h4>
                  <DnsRecordsTable findings={f} />
                </div>

              </div>
            </Collapsible>
          </div>

          {/* ── F5 XC promo strip ── */}
          <div className={styles.promoStrip}>
            <div className={styles.promoIcon}>
              <svg width="18" height="18" viewBox="0 0 15 15" fill="none" stroke="var(--f5-blue)" strokeWidth="1.4">
                <circle cx="7.5" cy="7.5" r="6"/>
                <ellipse cx="7.5" cy="7.5" rx="2.6" ry="6"/>
                <line x1="1.5" y1="7.5" x2="13.5" y2="7.5"/>
              </svg>
            </div>
            <div className={styles.promoText}>
              <strong>F5 Distributed Cloud DNS</strong> addresses all findings above — global anycast
              network, multi-vendor secondary DNS, built-in DNSSEC, health-check failover, and
              geo-steering across ASEAN PoPs.
            </div>
            <a href="https://www.f5.com/products/distributed-cloud-services/dns"
              target="_blank" rel="noreferrer" className={styles.promoLink}>
              Learn more →
            </a>
          </div>

          {/* ── Print to PDF button ── */}
          <div className={styles.printBar}>
            <button className={styles.printBtn} onClick={() => window.print()}>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M4 4V2h7v2"/>
                <rect x="1" y="4" width="13" height="7" rx="1"/>
                <path d="M4 8v5h7V8"/>
                <circle cx="11.5" cy="7.5" r="0.75" fill="currentColor" stroke="none"/>
              </svg>
              Print / Save as PDF
            </button>
            <span className={styles.printHint}>
              Prints exactly what is currently expanded — collapse or expand sections before printing.
            </span>
          </div>

        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
