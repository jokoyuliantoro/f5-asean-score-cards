import { useState, useMemo } from 'react';
import { SCAN_GROUPS, ACCOUNTS, scoreColor, fmtTimestamp, daysAgo } from '../data/appData';
import styles from './LifecyclePage.module.css';

// ── Pillar config ─────────────────────────────────────────────────────────────
const PILLAR_CONFIG = {
  dns: {
    key:       'dns',
    label:     'DNS Probe',
    color:     'var(--f5-blue)',
    colorLight:'var(--f5-blue-light)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="7.5" cy="7.5" r="6"/><ellipse cx="7.5" cy="7.5" rx="2.6" ry="6"/>
        <line x1="1.5" y1="7.5" x2="13.5" y2="7.5"/>
        <line x1="2"   y1="4.5" x2="13"   y2="4.5"/>
        <line x1="2"   y1="10.5" x2="13"  y2="10.5"/>
      </svg>
    ),
    promoText: 'F5 Distributed Cloud Anycast DNS delivers sub-80ms resolution across ASEAN with built-in DNSSEC, geo-steering, and automatic failover.',
  },
  https: {
    key:       'https',
    label:     'HTTPS Probe',
    color:     'var(--f5-blue)',
    colorLight:'var(--f5-blue-light)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="6.5" width="9" height="7" rx="1"/>
        <path d="M5 6.5V4.5a2.5 2.5 0 0 1 5 0v2"/>
        <circle cx="7.5" cy="10" r="1" fill="currentColor" stroke="none"/>
      </svg>
    ),
    promoText: 'F5 XC WAF + Auto-Cert eliminates TLS misconfigurations, automates certificate renewal, and accelerates HTTPS delivery globally.',
  },
  surfaceScan: {
    key:       'surfaceScan',
    label:     'Surface Probe',
    color:     'var(--f5-pomegranate)',
    colorLight:'var(--f5-pomegranate-light)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="6.5" cy="6.5" r="4"/><line x1="9.5" y1="9.5" x2="13" y2="13"/>
      </svg>
    ),
    promoText: 'F5 XC WAF + Bot Defense closes the attack surface exposure detected by surface probes — headers, exposed ports, and OWASP compliance in a single policy.',
  },
  deepScan: {
    key:       'deepScan',
    label:     'Deep Probe',
    color:     'var(--f5-purple)',
    colorLight:'var(--f5-purple-light)',
    icon: (
      <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="6.5" cy="6.5" r="4"/><line x1="9.5" y1="9.5" x2="13" y2="13"/>
        <circle cx="6.5" cy="6.5" r="1.8" strokeDasharray="2 1.5"/>
      </svg>
    ),
    promoText: 'F5 XC WAAP (WAF + API Security + Bot Defense + DDoS) remediates the authenticated vulnerabilities found in deep probes with zero-touch policy enforcement.',
  },
};

