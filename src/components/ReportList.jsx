import { useState } from 'react';
import { SCAN_GROUPS, ACCOUNTS, fmtTimestamp, daysAgo, scoreColor } from '../data/appData';
import styles from './ReportList.module.css';

const PAGE_SIZE = 3;

const PILLAR_LABELS = {
  dns:         'DNS Probe',
  https:       'HTTPS Probe',
  surfaceScan: 'Surface Probe',
  deepScan:    'Deep Probe',
};

const PILLAR_DESCS = {
  dns:         'Resilience · Stability · Response Time',
  https:       'IP Anycast · TLS · TTFB',
  surfaceScan: 'Public endpoints · No credentials required',
  deepScan:    'Authenticated · F5 forward proxy analysis',
};

const STATUS_CLASS = {
  'Completed':                      styles.statusDone,
  'In Progress':                    styles.statusProgress,
  'Queued':                         styles.statusQueued,
  'Not Configured':                 styles.statusNone,
  'Failed':                         styles.statusFailed,
  'Probing Headers':               styles.statusProgress,
  'Probing TLS (2 of 3 domains)':  styles.statusProgress,
  'Probing TTFB (3 of 10 sites)':  styles.statusProgress,
};

const PILLAR_ICONS = {
  dns: (
    <svg width="22" height="22" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="7.5" cy="7.5" r="6"/>
      <ellipse cx="7.5" cy="7.5" rx="2.6" ry="6"/>
      <line x1="1.5" y1="7.5" x2="13.5" y2="7.5"/>
      <line x1="2" y1="4.5" x2="13" y2="4.5"/>
      <line x1="2" y1="10.5" x2="13" y2="10.5"/>
    </svg>
  ),
  https: (
    <svg width="22" height="22" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="3" y="6.5" width="9" height="7" rx="1"/>
      <path d="M5 6.5V4.5a2.5 2.5 0 0 1 5 0v2"/>
      <circle cx="7.5" cy="10" r="1" fill="currentColor" stroke="none"/>
    </svg>
  ),
  surfaceScan: (
    <svg width="22" height="22" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="6.5" cy="6.5" r="4"/>
      <line x1="9.5" y1="9.5" x2="13" y2="13"/>
    </svg>
  ),
  deepScan: (
    <svg width="22" height="22" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="6.5" cy="6.5" r="4"/>
      <line x1="9.5" y1="9.5" x2="13" y2="13"/>
      <circle cx="6.5" cy="6.5" r="1.8" strokeDasharray="2 1.5"/>
    </svg>
  ),
};

// ── Pillar status cell (inside the row) ───────────────────────────────────────
function PillarStatusCell({ pillar, info }) {
  const cls  = STATUS_CLASS[info.status] || styles.statusNone;
  const text = info.detail || info.status;
  return (
    <div className={styles.pillarCell}>
      <span className={styles.pillarName}>{PILLAR_LABELS[pillar]}</span>
      {info.score != null
        ? <span className={styles.pillarScore} style={{ color: scoreColor(info.score) }}>{info.score}</span>
        : null}
      <span className={[styles.pillarStatus, cls].join(' ')}>{text}</span>
    </div>
  );
}

