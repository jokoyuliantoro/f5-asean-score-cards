import { useState } from 'react';
import { runHttpsDiscovery } from '../api/discovery';
import { scoreColor, fmtTimestamp } from '../data/appData';
import styles from './DnsPage.module.css'; // reuse identical layout CSS

// ── Dimensions ────────────────────────────────────────────────────────────────
const DIMENSION_KEYS   = ['tls', 'certificate', 'performance'];
const DIMENSION_LABELS = { tls: 'TLS Security', certificate: 'Certificate', performance: 'Performance' };

/**
 * Map raw HTTPS API findings → display data for the three dimensions.
 * Field names match the actual https_discovery Lambda response exactly.
 */
function buildHttpsDisplayData(domain, findings) {
  const {
    score        = 0,
    issues       = [],
    // TLS
    tlsVersion,                         // e.g. "TLSv1.3"
    tlsScore,                           // "high" | "medium" | "low"
    cipher,                             // e.g. "TLS_AES_256_GCM_SHA384"
    hsts,                               // header value string e.g. "max-age=31536000"
    hstsPresent  = false,
    cspPresent   = false,
    // Certificate
    certDaysLeft = 90,
    certExpired  = false,
    certIssuer,                         // object: { commonName, organizationName, ... }
    certSANs     = [],
    certSubject,                        // object: { commonName, ... }
    certExpiry,
    // Performance / headers
    httpVersion,                        // "HTTP/2" or "HTTP/1.1"
    alpn,                               // "h2" etc.
    httpStatusCode,
    httpRedirectsToHttps = false,
    port80Open   = false,
    server,
  } = findings;

  // ── TLS score ─────────────────────────────────────────────────────────────
  const hasTls13    = tlsVersion === 'TLSv1.3';
  const tlsIsHigh   = tlsScore === 'high';
  const hstsMaxAge  = hsts ? parseInt((hsts.match(/max-age=(\d+)/) || [])[1] || '0') : 0;
  const hstsStrong  = hstsPresent && hstsMaxAge >= 31536000;
  const hstsPartial = hstsPresent && hstsMaxAge > 0 && hstsMaxAge < 31536000;
  const hasHstsSubs = hsts ? hsts.includes('includeSubDomains') : false;

  const tlsDimScore = Math.min(99, Math.round(
    (hasTls13    ? 40 : 20) +
    (tlsIsHigh   ? 15 :  0) +
    (hstsStrong  ? 25 : hstsPartial ? 12 : 0) +
    (hasHstsSubs ? 10 :  0) +
    (cspPresent  ?  5 :  0)
  ));

  // ── Certificate score ─────────────────────────────────────────────────────
  const issuerName  = certIssuer?.commonName || certIssuer?.organizationName || 'Unknown';
  const subjectCN   = certSubject?.commonName || domain;
  const certOk      = !certExpired && certDaysLeft > 30;
  const certWarning = !certExpired && certDaysLeft > 7 && certDaysLeft <= 30;

  const certDimScore = Math.min(99, Math.round(
    (certOk       ? 50 : certWarning ? 25 : 5) +
    (certDaysLeft > 60 ? 20 : certDaysLeft > 14 ? 10 : 0) +
    (certSANs.length > 0 ? 15 : 0) +
    10
  ));

  // ── Performance score ─────────────────────────────────────────────────────
  const isHttp2      = httpVersion === 'HTTP/2' || alpn === 'h2';
  const httpsRedirect = httpRedirectsToHttps === true;
  const port80Closed  = port80Open === false;

  const perfDimScore = Math.min(99, Math.round(
    (isHttp2       ? 45 : 15) +
    (httpsRedirect ? 25 :  0) +
    (port80Closed  ? 15 :  0) +
    (httpStatusCode === 200 ? 10 : 0)
  ));

  const dimScores = { tls: tlsDimScore, certificate: certDimScore, performance: perfDimScore };

  const dimDetails = {
    tls: {
      findings: [
        hasTls13
          ? `TLS 1.3 negotiated — strongest protocol version confirmed (${cipher})`
          : `TLS 1.3 not detected — ${tlsVersion || 'older protocol'} in use; upgrade recommended`,
        hstsStrong
          ? `HSTS enforced — max-age=${hstsMaxAge}${hasHstsSubs ? '; includeSubDomains active' : ' (subdomains not yet covered)'}`
          : hstsPartial
          ? `HSTS present but weak — max-age=${hstsMaxAge}s; recommended ≥31536000 (1 year)`
          : 'HSTS header absent — HTTP downgrade and MITM attacks not mitigated',
        cspPresent
          ? 'Content Security Policy header present — XSS injection attack surface reduced'
          : 'No Content-Security-Policy header — XSS and content injection risks not mitigated',
        cipher
          ? `Active cipher: ${cipher}`
          : 'Cipher suite details unavailable',
      ],
      recommendation: !hasTls13
        ? 'Enforce TLS 1.3 and disable TLS 1.0/1.1. Add HSTS with includeSubDomains. F5 XC enforces TLS 1.3-preferred policy centrally — no per-origin config required.'
        : !hstsStrong
        ? 'Strengthen HSTS: set max-age ≥31536000 and add includeSubDomains. F5 XC WAF injects HSTS headers automatically at the edge.'
        : !hasHstsSubs
        ? 'Add includeSubDomains to HSTS header to prevent subdomain downgrade attacks. Consider submitting to browser HSTS preload list.'
        : 'TLS posture is strong. Consider adding X-Content-Type-Options and Referrer-Policy headers for defence-in-depth.',
      metrics: [
        { label: 'TLS Version', value: tlsVersion || 'Unknown' },
        { label: 'TLS Rating',  value: tlsScore === 'high' ? 'High' : tlsScore === 'medium' ? 'Medium' : 'Low' },
        { label: 'HSTS',        value: hstsStrong ? 'Strong' : hstsPartial ? 'Weak' : 'None' },
        { label: 'CSP',         value: cspPresent ? 'Present' : 'Missing' },
      ],
    },
    certificate: {
      findings: [
        certOk
          ? `Certificate valid — ${certDaysLeft} days remaining${certExpiry ? ` (expires ${certExpiry})` : ''}`
          : certWarning
          ? `Certificate expires in ${certDaysLeft} days — renewal recommended urgently`
          : certExpired
          ? 'CRITICAL: Certificate has expired — all users see browser security warning'
          : `Certificate expires in ${certDaysLeft} days — renew immediately`,
        `Issued by: ${issuerName}`,
        `Common name: ${subjectCN}`,
        certSANs.length > 0
          ? `${certSANs.length} Subject Alternative Names — covers: ${certSANs.slice(0, 3).join(', ')}${certSANs.length > 3 ? ` +${certSANs.length - 3} more` : ''}`
          : 'No SANs found — single-domain certificate only',
      ],
      recommendation: certExpired
        ? 'Certificate has expired — renew immediately. F5 XC auto-cert eliminates manual renewal risk entirely via automated ACME.'
        : certDaysLeft <= 30
        ? 'Renew certificate within the next week. F5 XC auto-cert handles the full lifecycle without manual intervention.'
        : 'Set automated renewal alerts at 30 and 14 days. F5 XC auto-cert rotates certificates automatically before expiry.',
      metrics: [
        { label: 'Days to Expiry', value: `${certDaysLeft}d` },
        { label: 'Status',         value: certExpired ? 'EXPIRED' : certOk ? 'Valid' : 'Expiring soon' },
        { label: 'SANs',           value: String(certSANs.length) },
        { label: 'Issuer',         value: issuerName.split(' ').slice(0, 2).join(' ') },
      ],
    },
    performance: {
      findings: [
        isHttp2
          ? 'HTTP/2 active — multiplexing and header compression confirmed via ALPN'
          : 'HTTP/1.1 only — no HTTP/2; head-of-line blocking affects ASEAN high-latency markets',
        httpsRedirect
          ? 'Port 80 redirects to HTTPS — HTTP traffic correctly upgraded'
          : port80Open
          ? 'Port 80 open but does NOT redirect to HTTPS — plaintext HTTP accessible; HSTS bypass possible'
          : 'Port 80 closed — all traffic forced through HTTPS',
        httpStatusCode === 200
          ? `HTTP ${httpStatusCode} — endpoint responding normally`
          : `HTTP ${httpStatusCode} — non-200 status; verify endpoint health`,
        server
          ? `Server header: ${server} — fingerprint exposed`
          : 'Server header not exposed — good for reducing attack surface fingerprint',
      ],
      recommendation: !isHttp2
        ? 'Enable HTTP/2 immediately — critical for ASEAN markets with higher base latency. F5 XC CDN delivers HTTP/2 and HTTP/3 by default with <100ms TTFB across SG, KL, JKT, MNL PoPs.'
        : port80Open && !httpsRedirect
        ? 'Configure HTTP → HTTPS redirect on port 80. Plaintext HTTP remains accessible — this is a HIGH severity finding. F5 XC HTTP Load Balancer enforces HTTPS redirect at the edge automatically.'
        : 'Performance posture is good. Consider HTTP/3 (QUIC) for mobile clients in PH/ID with high-latency last-mile connections.',
      metrics: [
        { label: 'HTTP Version', value: isHttp2 ? 'HTTP/2' : 'HTTP/1.1' },
        { label: 'ALPN',         value: alpn || 'None' },
        { label: 'HTTP→HTTPS',   value: httpsRedirect ? 'Yes' : port80Open ? 'No ⚠' : 'N/A' },
        { label: 'Status',       value: String(httpStatusCode || '—') },
      ],
    },
  };

  const overall = Math.round((tlsDimScore + certDimScore + perfDimScore) / 3);
  return { domain, scores: dimScores, details: dimDetails, overall, rawScore: score, issues };
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
            {detail.metrics.map(m => <MetricChip key={m.label} label={m.label} value={m.value} />)}
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

// ── Main component ────────────────────────────────────────────────────────────

export default function HttpsPage({ idToken }) {
  const [domainInput, setDomainInput] = useState('');
  const [isRunning,   setIsRunning]   = useState(false);
  const [error,       setError]       = useState(null);
  const [result,      setResult]      = useState(null);
  const [rawResult,   setRawResult]   = useState(null);
  const [activeDim,   setActiveDim]   = useState(null);

  const handleRun = async () => {
    const domain = domainInput.trim().replace(/^https?:\/\//, '');
    if (!domain) return;
    setIsRunning(true);
    setError(null);
    setResult(null);
    setActiveDim(null);
    try {
      const data = await runHttpsDiscovery(domain, idToken);
      setRawResult(data);
      setResult(buildHttpsDisplayData(data.domain, data.findings));
    } catch (err) {
      setError(err.message || 'Discovery failed. Please try again.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleKeyDown = e => { if (e.key === 'Enter') handleRun(); };

  return (
    <div className={styles.page}>
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
          <label className={styles.selectorLabel}>Target Domain</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className={styles.selectWrap} style={{ flex: 1 }}>
              <input
                className={styles.select}
                style={{ paddingRight: 12 }}
                type="text"
                placeholder="e.g. f5.com"
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

      {error && (
        <div style={{
          margin: '16px 0', padding: '12px 16px', borderRadius: 8,
          background: '#fff0f0', border: '1px solid #fca5a5', color: '#b91c1c', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {!result && !isRunning && !error && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <svg width="40" height="40" viewBox="0 0 15 15" fill="none" stroke="var(--f5-N400)" strokeWidth="1">
              <rect x="3" y="6.5" width="9" height="7" rx="1"/>
              <path d="M5 6.5V4.5a2.5 2.5 0 0 1 5 0v2"/>
            </svg>
          </div>
          <p className={styles.emptyTitle}>Enter a domain to run an HTTPS discovery</p>
          <p className={styles.emptySub}>Type a domain name above and click Run Discovery to see live TLS and performance findings.</p>
        </div>
      )}

      {isRunning && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <svg width="40" height="40" viewBox="0 0 15 15" fill="none" stroke="var(--f5-red)" strokeWidth="1.2"
              style={{ animation: 'spin 1s linear infinite' }}>
              <circle cx="7.5" cy="7.5" r="6" strokeDasharray="20 18"/>
            </svg>
          </div>
          <p className={styles.emptyTitle}>Running HTTPS discovery…</p>
          <p className={styles.emptySub}>Probing TLS, certificates, and performance for {domainInput}</p>
        </div>
      )}

      {result && rawResult && (
        <>
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

          {result.issues.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0 16px' }}>
              {result.issues.map(issue => (
                <div key={issue.id} style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                  background: issue.severity === 'critical' ? '#fff0f0'
                            : issue.severity === 'high'     ? '#fff7ed'
                            : issue.severity === 'medium'   ? '#fffbeb' : '#f0fdf4',
                  color:      issue.severity === 'critical' ? '#b91c1c'
                            : issue.severity === 'high'     ? '#c2410c'
                            : issue.severity === 'medium'   ? '#92400e' : '#166534',
                  border:     `1px solid ${
                              issue.severity === 'critical' ? '#fca5a5'
                            : issue.severity === 'high'     ? '#fed7aa'
                            : issue.severity === 'medium'   ? '#fde68a' : '#bbf7d0'}`,
                }}>
                  {issue.severity.toUpperCase()} · {issue.title}
                </div>
              ))}
            </div>
          )}

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
                    key={dim} dim={dim} data={result}
                    isActive={activeDim === dim}
                    onClick={() => setActiveDim(prev => prev === dim ? null : dim)}
                  />
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
                  <strong>F5 Distributed Cloud (XC) WAF + Auto-Cert</strong> enforces TLS 1.3,
                  automates certificate renewal, and accelerates HTTPS delivery with sub-100ms TTFB
                  across all ASEAN PoPs.
                </div>
                <a href="https://www.f5.com/cloud/products/bot-defense"
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