// ── Build scan history for a pillar from SCAN_GROUPS ─────────────────────────
function buildHistory(pillarKey) {
  return SCAN_GROUPS
    .filter(g => g.pillars[pillarKey]?.status !== 'Queued')
    .map(g => {
      const acct    = ACCOUNTS.find(a => a.id === g.accountId);
      const pillar  = g.pillars[pillarKey];
      return {
        id:        g.id,
        name:      g.name,
        account:   acct?.name ?? '—',
        accountId: g.accountId,
        domains:   g.domains,
        createdAt: g.createdAt,
        score:     pillar?.score ?? null,
        status:    pillar?.status ?? '—',
        detail:    pillar?.detail ?? null,
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Build a fake trend series for a scan group (deterministic from score + index)
function buildTrend(score, idx) {
  if (!score) return [];
  const s = score;
  // 6 synthetic historical data points ending at current score
  return [
    { label: 'T-150d', value: Math.min(99, Math.max(20, s - 18 + (idx * 7 % 15))) },
    { label: 'T-120d', value: Math.min(99, Math.max(20, s - 13 + (idx * 5 % 11))) },
    { label: 'T-90d',  value: Math.min(99, Math.max(20, s - 9  + (idx * 3 % 9)))  },
    { label: 'T-60d',  value: Math.min(99, Math.max(20, s - 6  + (idx * 2 % 7)))  },
    { label: 'T-30d',  value: Math.min(99, Math.max(20, s - 3  + (idx * 1 % 5)))  },
    { label: 'Now',    value: s },
  ];
}

// ── SVG sparkline ─────────────────────────────────────────────────────────────
function Sparkline({ points, color, width = 120, height = 36 }) {
  if (!points || points.length < 2) return null;
  const min = Math.min(...points.map(p => p.value));
  const max = Math.max(...points.map(p => p.value));
  const range = (max - min) || 10;
  const pad   = 4;
  const xs    = points.map((_, i) => pad + (i / (points.length - 1)) * (width - pad * 2));
  const ys    = points.map(p => pad + (1 - (p.value - min) / range) * (height - pad * 2));
  const d     = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const fill  = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
              + ` L${xs[xs.length-1].toFixed(1)},${height} L${xs[0].toFixed(1)},${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={`sg-${color?.replace(/[^a-z]/g,'')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.18"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#sg-${color?.replace(/[^a-z]/g,'')})`}/>
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={xs[xs.length-1]} cy={ys[ys.length-1]} r="3" fill={color}/>
    </svg>
  );
}

// ── Status chip ───────────────────────────────────────────────────────────────
function StatusChip({ status }) {
  const map = {
    'Completed':      { bg: 'var(--f5-green-light)',           color: '#1a7a3a'               },
    'In Progress':    { bg: 'var(--f5-amber-light)',           color: '#8a6000'               },
    'Failed':         { bg: 'var(--f5-pomegranate-light)',     color: 'var(--f5-pomegranate)' },
    'Not Configured': { bg: 'var(--f5-N200)',                  color: 'var(--f5-N500)'        },
  };
  const m = map[status] || map['Not Configured'];
  return <span className={styles.statusChip} style={{ background: m.bg, color: m.color }}>{status}</span>;
}

// ── Trend chart (bar-based, pure CSS/SVG) ────────────────────────────────────
function TrendChart({ points, color }) {
  if (!points || points.length === 0) return <span className={styles.noTrend}>No trend data</span>;
  return (
    <div className={styles.trendChart}>
      {points.map((p, i) => {
        const c = scoreColor(p.value);
        return (
          <div key={i} className={styles.trendBar}>
            <div className={styles.trendBarTrack}>
              <div className={styles.trendBarFill} style={{ height: `${p.value}%`, background: c }} />
            </div>
            <span className={styles.trendBarValue} style={{ color: c }}>{p.value}</span>
            <span className={styles.trendBarLabel}>{p.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function LifecyclePage({ pillar }) {
  const cfg     = PILLAR_CONFIG[pillar] ?? PILLAR_CONFIG.dns;
  const history = useMemo(() => buildHistory(cfg.key), [cfg.key]);
  const [selectedId, setSelectedId] = useState(history[0]?.id ?? null);

  const selected = history.find(h => h.id === selectedId);
  const trend    = selected ? buildTrend(selected.score, history.indexOf(selected)) : [];

  // Aggregate stats
  const completed  = history.filter(h => h.status === 'Completed').length;
  const avgScore   = completed
    ? Math.round(history.filter(h => h.score).reduce((a, b) => a + b.score, 0) / completed)
    : null;
  const bestScore  = history.filter(h => h.score).reduce((best, h) => h.score > (best?.score ?? 0) ? h : best, null);
  const worstScore = history.filter(h => h.score).reduce((w, h) => h.score < (w?.score ?? 999) ? h : w, null);

  if (history.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>{cfg.icon}</div>
          <p className={styles.emptyTitle}>No {cfg.label} history yet</p>
          <p className={styles.emptySub}>Completed probes will appear here with score trends and comparison data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Page header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div className={styles.pillarBadge} style={{ color: cfg.color, background: cfg.colorLight, borderColor: 'transparent' }}>
            {cfg.icon}
            {cfg.label}
          </div>
          <h1 className={styles.pageTitle}>{cfg.label} · Score Lifecycle</h1>
          <p className={styles.pageSubtitle}>Historical score trends and comparison across all probe groups</p>
        </div>
      </div>

      {/* Summary strip */}
      <div className={styles.summaryStrip}>
        {[
          { label: 'Probe Groups',   value: history.length,                              color: 'var(--f5-N600)' },
          { label: 'Completed',     value: completed,                                   color: '#1a7a3a'        },
          { label: 'Avg Score',     value: avgScore ?? '—',                             color: scoreColor(avgScore) },
          { label: 'Best Score',    value: bestScore  ? `${bestScore.score} (${bestScore.name})`   : '—', color: scoreColor(bestScore?.score)  },
          { label: 'Lowest Score',  value: worstScore ? `${worstScore.score} (${worstScore.name})` : '—', color: scoreColor(worstScore?.score) },
        ].map(s => (
          <div key={s.label} className={styles.summaryItem}>
            <span className={styles.summaryLabel}>{s.label}</span>
            <span className={styles.summaryValue} style={{ color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Main layout: list + detail */}
      <div className={styles.body}>
        {/* Left: scan group list */}
        <div className={styles.scanList}>
          <p className={styles.panelHeading}>Probe Groups</p>
          {history.map(h => {
            const isActive = h.id === selectedId;
            const sc = scoreColor(h.score);
            const t  = buildTrend(h.score, history.indexOf(h));
            return (
              <button
                key={h.id}
                className={[styles.scanCard, isActive ? styles.scanCardActive : ''].join(' ')}
                onClick={() => setSelectedId(h.id)}
                style={{ '--card-color': sc }}
              >
                <div className={styles.scanCardTop}>
                  <div>
                    <p className={styles.scanCardName}>{h.name}</p>
                    <p className={styles.scanCardAcct}>{h.account}</p>
                  </div>
                  <div className={styles.scanCardRight}>
                    {h.score
                      ? <span className={styles.scanCardScore} style={{ color: sc }}>{h.score}</span>
                      : <StatusChip status={h.status} />
                    }
                  </div>
                </div>
                {h.score && (
                  <div className={styles.scanCardSparkline}>
                    <Sparkline points={t} color={sc} width={100} height={28} />
                  </div>
                )}
                <div className={styles.scanCardMeta}>
                  <span>{daysAgo(h.createdAt)}</span>
                  <span>{h.domains.length} domain{h.domains.length !== 1 ? 's' : ''}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right: detail */}
        {selected && (
          <div className={styles.detail}>
            {/* Header */}
            <div className={styles.detailHeader}>
              <div>
                <p className={styles.detailTitle}>{selected.name}</p>
                <p className={styles.detailMeta}>{selected.account} · {fmtTimestamp(selected.createdAt)} · {daysAgo(selected.createdAt)}</p>
              </div>
              <div className={styles.detailScoreWrap}>
                <span className={styles.detailScoreLabel}>Score</span>
                <span className={styles.detailScore} style={{ color: scoreColor(selected.score) }}>
                  {selected.score ?? '—'}
                </span>
                <StatusChip status={selected.status} />
              </div>
            </div>

            {/* Domains */}
            <div className={styles.card}>
              <p className={styles.cardTitle}>Domains Probed</p>
              <div className={styles.domainTags}>
                {selected.domains.map(d => (
                  <span key={d} className={styles.domainTag}>{d}</span>
                ))}
              </div>
            </div>

            {/* Score trend chart */}
            {selected.score && (
              <div className={styles.card}>
                <p className={styles.cardTitle}>Score Trend (Synthetic History)</p>
                <p className={styles.cardSub}>Illustrative trend derived from current score — connect a live API to show real history</p>
                <TrendChart points={trend} color={scoreColor(selected.score)} />
              </div>
            )}

            {/* Comparison table */}
            <div className={styles.card}>
              <p className={styles.cardTitle}>All Probe Groups — {cfg.label} Comparison</p>
              <div className={styles.compHead}>
                <span>Probe Group</span><span>Account</span><span>Score</span><span>Status</span><span>Age</span>
              </div>
              {history.map((h, i) => {
                const sc   = scoreColor(h.score);
                const isMe = h.id === selectedId;
                return (
                  <button
                    key={h.id}
                    className={[styles.compRow, isMe ? styles.compRowActive : '', i % 2 === 0 ? styles.compRowAlt : ''].join(' ')}
                    onClick={() => setSelectedId(h.id)}
                  >
                    <span className={styles.compName}>{h.name}</span>
                    <span className={styles.compAcct}>{h.account}</span>
                    <span>
                      {h.score
                        ? <span className={styles.compScore} style={{ color: sc }}>{h.score}</span>
                        : <span className={styles.compScoreNull}>—</span>
                      }
                    </span>
                    <StatusChip status={h.status} />
                    <span className={styles.compAge}>{daysAgo(h.createdAt)}</span>
                  </button>
                );
              })}
            </div>

            {/* F5 promo */}
            <div className={styles.promoStrip}>
              <div className={styles.promoIcon} style={{ background: cfg.colorLight, color: cfg.color }}>
                {cfg.icon}
              </div>
              <p className={styles.promoText}><strong style={{ color: cfg.color }}>F5 Distributed Cloud</strong> — {cfg.promoText}</p>
              <a href="https://www.f5.com/cloud" target="_blank" rel="noreferrer" className={styles.promoLink}>Learn more →</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
