import { useState, useMemo } from 'react';
import { SCAN_GROUPS, ACCOUNTS, scoreColor, fmtTimestamp, daysAgo } from '../data/appData';
import styles from './DnsPage.module.css'; // reuse identical layout CSS

// ── Dimensions ────────────────────────────────────────────────────────────────
const DIMENSION_KEYS   = ['tls', 'certificate', 'performance'];
const DIMENSION_LABELS = { tls: 'TLS Security', certificate: 'Certificate', performance: 'Performance' };

// ── Derive per-domain HTTPS data ──────────────────────────────────────────────
function deriveHttpsData(scanGroup) {
  if (!scanGroup) return null;
  const base = scanGroup.pillars.https.score ?? 0;

  return scanGroup.domains.map((domain, di) => {
    const offset  = [0, -6, +8, -3][di % 4];
    const b       = Math.min(99, Math.max(30, base + offset));

    const tls         = Math.min(99, Math.max(30, b - 5 + (di * 4 % 13)));
    const certificate = Math.min(99, Math.max(30, b + 6 - (di * 3 % 7)));
    const performance = Math.min(99, Math.max(30, b + 2 + (di * 5 % 9)));

    // Derived TLS detail values — calibrated to what openssl s_client reveals
    const tlsFloor         = tls >= 85 ? 'TLS 1.3 only' : tls >= 68 ? 'TLS 1.2' : 'TLS 1.1';
    const tls13Cipher      = tls >= 80 ? 'AES-256-GCM-SHA384' : 'AES-128-GCM-SHA256';
    const chainProgression = tls >= 78 ? '2048→3072→4096' : '2048→2048→2048';
    const leafSigAlg       = tls >= 82 ? 'RSA-SHA384' : 'RSA-SHA256';
    const hsts             = tls >= 75 ? 'Full (+subdomains)' : tls >= 60 ? 'Partial' : 'None';
    const pfsCoverage      = tls >= 70 ? 'All suites' : tls >= 55 ? 'Most suites' : 'Not enforced';

    const details = {
      tls: {
        findings: [
          tls >= 85
            ? `TLS floor: TLS 1.3 only — TLS 1.2/1.1 negotiation rejected (openssl -tls1_2 returns NONE)`
            : tls >= 68
            ? `TLS floor: TLS 1.2 accepted; TLS 1.3 preferred — TLS 1.1 rejected (openssl -tls1_1 returns NONE)`
            : `TLS floor: TLS 1.1 still accepted — openssl -tls1_1 succeeds; weak cipher suites negotiable`,
          tls >= 78
            ? `Chain hardening: ${chainProgression} — intermediate and root progressively stronger than leaf`
            : `Flat chain: ${chainProgression} — all levels use 2048-bit RSA; no progressive hardening`,
          tls >= 75
            ? `HSTS enforced: max-age=31536000; includeSubDomains — full downgrade protection`
            : tls >= 60
            ? `HSTS present but missing includeSubDomains — subdomain downgrade possible`
            : `HSTS header absent — HTTP downgrade and MITM attacks not mitigated`,
          tls >= 70
            ? `PFS: ${pfsCoverage} — ECDHE key exchange confirmed via openssl cipher enumeration`
            : `PFS gap: RSA static key exchange still negotiable — session keys not ephemeral`,
          tls >= 80
            ? `TLS 1.3 cipher: ${tls13Cipher} — 256-bit AES with SHA-384 (stronger than 128-bit baseline)`
            : `TLS 1.3 cipher: ${tls13Cipher} — 128-bit AES; adequate but not optimal for sensitive endpoints`,
        ],
        recommendation: tls < 68
          ? `Immediate: disable TLS 1.1 in ssl_protocols. Remove static RSA key exchange. Add HSTS with includeSubDomains. F5 XC enforces TLS 1.3-preferred with a single policy change.`
          : tls < 80
          ? `Enforce TLS 1.3-only on API subdomains. Add HSTS preload. Upgrade CA chain for progressive hardening. F5 XC auto-cert handles chain management automatically.`
          : `Submit HSTS to browser preload list. Consider TLS 1.3-only on all endpoints. F5 XC WAF enforces cipher policy centrally — no per-origin config required.`,
        metrics: [
          { label: 'TLS floor',      value: tlsFloor,         unit: '' },
          { label: 'TLS 1.3 cipher', value: tls13Cipher,      unit: '' },
          { label: 'Chain keys',     value: chainProgression, unit: '' },
          { label: 'Leaf sig alg',   value: leafSigAlg,       unit: '' },
          { label: 'HSTS',           value: hsts,             unit: '' },
          { label: 'PFS',            value: pfsCoverage,      unit: '' },
        ],
      },
      certificate: {
        findings: [
          certificate >= 80 ? `Certificate valid — expires in ${Math.round(30 + (certificate - 80) * 3)} days`
                            : certificate >= 60 ? `Certificate expires in ${Math.round(10 + (certificate - 60))} days — renewal recommended`
                            : 'Certificate expires in < 7 days — CRITICAL: immediate renewal required',
          certificate >= 75 ? 'Issued by trusted CA (Let\'s Encrypt / DigiCert) — full chain present'
                            : 'Intermediate chain incomplete — may cause mobile client failures',
          certificate >= 70 ? 'Subject Alternative Names (SANs) cover all probed subdomains'
                            : 'SANs missing for 1 subdomain — browser warning expected',
        ],
        recommendation: certificate < 70
          ? 'Renew certificate immediately and automate renewal via ACME/Let\'s Encrypt. Configure F5 XC auto-cert to eliminate manual renewal risk.'
          : 'Automate certificate lifecycle with F5 XC auto-cert. Set renewal alerts at 30 and 14 days.',
        metrics: [
          { label: 'Days to Expiry', value: certificate >= 80 ? `${Math.round(30 + (certificate-80)*3)}d` : certificate >= 60 ? `${Math.round(10+(certificate-60))}d` : '<7d', unit: '' },
          { label: 'CA',             value: certificate >= 70 ? 'Trusted' : 'Issue', unit: '' },
          { label: 'Full Chain',     value: certificate >= 75 ? 'Yes' : 'No',    unit: '' },
          { label: 'SANs Match',     value: certificate >= 70 ? 'Yes' : 'No',    unit: '' },
        ],
      },
      performance: {
        findings: [
          `TTFB from Singapore PoP: ${Math.round(80 + (100 - performance) * 1.2)}ms (curl -v timing; target <200ms for ASEAN)`,
          performance >= 75
            ? `HTTP/2 negotiated — ALPN confirmed h2 in curl handshake; multiplexing and header compression active`
            : `HTTP/1.1 only — curl ALPN shows no h2 agreement; server did not offer HTTP/2`,
          performance >= 70
            ? `Brotli compression active — avg 68% size reduction on text assets`
            : performance >= 55
            ? `Gzip compression active but Brotli not enabled — 10–20% additional savings possible`
            : `No compression detected — uncompressed payloads inflate TTFB and transfer time`,
          performance >= 72
            ? `Session resumption: TLS 1.3 session tickets offered — reconnect handshake savings available`
            : `Session resumption: no reuse detected (openssl -reconnect shows all ‘New’ sessions) — each connection pays full handshake cost`,
        ],
        recommendation: performance < 70
          ? `Enable HTTP/2 and Brotli. Reduce TTFB by fronting with F5 XC CDN — Singapore, KL, Jakarta, and Manila PoPs deliver <80ms TTFB across ASEAN. Enable TLS session tickets for resumption savings.`
          : `Enable TLS session ticket resumption to reduce reconnect overhead. Consider HTTP/3 (QUIC) for mobile clients in PH/ID with high-latency last-mile. F5 XC CDN targets <100ms TTFB across all ASEAN PoPs.`,
        metrics: [
          { label: 'TTFB (SG)',       value: `${Math.round(80+(100-performance)*1.2)}ms`, unit: '' },
          { label: 'HTTP ver',        value: performance >= 75 ? 'HTTP/2' : 'HTTP/1.1',   unit: '' },
          { label: 'Compression',     value: performance >= 70 ? 'Brotli' : performance >= 55 ? 'Gzip' : 'None', unit: '' },
          { label: 'Session reuse',   value: performance >= 72 ? 'Yes' : 'No',             unit: '' },
        ],
      },
    };

    return { domain, scores: { tls, certificate, performance }, details, overall: Math.round((tls + certificate + performance) / 3) };
  });
}