// ── Pillar card (in the report overview section below the list) ───────────────
function PillarOverviewCard({ pillarKey, info, active, onClick }) {
  const hasScore = info.score != null;
  const color    = scoreColor(info.score);
  const cls      = STATUS_CLASS[info.status] || styles.statusNone;

  // Derive a status word from score for the badge
  const statusWord = !hasScore ? null
    : info.score >= 85 ? 'Excellent'
    : info.score >= 70 ? 'Good'
    : info.score >= 55 ? 'Fair'
    : 'At Risk';

  const statusBadgeCls = !hasScore ? null
    : info.score >= 85 ? styles.badgeGreen
    : info.score >= 70 ? styles.badgeBlue
    : info.score >= 55 ? styles.badgeAmber
    : styles.badgeRed;

  return (
    <button
      className={[styles.pillarCard, active ? styles.pillarCardActive : ''].join(' ')}
      onClick={onClick}
      aria-pressed={active}
      disabled={!hasScore}
      style={{ '--pc-color': hasScore ? color : 'var(--f5-N300)' }}
    >
      <div className={styles.pcTop}>
        <span className={styles.pcIcon} style={{ color: hasScore ? color : 'var(--f5-N400)' }}>
          {PILLAR_ICONS[pillarKey]}
        </span>
        {hasScore
          ? <span className={[styles.pcBadge, statusBadgeCls].join(' ')}>{statusWord}</span>
          : <span className={[styles.pillarStatus, cls].join(' ')}>{info.detail || info.status}</span>
        }
      </div>

      <div className={styles.pcLabel}>{PILLAR_LABELS[pillarKey]}</div>
      <div className={styles.pcDesc}>{PILLAR_DESCS[pillarKey]}</div>

      {hasScore ? (
        <>
          <div className={styles.pcScoreRow}>
            <span className={styles.pcScoreNum} style={{ color }}>{info.score}</span>
            <span className={styles.pcScoreOf}>/100</span>
          </div>
          <div className={styles.pcBarTrack}>
            <div className={styles.pcBarFill} style={{ width: `${info.score}%`, background: color }} />
          </div>
          <div className={styles.pcCta}>
            {active ? 'Viewing report ↓' : 'View report →'}
          </div>
        </>
      ) : (
        <div className={styles.pcNoScore}>No score available</div>
      )}
    </button>
  );
}

