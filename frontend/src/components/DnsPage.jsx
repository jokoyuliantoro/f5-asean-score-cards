import { useState, useMemo } from 'react';
import { SCAN_GROUPS, ACCOUNTS, scoreColor, fmtTimestamp, daysAgo } from '../data/appData';
import styles from './DnsPage.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

const DIMENSION_KEYS = ['resilience', 'stability', 'responseTime'];
const DIMENSION_LABELS = {
  resilience:   'Resilience',
  stability:    'Stability',
  responseTime: 'Response Time',
};

// Derive realistic per-domain, per-dimension DNS data from appData SCAN_GROUPS.
// In a real app this would come from an API. Here we generate deterministic
// pseudo-data from the scan group's overall dns score so all pages stay coherent.
function deriveDnsData(scanGroup) {
  if (!scanGroup) return null;
  const base = scanGroup.pillars.dns.score ?? 0;

  return scanGroup.domains.map((domain, di) => {
    // Spread domains across a ±12 range so each feels different
    const offset = [0, -8, +6, -4][di % 4];
    const domainBase = Math.min(99, Math.max(30, base + offset));

    const resilience   = Math.min(99, Math.max(30, domainBase - 7 + (di * 3 % 11)));
    const stability    = Math.min(99, Math.max(30, domainBase + 4 - (di * 2 % 9)));
    const responseTime = Math.min(99, Math.max(30, domainBase + 2 + (di * 5 % 7)));

    const scores = { resilience, stability, responseTime };

    // Build per-dimension detail rows
    const details = {
      resilience: {
        findings: [
          resilience < 70
            ? 'Single authoritative NS cluster — no geographic redundancy in ASEAN'
            : 'Dual NS clusters active (Singapore + Hong Kong)',
          resilience < 60
            ? 'DNSSEC not configured on this zone'
            : resilience < 80
            ? 'DNSSEC partial — zone signed, DS record not published at parent'
            : 'DNSSEC fully configured and chain of trust verified',
          resilience < 65
            ? 'TTL values set to 60s — too low for failover stability'
            : 'TTL values appropriate (3600s for A/AAAA records)',
        ],
        recommendation:
          resilience < 70
            ? 'Deploy a secondary NS cluster in Jakarta or Manila. Extend TTL to ≥3600s for stability. Enable DNSSEC to prevent cache poisoning.'
            : 'Consider adding a third NS location to improve geographic diversity. Monitor DNSSEC key rollover schedule.',
        metrics: [
          { label: 'NS Clusters',     value: resilience >= 70 ? '2' : '1',      unit: ' location(s)' },
          { label: 'DNSSEC Status',   value: resilience >= 80 ? 'Full' : resilience >= 65 ? 'Partial' : 'None', unit: '' },
          { label: 'SOA TTL',         value: resilience >= 65 ? '3600' : '300', unit: 's' },
          { label: 'Delegation Check',value: resilience >= 75 ? 'Pass' : 'Fail', unit: '' },
        ],
      },
      stability: {
        findings: [
          stability >= 80
            ? 'Zero NXDOMAIN storms observed over 30-day window'
            : 'Elevated NXDOMAIN rate detected — 1.2% of queries returning NXDOMAIN',
          stability >= 75
            ? 'SOA serial increments consistent — no zone transfer anomalies'
            : 'Zone transfer inconsistency detected between primary and secondary NS',
          stability < 70
            ? `${(3.1 - stability / 50).toFixed(1)}% query failure rate during peak hours (23:00–01:00 SGT)`
            : '0.2% query failure rate during peak hours — within acceptable range',
        ],
        recommendation:
          stability < 75
            ? 'Investigate peak-hour failure rate — likely upstream resolver timeout. Audit zone transfer configuration. Consider Anycast-backed resolver for resilience.'
            : 'Monitor SOA serial consistency. Set up automated alerting for NXDOMAIN rate spikes above 0.5%.',
        metrics: [
          { label: 'NXDOMAIN Rate',   value: stability >= 80 ? '0.0%' : stability >= 70 ? '0.4%' : '1.2%', unit: '' },
          { label: 'Query Fail Rate', value: stability >= 80 ? '0.2%' : stability >= 65 ? '1.1%' : '3.1%', unit: '' },
          { label: 'Zone Transfer',   value: stability >= 75 ? 'OK' : 'Error', unit: '' },
          { label: 'SOA Serials',     value: stability >= 70 ? 'Consistent' : 'Mismatch', unit: '' },
        ],
      },
      responseTime: {
        findings: [
          `Median query time from Singapore: ${Math.round(20 + (100 - responseTime) * 0.5)}ms`,
          responseTime < 70
            ? `Manila p95 latency: ${Math.round(200 + (100 - responseTime) * 2)}ms — exceeds 150ms threshold`
            : `Manila p95 latency: ${Math.round(80 + (100 - responseTime))}ms — within threshold`,
          responseTime < 65
            ? `Jakarta p95 latency: ${Math.round(280 + (100 - responseTime) * 1.5)}ms — poor, no local PoP`
            : `Jakarta p95 latency: ${Math.round(100 + (100 - responseTime))}ms — acceptable`,
        ],
        recommendation:
          responseTime < 70
            ? 'Add a PoP in Manila and Jakarta. F5 XC Anycast DNS reduces p95 to <80ms in measured ASEAN deployments.'
            : 'Response times are healthy from primary PoPs. Consider adding Ho Chi Minh City for complete ASEAN coverage.',
        metrics: [
          { label: 'SG Median',  value: `${Math.round(20 + (100 - responseTime) * 0.5)}ms`, unit: '' },
          { label: 'KL Median',  value: `${Math.round(60 + (100 - responseTime) * 0.8)}ms`, unit: '' },
          { label: 'MNL p95',    value: responseTime >= 70 ? `${Math.round(80 + (100 - responseTime))}ms` : `${Math.round(200 + (100 - responseTime) * 2)}ms`, unit: '' },
          { label: 'JKT p95',    value: responseTime >= 65 ? `${Math.round(100 + (100 - responseTime))}ms` : `${Math.round(280 + (100 - responseTime) * 1.5)}ms`, unit: '' },
        ],
      },
    };

    return { domain, scores, details, overall: Math.round((resilience + stability + responseTime) / 3) };
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ScoreBadge({ score, size = 'md' }) {
  const color = scoreColor(score);
  return (
    <span className={styles[`badge${size.toUpperCase()}`]} style={{ color, borderColor: color + '33', background: color + '14' }}>
      {score ?? '—'}
    </span>
  );
}

function ScoreBar({ score }) {
  const color = scoreColor(score);
  return (
    <div className={styles.scoreBar}>
      <div className={styles.scoreBarFill} style={{ width: `${score ?? 0}%`, background: color }} />
    </div>
  );
}

function MetricChip({ label, value }) {
  return (
    <div className={styles.metricChip}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
    </div>
  );
}

function DimensionPanel({ dim, data, isActive, onClick }) {
  const score = data.scores[dim];
  const detail = data.details[dim];
  const color = scoreColor(score);

  return (
    <div
      className={[styles.dimPanel, isActive ? styles.dimPanelActive : ''].join(' ')}
      onClick={onClick}
      style={{ '--dim-color': color }}
    >
      <div className={styles.dimHeader}>
        <span className={styles.dimLabel}>{DIMENSION_LABELS[dim]}</span>
        <ScoreBadge score={score} size="sm" />
      </div>
      <ScoreBar score={score} />

      {isActive && (
        <div className={styles.dimBody}>
          <div className={styles.dimMetrics}>
            {detail.metrics.map(m => (
              <MetricChip key={m.label} label={m.label} value={`${m.value}${m.unit}`} />
            ))}
          </div>

          <div className={styles.findingsList}>
            {detail.findings.map((f, i) => (
              <div key={i} className={styles.findingRow}>
                <span className={styles.findingDot} style={{ background: color }} />
                <span className={styles.findingText}>{f}</span>
              </div>
            ))}
          </div>

          <div className={styles.recommendation}>
            <span className={styles.recLabel}>Recommendation</span>
            <p className={styles.recText}>{detail.recommendation}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function DomainCard({ data, isSelected, onClick }) {
  const color = scoreColor(data.overall);
  return (
    <button
      className={[styles.domainCard, isSelected ? styles.domainCardActive : ''].join(' ')}
      onClick={onClick}
      style={{ '--card-accent': color }}
    >
      <div className={styles.domainCardTop}>
        <span className={styles.domainName}>{data.domain}</span>
        <span className={styles.domainScore} style={{ color }}>{data.overall}</span>
      </div>
      <div className={styles.domainDims}>
        {DIMENSION_KEYS.map(dim => (
          <div key={dim} className={styles.domainDimRow}>
            <span className={styles.domainDimLabel}>{DIMENSION_LABELS[dim]}</span>
            <ScoreBar score={data.scores[dim]} />
            <span className={styles.domainDimScore} style={{ color: scoreColor(data.scores[dim]) }}>
              {data.scores[dim]}
            </span>
          </div>
        ))}
      </div>
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DnsPage() {
  // Derive only scan groups with DNS Completed status
  const completedGroups = useMemo(() =>
    SCAN_GROUPS.filter(sg => sg.pillars.dns.status === 'Completed'),
    []
  );

  const [selectedGroupId, setSelectedGroupId] = useState(completedGroups[0]?.id ?? null);
  const [selectedDomainIdx, setSelectedDomainIdx] = useState(0);
  const [activeDim, setActiveDim] = useState(null);

  const selectedGroup = SCAN_GROUPS.find(sg => sg.id === selectedGroupId);
  const account = ACCOUNTS.find(a => a.id === selectedGroup?.accountId);
  const dnsData = useMemo(() => deriveDnsData(selectedGroup), [selectedGroup]);
  const domainData = dnsData?.[selectedDomainIdx] ?? null;

  const overallScore = selectedGroup?.pillars.dns.score;

  // Reset domain/dim when group changes
  const handleGroupChange = (id) => {
    setSelectedGroupId(id);
    setSelectedDomainIdx(0);
    setActiveDim(null);
  };
  const handleDomainSelect = (idx) => {
    setSelectedDomainIdx(idx);
    setActiveDim(null);
  };
  const handleDimClick = (dim) => setActiveDim(prev => prev === dim ? null : dim);

  if (completedGroups.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <svg width="40" height="40" viewBox="0 0 15 15" fill="none" stroke="var(--f5-N400)" strokeWidth="1">
              <circle cx="7.5" cy="7.5" r="6"/><ellipse cx="7.5" cy="7.5" rx="2.6" ry="6"/>
              <line x1="1.5" y1="7.5" x2="13.5" y2="7.5"/>
            </svg>
          </div>
          <p className={styles.emptyTitle}>No completed DNS probes</p>
          <p className={styles.emptySub}>Run a new probe from the Dashboard to see DNS results here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* ── Page Header ── */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div className={styles.pillarBadge}>
            <svg width="16" height="16" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="7.5" cy="7.5" r="6"/><ellipse cx="7.5" cy="7.5" rx="2.6" ry="6"/>
              <line x1="1.5" y1="7.5" x2="13.5" y2="7.5"/>
              <line x1="2" y1="4.5" x2="13" y2="4.5"/>
              <line x1="2" y1="10.5" x2="13" y2="10.5"/>
            </svg>
            DNS
          </div>
          <h1 className={styles.pageTitle}>DNS Resilience Report</h1>
          <p className={styles.pageSubtitle}>
            Resilience · Stability · Response Time across ASEAN PoPs
          </p>
        </div>

        {/* Scan Group Selector */}
        <div className={styles.scanGroupSelector}>
          <label className={styles.selectorLabel}>Probe Group</label>
          <div className={styles.selectWrap}>
            <select
              className={styles.select}
              value={selectedGroupId ?? ''}
              onChange={e => handleGroupChange(e.target.value)}
            >
              {completedGroups.map(sg => {
                const acct = ACCOUNTS.find(a => a.id === sg.accountId);
                return (
                  <option key={sg.id} value={sg.id}>
                    {sg.name} — {acct?.name}
                  </option>
                );
              })}
            </select>
            <span className={styles.selectChevron}>
              <svg width="12" height="12" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 5l4.5 4.5L12 5"/>
              </svg>
            </span>
          </div>
        </div>
      </div>

      {/* ── Context bar ── */}
      {selectedGroup && (
        <div className={styles.contextBar}>
          <div className={styles.contextItem}>
            <span className={styles.contextDot} />
            <span className={styles.contextKey}>Account</span>
            <span className={styles.contextVal}>{account?.name}</span>
          </div>
          <div className={styles.contextSep} />
          <div className={styles.contextItem}>
            <span className={styles.contextKey}>Domains probed</span>
            <span className={styles.contextVal}>{selectedGroup.domains.length}</span>
          </div>
          <div className={styles.contextSep} />
          <div className={styles.contextItem}>
            <span className={styles.contextKey}>Probe date</span>
            <span className={styles.contextVal}>{fmtTimestamp(selectedGroup.createdAt)}</span>
          </div>
          <div className={styles.contextSep} />
          <div className={styles.contextItem}>
            <span className={styles.contextKey}>Age</span>
            <span className={styles.contextVal}>{daysAgo(selectedGroup.createdAt)}</span>
          </div>
          <div className={styles.contextSep} />
          <div className={styles.contextItem}>
            <span className={styles.contextKey}>Overall DNS Score</span>
            <span className={styles.contextVal} style={{ color: scoreColor(overallScore), fontWeight: 700 }}>
              {overallScore}
            </span>
          </div>
        </div>
      )}

      {/* ── Body: Domain list + Detail ── */}
      <div className={styles.body}>
        {/* Left: Domain cards */}
        <div className={styles.domainList}>
          <p className={styles.panelHeading}>Domains</p>
          {dnsData?.map((d, idx) => (
            <DomainCard
              key={d.domain}
              data={d}
              isSelected={idx === selectedDomainIdx}
              onClick={() => handleDomainSelect(idx)}
            />
          ))}
        </div>

        {/* Right: Dimension detail */}
        {domainData && (
          <div className={styles.detail}>
            <div className={styles.detailHeader}>
              <div>
                <p className={styles.detailDomain}>{domainData.domain}</p>
                <p className={styles.detailHint}>Click a dimension to expand findings</p>
              </div>
              <div className={styles.overallBadgeWrap}>
                <span className={styles.overallLabel}>Overall</span>
                <span
                  className={styles.overallScore}
                  style={{ color: scoreColor(domainData.overall) }}
                >
                  {domainData.overall}
                </span>
              </div>
            </div>

            <div className={styles.dimensions}>
              {DIMENSION_KEYS.map(dim => (
                <DimensionPanel
                  key={dim}
                  dim={dim}
                  data={domainData}
                  isActive={activeDim === dim}
                  onClick={() => handleDimClick(dim)}
                />
              ))}
            </div>

            {/* F5 XC promo strip */}
            <div className={styles.promoStrip}>
              <div className={styles.promoIcon}>
                <svg width="18" height="18" viewBox="0 0 15 15" fill="none" stroke="var(--f5-blue)" strokeWidth="1.4">
                  <circle cx="7.5" cy="7.5" r="6"/>
                  <path d="M7.5 4v3.5l2.5 1.5"/>
                </svg>
              </div>
              <div className={styles.promoText}>
                <strong>F5 Distributed Cloud (XC) Anycast DNS</strong> can improve resilience,
                reduce p95 latency to &lt;80ms across ASEAN, and provide built-in DNSSEC automation.
              </div>
              <a
                href="https://www.f5.com/cloud/products/dns"
                target="_blank"
                rel="noreferrer"
                className={styles.promoLink}
              >
                Learn more →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
