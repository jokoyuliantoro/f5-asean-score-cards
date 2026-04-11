import { useState } from 'react';
import { runDnsDiscovery } from '../api/discovery';
import { scoreColor, fmtTimestamp } from '../data/appData';
import styles from './DnsPage.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

const DIMENSION_KEYS = ['resilience', 'stability', 'responseTime'];
const DIMENSION_LABELS = {
  resilience:   'Resilience',
  stability:    'Stability',
  responseTime: 'Response Time',
};

/**
 * Map raw API findings → display data for the three DNS dimensions.
 * The API returns structured facts; we interpret them into scores + findings text.
 */
function buildDnsDisplayData(domain, findings) {
  const { score, ttl, ttlScore, nsCount, nsGeoRedundant, dnssec, caaPresent,
          soaRefresh, A = [], AAAA = [], issues = [] } = findings;

  // ── Resilience: NS redundancy, DNSSEC, CAA, geo ──────────────────────────
  const hasGeoNS    = nsGeoRedundant === true;
  const hasDnssec   = dnssec === true;
  const hasCaa      = caaPresent === true;
  const resScore    = Math.min(99, Math.round(
    (hasGeoNS ? 35 : 15) + (hasDnssec ? 30 : 0) + (hasCaa ? 15 : 0) + (nsCount >= 4 ? 10 : 5)
  ));

  // ── Stability: TTL, SOA refresh, dual-stack ───────────────────────────────
  const goodTtl     = ttlScore === 'high';       // ≤300s = modern fast-failover
  const dualStack   = AAAA.length > 0;
  const goodSoa     = soaRefresh <= 3600;
  const stabScore   = Math.min(99, Math.round(
    (goodTtl ? 40 : 20) + (dualStack ? 30 : 10) + (goodSoa ? 20 : 10)
  ));

  // ── Response Time: inferred from A record count and NS count ─────────────
  const rtScore     = Math.min(99, Math.round(
    Math.min(40, A.length * 7) + Math.min(40, nsCount * 10) + (hasGeoNS ? 15 : 5)
  ));

  const dimScores = { resilience: resScore, stability: stabScore, responseTime: rtScore };

  const dimDetails = {
    resilience: {
      findings: [
        hasGeoNS
          ? `${nsCount} authoritative NS servers detected — geographic redundancy confirmed`
          : `${nsCount} NS server(s) — no geographic redundancy detected across ASEAN`,
        hasDnssec
          ? 'DNSSEC enabled — zone signed, chain of trust verified'
          : 'DNSSEC not configured — DNS spoofing and cache poisoning risk',
        hasCaa
          ? 'CAA record present — certificate issuance restricted to approved CAs'
          : 'No CAA record — any CA can issue certificates for this domain',
      ],
      recommendation: !hasDnssec
        ? 'Enable DNSSEC to prevent cache poisoning. Add CAA records to restrict certificate issuance. F5 XC Anycast DNS automates DNSSEC and provides NS geo-redundancy across ASEAN PoPs.'
        : 'Consider adding a secondary NS cluster in Southeast Asia for additional resilience. F5 XC DNS provides built-in Anycast redundancy.',
      metrics: [
        { label: 'NS Count',     value: String(nsCount) },
        { label: 'Geo Redundant', value: hasGeoNS ? 'Yes' : 'No' },
        { label: 'DNSSEC',       value: hasDnssec ? 'Enabled' : 'Disabled' },
        { label: 'CAA Record',   value: hasCaa ? 'Present' : 'Missing' },
      ],
    },
    stability: {
      findings: [
        goodTtl
          ? `TTL: ${ttl}s — low TTL enables fast failover and geo-steering (modern standard ≤300s)`
          : `TTL: ${ttl}s — high TTL slows failover response; recommended ≤300s for ASEAN agility`,
        dualStack
          ? `Dual-stack confirmed — ${A.length} IPv4 and ${AAAA.length} IPv6 addresses active`
          : `IPv6 (AAAA) records absent — IPv6-only clients may fail; dual-stack recommended`,
        goodSoa
          ? `SOA refresh: ${soaRefresh}s — zone synchronisation within acceptable range`
          : `SOA refresh: ${soaRefresh}s — slow zone propagation may cause stale responses`,
      ],
      recommendation: !goodTtl
        ? `Reduce TTL to ≤300s to enable rapid failover. Add AAAA records for IPv6 clients. F5 XC DNS provides intelligent TTL management and dual-stack support by default.`
        : 'TTL configuration is healthy. Enable IPv6 if not already active. Monitor SOA refresh consistency.',
      metrics: [
        { label: 'TTL',          value: `${ttl}s` },
        { label: 'TTL Rating',   value: ttlScore === 'high' ? 'Good' : ttlScore === 'medium' ? 'Fair' : 'Poor' },
        { label: 'IPv4 Records', value: String(A.length) },
        { label: 'IPv6 Records', value: String(AAAA.length) },
      ],
    },
    responseTime: {
      findings: [
        `${A.length} A record(s) returned — ${A.length >= 4 ? 'good load distribution across IPs' : 'limited IP diversity for load balancing'}`,
        hasGeoNS
          ? `NS servers distributed geographically — reduced resolver latency across ASEAN`
          : `NS servers not geo-distributed — resolver latency may be elevated in SEA markets`,
        nsCount >= 4
          ? `${nsCount} NS servers provide redundant resolution paths — no single point of failure`
          : `Only ${nsCount} NS server(s) — limited resolution path diversity`,
      ],
      recommendation: !hasGeoNS
        ? 'Add geographically distributed NS servers. F5 XC Anycast DNS delivers <80ms p95 resolution latency across Singapore, KL, Jakarta, and Manila PoPs.'
        : 'Resolution topology is healthy. Consider F5 XC DNS for sub-80ms p95 latency guarantees across all ASEAN markets.',
      metrics: [
        { label: 'A Records',    value: String(A.length) },
        { label: 'AAAA Records', value: String(AAAA.length) },
        { label: 'NS Servers',   value: String(nsCount) },
        { label: 'Geo NS',       value: hasGeoNS ? 'Yes' : 'No' },
      ],
    },
  };

  const overall = Math.round((resScore + stabScore + rtScore) / 3);

  return {
    domain,
    scores: dimScores,
    details: dimDetails,
    overall,
    rawScore: score,
    issues,
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ScoreBadge({ score, size = 'md' }) {
  const color = scoreColor(score);
  return (
    <span className={styles[`badge${size.toUpperCase()}`]}
      style={{ color, borderColor: color + '33', background: color + '14' }}>
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
  const score  = data.scores[dim];
  const detail = data.details[dim];
  const color  = scoreColor(score);

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
              <MetricChip key={m.label} label={m.label} value={m.value} />
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DnsPage({ idToken }) {
  const [domainInput,  setDomainInput]  = useState('');
  const [isRunning,    setIsRunning]    = useState(false);
  const [error,        setError]        = useState(null);
  const [result,       setResult]       = useState(null);   // buildDnsDisplayData output
  const [rawResult,    setRawResult]    = useState(null);   // full API response
  const [activeDim,    setActiveDim]    = useState(null);

  const handleRun = async () => {
    const domain = domainInput.trim().replace(/^https?:\/\//, '');
    if (!domain) return;
    setIsRunning(true);
    setError(null);
    setResult(null);
    setActiveDim(null);
    try {
      const data = await runDnsDiscovery(domain, idToken);
      setRawResult(data);
      setResult(buildDnsDisplayData(data.domain, data.findings));
    } catch (err) {
      setError(err.message || 'Discovery failed. Please try again.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleKeyDown = e => { if (e.key === 'Enter') handleRun(); };

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
          <p className={styles.pageSubtitle}>Resilience · Stability · Response Time across ASEAN PoPs</p>
        </div>

        {/* ── Domain input + Run button ── */}
        <div className={styles.scanGroupSelector}>
          <label className={styles.selectorLabel}>Target Domain</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className={styles.selectWrap} style={{ flex: 1 }}>
              <input
                className={styles.select}
                style={{ paddingRight: 12 }}
                type="text"
                placeholder="e.g. google.com"
                value={domainInput}
                onChange={e => setDomainInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isRunning}
              />
            </div>
            <button
              onClick={handleRun}
              disabled={isRunning || !domainInput.trim()}
              style={{
                padding: '0 16px', height: 36, borderRadius: 6, border: 'none',
                background: 'var(--f5-red)', color: '#fff', fontWeight: 600,
                cursor: isRunning || !domainInput.trim() ? 'not-allowed' : 'pointer',
                opacity: isRunning || !domainInput.trim() ? 0.6 : 1,
                whiteSpace: 'nowrap', fontSize: 13,
              }}
            >
              {isRunning ? 'Running…' : 'Run Discovery'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Error state ── */}
      {error && (
        <div style={{
          margin: '16px 0', padding: '12px 16px', borderRadius: 8,
          background: '#fff0f0', border: '1px solid #fca5a5', color: '#b91c1c', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* ── Empty / prompt state ── */}
      {!result && !isRunning && !error && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <svg width="40" height="40" viewBox="0 0 15 15" fill="none" stroke="var(--f5-N400)" strokeWidth="1">
              <circle cx="7.5" cy="7.5" r="6"/><ellipse cx="7.5" cy="7.5" rx="2.6" ry="6"/>
              <line x1="1.5" y1="7.5" x2="13.5" y2="7.5"/>
            </svg>
          </div>
          <p className={styles.emptyTitle}>Enter a domain to run a DNS discovery</p>
          <p className={styles.emptySub}>Type a domain name above and click Run Discovery to see live DNS resilience findings.</p>
        </div>
      )}

      {/* ── Loading state ── */}
      {isRunning && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <svg width="40" height="40" viewBox="0 0 15 15" fill="none" stroke="var(--f5-red)" strokeWidth="1.2"
              style={{ animation: 'spin 1s linear infinite' }}>
              <circle cx="7.5" cy="7.5" r="6" strokeDasharray="20 18"/>
            </svg>
          </div>
          <p className={styles.emptyTitle}>Running DNS discovery…</p>
          <p className={styles.emptySub}>Probing {domainInput} from ASEAN vantage points</p>
        </div>
      )}

      {/* ── Results ── */}
      {result && rawResult && (
        <>
          {/* Context bar */}
          <div className={styles.contextBar}>
            <div className={styles.contextItem}>
              <span className={styles.contextDot} />
              <span className={styles.contextKey}>Domain</span>
              <span className={styles.contextVal}>{result.domain}</span>
            </div>
            <div className={styles.contextSep} />
            <div className={styles.contextItem}>
              <span className={styles.contextKey}>Probe time</span>
              <span className={styles.contextVal}>{fmtTimestamp(rawResult.completedAt)}</span>
            </div>
            <div className={styles.contextSep} />
            <div className={styles.contextItem}>
              <span className={styles.contextKey}>API Score</span>
              <span className={styles.contextVal} style={{ color: scoreColor(result.rawScore), fontWeight: 700 }}>
                {result.rawScore}
              </span>
            </div>
            <div className={styles.contextSep} />
            <div className={styles.contextItem}>
              <span className={styles.contextKey}>Issues found</span>
              <span className={styles.contextVal}>{result.issues.length}</span>
            </div>
          </div>

          {/* Issues strip */}
          {result.issues.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0 16px' }}>
              {result.issues.map(issue => (
                <div key={issue.id} style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                  background: issue.severity === 'critical' ? '#fff0f0'
                            : issue.severity === 'high'     ? '#fff7ed'
                            : issue.severity === 'medium'   ? '#fffbeb'
                            : '#f0fdf4',
                  color:      issue.severity === 'critical' ? '#b91c1c'
                            : issue.severity === 'high'     ? '#c2410c'
                            : issue.severity === 'medium'   ? '#92400e'
                            : '#166534',
                  border:     `1px solid ${
                              issue.severity === 'critical' ? '#fca5a5'
                            : issue.severity === 'high'     ? '#fed7aa'
                            : issue.severity === 'medium'   ? '#fde68a'
                            : '#bbf7d0'}`,
                }}>
                  {issue.severity.toUpperCase()} · {issue.title}
                </div>
              ))}
            </div>
          )}

          {/* Detail panel */}
          <div className={styles.body}>
            <div className={styles.detail} style={{ flex: 1 }}>
              <div className={styles.detailHeader}>
                <div>
                  <p className={styles.detailDomain}>{result.domain}</p>
                  <p className={styles.detailHint}>Click a dimension to expand findings</p>
                </div>
                <div className={styles.overallBadgeWrap}>
                  <span className={styles.overallLabel}>Overall</span>
                  <span className={styles.overallScore} style={{ color: scoreColor(result.overall) }}>
                    {result.overall}
                  </span>
                </div>
              </div>

              <div className={styles.dimensions}>
                {DIMENSION_KEYS.map(dim => (
                  <DimensionPanel
                    key={dim}
                    dim={dim}
                    data={result}
                    isActive={activeDim === dim}
                    onClick={() => setActiveDim(prev => prev === dim ? null : dim)}
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
                <a href="https://www.f5.com/cloud/products/dns"
                  target="_blank" rel="noreferrer" className={styles.promoLink}>
                  Learn more →
                </a>
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