// ── Report overview — rendered BELOW the entire list+pagination block ─────────
function ReportOverview({ sg }) {
  const [activePillar, setActivePillar] = useState(null);
  const account = ACCOUNTS.find(a => a.id === sg.accountId);

  const activePillarInfo = activePillar ? sg.pillars[activePillar] : null;

  return (
    <div className={styles.reportOverview}>
      {/* Header strip */}
      <div className={styles.overviewHeader}>
        <div className={styles.overviewHeaderLeft}>
          <span className={styles.overviewScanName}>{sg.name}</span>
          <span className={styles.overviewMeta}>
            {account?.name}
            <span className={styles.overviewDot} />
            {sg.domains.slice(0, 2).join(' · ')}{sg.domains.length > 2 ? ` +${sg.domains.length - 2}` : ''}
            <span className={styles.overviewDot} />
            {fmtTimestamp(sg.createdAt)}
          </span>
        </div>
        <span className={styles.overviewHint}>Select a pillar to view its report</span>
      </div>

      {/* 4 pillar cards */}
      <div className={styles.overviewPillars}>
        {Object.entries(sg.pillars).map(([key, info]) => (
          <PillarOverviewCard
            key={key}
            pillarKey={key}
            info={info}
            active={activePillar === key}
            onClick={() => setActivePillar(prev => prev === key ? null : key)}
          />
        ))}
      </div>

      {/* Active pillar detail */}
      {activePillar && activePillarInfo?.score != null && (
        <div className={styles.pillarDetail}>
          <div className={styles.pillarDetailHeader}>
            <span className={styles.pillarDetailIcon} style={{ color: scoreColor(activePillarInfo.score) }}>
              {PILLAR_ICONS[activePillar]}
            </span>
            <div>
              <p className={styles.pillarDetailTitle}>
                {PILLAR_LABELS[activePillar]}
                <span style={{ fontWeight: 400, color: 'var(--f5-N500)' }}> · {sg.name}</span>
              </p>
              <p className={styles.pillarDetailSub}>
                Score:{' '}
                <strong style={{ color: scoreColor(activePillarInfo.score) }}>
                  {activePillarInfo.score}
                </strong>
                {' '}· {sg.domains.join(', ')}
              </p>
            </div>
          </div>
          <p className={styles.pillarDetailNote}>
            The full{' '}<strong>{PILLAR_LABELS[activePillar]}</strong>{' '}report with per-domain
            findings is available under the{' '}
            <strong>{activePillar === 'dns' || activePillar === 'https' ? 'Delivery' : 'Security'}</strong>{' '}
            section in the sidebar. Select probe group <strong>{sg.name}</strong> to view.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ReportList({ accountId }) {
  const [page,        setPage]        = useState(1);
  const [expanded,    setExpanded]    = useState(true);
  const [activeRowId, setActiveRowId] = useState(null);

  const filtered = SCAN_GROUPS
    .filter(sg => accountId === 'all' || sg.accountId === accountId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total      = filtered.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const paged      = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const start      = (page - 1) * PAGE_SIZE + 1;
  const end        = Math.min(page * PAGE_SIZE, total);

  // The active scan group object (for the report overview below the list)
  const activeSg = filtered.find(sg => sg.id === activeRowId) ?? null;

  const handleRowClick = (id) => {
    setActiveRowId(prev => prev === id ? null : id);
  };

  // When page changes, collapse the open report if it's no longer on this page
  const handlePageChange = (newPage) => {
    setPage(newPage);
    setActiveRowId(null);
  };

  return (
    <div className={styles.section}>

      {/* ── Collapsible header ── */}
      <div className={styles.header}>
        <button
          className={styles.headerToggle}
          onClick={() => { setExpanded(e => !e); setActiveRowId(null); }}
          aria-expanded={expanded}
        >
          <span className={[styles.triangle, expanded ? styles.triangleOpen : ''].join(' ')} />
          <span className={styles.sectionTitle}>Recent Reports</span>
          <span className={styles.sectionSub}>
            {total > 0 ? `${start}–${end} of ${total}` : '0 reports'}
          </span>
        </button>
        <button className={styles.newScanBtn}>+ New Probe</button>
      </div>

      {expanded && (
        <>
          {paged.length === 0 ? (
            <div className={styles.empty}>No probe groups found for this account.</div>
          ) : (
            <div className={styles.list}>
              {paged.map(sg => {
                const account  = ACCOUNTS.find(a => a.id === sg.accountId);
                const isActive = activeRowId === sg.id;
                return (
                  <button
                    key={sg.id}
                    className={[styles.row, isActive ? styles.rowActive : ''].join(' ')}
                    onClick={() => handleRowClick(sg.id)}
                    aria-expanded={isActive}
                  >
                    {/* Triangle toggle */}
                    <span className={[styles.rowTriangle, isActive ? styles.rowTriangleOpen : ''].join(' ')} />

                    {/* Left: name + meta */}
                    <div className={styles.rowLeft}>
                      <div className={styles.sgName}>{sg.name}</div>
                      <div className={styles.sgMeta}>
                        <span className={styles.accountName}>{account?.name}</span>
                        <span className={styles.dot} />
                        <span className={styles.domains}>
                          {sg.domains.slice(0, 2).join(', ')}
                          {sg.domains.length > 2 ? ` +${sg.domains.length - 2}` : ''}
                        </span>
                        <span className={styles.dot} />
                        <span className={styles.time}>{daysAgo(sg.createdAt)}</span>
                      </div>
                    </div>

                    {/* Right: pillar statuses */}
                    <div className={styles.pillars}>
                      {Object.entries(sg.pillars).map(([key, info]) => (
                        <PillarStatusCell key={key} pillar={key} info={info} />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Pagination — always above the report overview */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                className={styles.pageBtn}
                disabled={page === 1}
                onClick={() => handlePageChange(page - 1)}
              >← Prev</button>
              <span className={styles.pageInfo}>Page {page} of {totalPages}</span>
              <button
                className={styles.pageBtn}
                disabled={page === totalPages}
                onClick={() => handlePageChange(page + 1)}
              >Next →</button>
            </div>
          )}

          {/* ── Report overview: renders BELOW the full list+pagination block ── */}
          {activeSg && <ReportOverview key={activeSg.id} sg={activeSg} />}
        </>
      )}
    </div>
  );
}