// ── Sub-components (same as DnsPage pattern) ──────────────────────────────────
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
            {detail.metrics.map(m => <MetricChip key={m.label} label={m.label} value={`${m.value}${m.unit}`} />)}
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
            <span className={styles.domainDimScore} style={{ color: scoreColor(data.scores[dim]) }}>{data.scores[dim]}</span>
          </div>
        ))}
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function HttpsPage() {
  const completedGroups = SCAN_GROUPS.filter(g => g.pillars.https.status === 'Completed');
  const [selectedGroupId, setSelectedGroupId] = useState(completedGroups[0]?.id ?? null);
  const [selectedDomainIdx, setSelectedDomainIdx] = useState(0);
  const [activeDim, setActiveDim] = useState(null);

  const selectedGroup = SCAN_GROUPS.find(g => g.id === selectedGroupId);
  const account       = ACCOUNTS.find(a => a.id === selectedGroup?.accountId);
  const httpsData     = useMemo(() => deriveHttpsData(selectedGroup), [selectedGroup]);
  const domainData    = httpsData?.[selectedDomainIdx] ?? null;
  const overallScore  = selectedGroup?.pillars.https.score;

  const handleGroupChange = (id) => { setSelectedGroupId(id); setSelectedDomainIdx(0); setActiveDim(null); };
  const handleDomainSelect = (idx) => { setSelectedDomainIdx(idx); setActiveDim(null); };
  const handleDimClick = (dim) => setActiveDim(prev => prev === dim ? null : dim);

  if (completedGroups.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <svg width="40" height="40" viewBox="0 0 15 15" fill="none" stroke="var(--f5-N400)" strokeWidth="1">
              <rect x="3" y="6.5" width="9" height="7" rx="1"/>
              <path d="M5 6.5V4.5a2.5 2.5 0 0 1 5 0v2"/>
            </svg>
          </div>
          <p className={styles.emptyTitle}>No completed HTTPS probes</p>
          <p className={styles.emptySub}>Run a new probe from the Dashboard to see HTTPS results here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div className={styles.pillarBadge}>
            <svg width="16" height="16" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="3" y="6.5" width="9" height="7" rx="1"/>
              <path d="M5 6.5V4.5a2.5 2.5 0 0 1 5 0v2"/>
              <circle cx="7.5" cy="10" r="1" fill="currentColor" stroke="none"/>
            </svg>
            HTTPS
          </div>
          <h1 className={styles.pageTitle}>HTTPS Resilience Report</h1>
          <p className={styles.pageSubtitle}>TLS Security · Certificate Health · Performance across ASEAN PoPs</p>
        </div>
        <div className={styles.scanGroupSelector}>
          <label className={styles.selectorLabel}>Probe Group</label>
          <div className={styles.selectWrap}>
            <select className={styles.select} value={selectedGroupId ?? ''} onChange={e => handleGroupChange(e.target.value)}>
              {completedGroups.map(sg => {
                const acct = ACCOUNTS.find(a => a.id === sg.accountId);
                return <option key={sg.id} value={sg.id}>{sg.name} — {acct?.name}</option>;
              })}
            </select>
            <span className={styles.selectChevron}>
              <svg width="12" height="12" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5l4.5 4.5L12 5"/></svg>
            </span>
          </div>
        </div>
      </div>

      {/* Context bar */}
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
            <span className={styles.contextKey}>Overall HTTPS Score</span>
            <span className={styles.contextVal} style={{ color: scoreColor(overallScore), fontWeight: 700 }}>{overallScore}</span>
          </div>
        </div>
      )}

      {/* Body */}
      <div className={styles.body}>
        <div className={styles.domainList}>
          <p className={styles.panelHeading}>Domains</p>
          {httpsData?.map((d, idx) => (
            <DomainCard key={d.domain} data={d} isSelected={idx === selectedDomainIdx} onClick={() => handleDomainSelect(idx)} />
          ))}
        </div>
        {domainData && (
          <div className={styles.detail}>
            <div className={styles.detailHeader}>
              <div>
                <p className={styles.detailDomain}>{domainData.domain}</p>
                <p className={styles.detailHint}>Click a dimension to expand findings</p>
              </div>
              <div className={styles.overallBadgeWrap}>
                <span className={styles.overallLabel}>Overall</span>
                <span className={styles.overallScore} style={{ color: scoreColor(domainData.overall) }}>{domainData.overall}</span>
              </div>
            </div>
            <div className={styles.dimensions}>
              {DIMENSION_KEYS.map(dim => (
                <DimensionPanel key={dim} dim={dim} data={domainData} isActive={activeDim === dim} onClick={() => handleDimClick(dim)} />
              ))}
            </div>
            <div className={styles.promoStrip}>
              <div className={styles.promoIcon}>
                <svg width="18" height="18" viewBox="0 0 15 15" fill="none" stroke="var(--f5-blue)" strokeWidth="1.4">
                  <rect x="3" y="6.5" width="9" height="7" rx="1"/>
                  <path d="M5 6.5V4.5a2.5 2.5 0 0 1 5 0v2"/>
                </svg>
              </div>
              <div className={styles.promoText}>
                <strong>F5 Distributed Cloud (XC) WAF + Auto-Cert</strong> enforces TLS 1.3, automates certificate renewal, and accelerates HTTPS delivery with sub-100ms TTFB across all ASEAN PoPs.
              </div>
              <a href="https://www.f5.com/cloud/products/bot-defense" target="_blank" rel="noreferrer" className={styles.promoLink}>Learn more →</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
