import { useState, useEffect, useCallback } from 'react';
import { getEvents, loadRemoteEvents, EVENT_CONFIG, EVENT_TYPES } from '../data/auditLog';
import styles from './AuditLogPage.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTs(isoString) {
  const d = new Date(isoString);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return { date, time };
}

function relativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)   return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function MetaBadge({ meta, type }) {
  if (type === EVENT_TYPES.DNS_PROBE_DONE && meta.score !== undefined) {
    const score = meta.score;
    const color = score >= 80 ? '#166534' : score >= 60 ? '#92400e' : '#b91c1c';
    const bg    = score >= 80 ? '#f0fdf4' : score >= 60 ? '#fffbeb' : '#fff0f0';
    return (
      <span className={styles.metaChip} style={{ color, background: bg, borderColor: bg }}>
        Score {score}
      </span>
    );
  }
  if (meta.domain) {
    return <span className={styles.metaChip}>{meta.domain}</span>;
  }
  return null;
}

function EventBadge({ type }) {
  const cfg = EVENT_CONFIG[type] ?? { label: type, color: 'neutral', icon: '·' };
  return (
    <span className={`${styles.typeBadge} ${styles[`badge_${cfg.color}`]}`}>
      <span className={styles.badgeIcon}>{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}

function EventRow({ event, isNew }) {
  const { date, time } = fmtTs(event.ts);
  const rel = relativeTime(event.ts);
  const cfg = EVENT_CONFIG[event.type] ?? { color: 'neutral' };

  return (
    <tr className={`${styles.row} ${isNew ? styles.rowNew : ''}`}>
      {/* indicator bar */}
      <td className={styles.indicatorCell}>
        <span className={`${styles.indicator} ${styles[`ind_${cfg.color}`]}`} />
      </td>

      {/* timestamp */}
      <td className={styles.tsCell}>
        <span className={styles.tsDate}>{date}</span>
        <span className={styles.tsTime}>{time}</span>
        <span className={styles.tsRel}>{rel}</span>
      </td>

      {/* event type badge */}
      <td className={styles.typeCell}>
        <EventBadge type={event.type} />
      </td>

      {/* actor */}
      <td className={styles.actorCell}>
        <span className={styles.actorEmail}>{event.actor}</span>
        <span className={`${styles.rolePill} ${styles[`role_${event.role}`]}`}>{event.role}</span>
      </td>

      {/* details */}
      <td className={styles.detailCell}>
        {event.meta.domain && (
          <span className={styles.detailDomain}>{event.meta.domain}</span>
        )}
        {event.type === EVENT_TYPES.DNS_PROBE_DONE && event.meta.score !== undefined && (
          <MetaBadge meta={event.meta} type={event.type} />
        )}
        {event.type === EVENT_TYPES.DNS_PROBE_ERROR && event.meta.error && (
          <span className={styles.detailError}>{String(event.meta.error).slice(0, 120)}</span>
        )}
        {event.type === EVENT_TYPES.LOGIN && (
          <span className={styles.detailMuted}>Session started</span>
        )}
        {event.type === EVENT_TYPES.LOGOUT && (
          <span className={styles.detailMuted}>Session ended</span>
        )}
      </td>
    </tr>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: '',                            label: 'All events' },
  { value: EVENT_TYPES.LOGIN,             label: 'Login' },
  { value: EVENT_TYPES.LOGOUT,            label: 'Logout' },
  { value: EVENT_TYPES.DNS_PROBE_START,   label: 'DNS Started' },
  { value: EVENT_TYPES.DNS_PROBE_DONE,    label: 'DNS Complete' },
  { value: EVENT_TYPES.DNS_PROBE_ERROR,   label: 'DNS Failed' },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AuditLogPage({ currentUserEmail, role, idToken }) {
  const [events,      setEvents]      = useState(() => getEvents());
  const [filterType,  setFilterType]  = useState('');
  const [filterActor, setFilterActor] = useState('');
  const [newIds,      setNewIds]      = useState(new Set());
  const [tick,        setTick]        = useState(0);
  const [loading,     setLoading]     = useState(true);

  // On mount: fetch from DynamoDB and merge with in-memory cache
  useEffect(() => {
    setLoading(true);
    loadRemoteEvents(idToken)
      .then(merged => setEvents(merged))
      .finally(() => setLoading(false));
  }, []);

  // Refresh event list and relative times every 30s
  useEffect(() => {
    const id = setInterval(() => {
      setEvents(getEvents());
      setTick(t => t + 1);
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Poll for new events every 2s (catches events from other hooks/components)
  useEffect(() => {
    const id = setInterval(() => {
      const fresh = getEvents();
      setEvents(prev => {
        const prevIds = new Set(prev.map(e => e.id));
        const added = fresh.filter(e => !prevIds.has(e.id));
        if (added.length === 0) return prev;
        setNewIds(ids => {
          const next = new Set(ids);
          added.forEach(e => next.add(e.id));
          return next;
        });
        // Clear "new" highlight after 2.5s
        setTimeout(() => {
          setNewIds(ids => {
            const next = new Set(ids);
            added.forEach(e => next.delete(e.id));
            return next;
          });
        }, 2500);
        return fresh;
      });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const filtered = events.filter(e => {
    if (filterType  && e.type  !== filterType)                            return false;
    if (filterActor && !e.actor.toLowerCase().includes(filterActor.toLowerCase())) return false;
    // readonly users see only their own events
    if (role === 'readonly' && e.actor !== currentUserEmail)              return false;
    return true;
  });

  // Stats
  const totalEvents  = role === 'readonly' ? events.filter(e => e.actor === currentUserEmail).length : events.length;
  const loginCount   = events.filter(e => e.type === EVENT_TYPES.LOGIN).length;
  const probeCount   = events.filter(e => e.type === EVENT_TYPES.DNS_PROBE_DONE).length;
  const errorCount   = events.filter(e => e.type === EVENT_TYPES.DNS_PROBE_ERROR).length;

  const uniqueActors = role !== 'readonly'
    ? [...new Set(events.map(e => e.actor))].sort()
    : [currentUserEmail];

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <div className={styles.headerIcon}>
            <svg width="18" height="18" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <rect x="2" y="1.5" width="11" height="12" rx="1.5"/>
              <line x1="4.5" y1="5"   x2="10.5" y2="5"/>
              <line x1="4.5" y1="7.5" x2="10.5" y2="7.5"/>
              <line x1="4.5" y1="10"  x2="8"    y2="10"/>
            </svg>
          </div>
          <div>
            <h1 className={styles.title}>Audit Log</h1>
            <p className={styles.subtitle}>
              {role === 'admin'
                ? 'All user activity across the platform'
                : 'Your activity within this session'}
            </p>
          </div>
        </div>

        {/* stat chips */}
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statVal}>{totalEvents}</span>
            <span className={styles.statLabel}>Total</span>
          </div>
          {role !== 'readonly' && (
            <>
              <div className={styles.statDivider} />
              <div className={styles.stat}>
                <span className={styles.statVal}>{loginCount}</span>
                <span className={styles.statLabel}>Logins</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.stat}>
                <span className={styles.statVal}>{probeCount}</span>
                <span className={styles.statLabel}>DNS Probes</span>
              </div>
              <div className={styles.statDivider} />
              <div className={`${styles.stat} ${errorCount > 0 ? styles.statError : ''}`}>
                <span className={styles.statVal}>{errorCount}</span>
                <span className={styles.statLabel}>Errors</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className={styles.filterBar}>
        <div className={styles.filterLeft}>
          <div className={styles.selectWrap}>
            <select
              className={styles.select}
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
            >
              {TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span className={styles.selectChevron}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 3.5l3 3 3-3"/>
              </svg>
            </span>
          </div>

          {role !== 'readonly' && (
            <div className={styles.selectWrap}>
              <select
                className={styles.select}
                value={filterActor}
                onChange={e => setFilterActor(e.target.value)}
              >
                <option value="">All users</option>
                {uniqueActors.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <span className={styles.selectChevron}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 3.5l3 3 3-3"/>
                </svg>
              </span>
            </div>
          )}
        </div>

        <div className={styles.filterRight}>
          <span className={styles.resultCount}>
            {filtered.length} event{filtered.length !== 1 ? 's' : ''}
          </span>
          {(filterType || filterActor) && (
            <button className={styles.clearBtn} onClick={() => { setFilterType(''); setFilterActor(''); }}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* ── Loading indicator ── */}
      {loading && (
        <div className={styles.loadingBar}>
          <span className={styles.loadingDot} />
          Loading events from database…
        </div>
      )}

      {/* ── Table ── */}
      {!loading && filtered.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <svg width="32" height="32" viewBox="0 0 15 15" fill="none" stroke="var(--f5-N300)" strokeWidth="1.2">
              <rect x="2" y="1.5" width="11" height="12" rx="1.5"/>
              <line x1="4.5" y1="5"   x2="10.5" y2="5"/>
              <line x1="4.5" y1="7.5" x2="10.5" y2="7.5"/>
              <line x1="4.5" y1="10"  x2="8"    y2="10"/>
            </svg>
          </div>
          <p className={styles.emptyTitle}>No events yet</p>
          <p className={styles.emptyHint}>
            {filterType || filterActor
              ? 'Try clearing the filters above.'
              : 'Login, logout, and DNS probe events will appear here.'}
          </p>
        </div>
      ) : !loading && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.thead}>
                <th className={styles.thIndicator} />
                <th className={styles.th}>Timestamp</th>
                <th className={styles.th}>Event</th>
                <th className={styles.th}>User</th>
                <th className={styles.th}>Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(event => (
                <EventRow
                  key={event.id}
                  event={event}
                  isNew={newIds.has(event.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Persistent storage note ── */}
      <p className={styles.sessionNote}>
        {role === 'readonly'
          ? 'Showing your activity. Events are stored permanently in the database.'
          : 'Events are stored permanently in DynamoDB. Login events from all sessions are included.'}
      </p>
    </div>
  );
}
