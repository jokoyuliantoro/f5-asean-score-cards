import { useState } from 'react';
import { SCAN_GROUPS, ACCOUNTS, fmtTimestamp, daysAgo, scoreColor } from '../data/appData';
import styles from './ScanHistoryPage.module.css';

const PILLAR_LABELS = { dns: 'DNS', https: 'HTTPS', surfaceScan: 'Surface Probe', deepScan: 'Deep Probe' };

const STATUS_CLASS = {
  'Completed':       styles.statusDone,
  'In Progress':     styles.statusProgress,
  'Queued':          styles.statusQueued,
  'Not Configured':  styles.statusNone,
  'Failed':          styles.statusFailed,
  'Probing Headers':styles.statusProgress,
  'Probing TLS (2 of 3 domains)': styles.statusProgress,
  'Probing TTFB (3 of 10 sites)': styles.statusProgress,
};

const PAGE_SIZE = 8;

function PillarPill({ pillar, info }) {
  const cls = STATUS_CLASS[info.status] || styles.statusNone;
  return (
    <div className={styles.pillarPill}>
      <span className={styles.pillarName}>{PILLAR_LABELS[pillar]}</span>
      {info.score != null
        ? <span className={styles.pillarScore} style={{ color: scoreColor(info.score) }}>{info.score}</span>
        : <span className={[styles.pillarStatus, cls].join(' ')}>{info.detail || info.status}</span>
      }
    </div>
  );
}

export default function ScanHistoryPage() {
  const [scans,    setScans]    = useState(SCAN_GROUPS);
  const [page,     setPage]     = useState(1);
  const [filter,   setFilter]   = useState('all'); // accountId or 'all'
  const [selected, setSelected] = useState(new Set());
  const [confirm,  setConfirm]  = useState(null);  // id to confirm delete

  const accounts = ACCOUNTS.filter(a => !a.archived);

  const filtered = scans
    .filter(sg => filter === 'all' || sg.accountId === filter)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total      = filtered.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const paged      = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const start      = (page - 1) * PAGE_SIZE + 1;
  const end        = Math.min(page * PAGE_SIZE, total);

  const toggleSelect = (id) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () => {
    if (selected.size === paged.length) setSelected(new Set());
    else setSelected(new Set(paged.map(s => s.id)));
  };

  const handleDelete = (id) => {
    setScans(prev => prev.filter(s => s.id !== id));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    setConfirm(null);
  };

  const handleDeleteSelected = () => {
    setScans(prev => prev.filter(s => !selected.has(s.id)));
    setSelected(new Set());
    setPage(1);
  };

  const handleRelaunch = (sg) => {
    const newSg = {
      ...sg,
      id: `sg-${Date.now()}`,
      name: `${sg.name} (Re-run)`,
      createdAt: new Date().toISOString(),
      pillars: Object.fromEntries(
        Object.entries(sg.pillars).map(([k, v]) => [
          k,
          v.status === 'Not Configured'
            ? { status: 'Not Configured', score: null, detail: null }
            : { status: 'Queued', score: null, detail: null },
        ])
      ),
    };
    setScans(prev => [newSg, ...prev]);
    setPage(1);
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Discovery History</h2>
          <p className={styles.pageSubtitle}>
            View, re-launch, or delete past probe groups.
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          {/* Account filter */}
          <div className={styles.selectWrap}>
            <select
              className={styles.select}
              value={filter}
              onChange={e => { setFilter(e.target.value); setPage(1); setSelected(new Set()); }}
            >
              <option value="all">All Accounts</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <span className={styles.selectChevron}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none"
                   stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M2 4.5l4 4 4-4"/>
              </svg>
            </span>
          </div>

          <span className={styles.countLabel}>
            {total > 0 ? `${start}–${end} of ${total} probe groups` : '0 probe groups'}
          </span>
        </div>

        <div className={styles.toolbarRight}>
          {selected.size > 0 && (
            <button className={styles.btnDeleteSel} onClick={handleDeleteSelected}>
              Delete {selected.size} selected
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thCheck}>
                <input type="checkbox"
                  checked={paged.length > 0 && selected.size === paged.length}
                  onChange={toggleAll}
                  className={styles.checkbox}
                />
              </th>
              <th>Probe Group</th>
              <th>Account</th>
              <th>Domains</th>
              <th>Created</th>
              <th>Pillars</th>
              <th className={styles.thActions}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && (
              <tr>
                <td colSpan={7} className={styles.emptyRow}>No probe groups found.</td>
              </tr>
            )}
            {paged.map(sg => {
              const account = ACCOUNTS.find(a => a.id === sg.accountId);
              const isSel   = selected.has(sg.id);
              return (
                <tr key={sg.id} className={isSel ? styles.rowSelected : ''}>
                  <td className={styles.tdCheck}>
                    <input type="checkbox" checked={isSel}
                      onChange={() => toggleSelect(sg.id)}
                      className={styles.checkbox}
                    />
                  </td>
                  <td>
                    <div className={styles.sgName}>{sg.name}</div>
                    <div className={styles.sgAge}>{daysAgo(sg.createdAt)}</div>
                  </td>
                  <td>
                    <span className={styles.accountName}>{account?.name ?? '—'}</span>
                  </td>
                  <td>
                    <div className={styles.domainList}>
                      {sg.domains.slice(0, 2).map(d => (
                        <span key={d} className={styles.domainTag}>{d}</span>
                      ))}
                      {sg.domains.length > 2 && (
                        <span className={styles.domainMore}>+{sg.domains.length - 2}</span>
                      )}
                    </div>
                  </td>
                  <td className={styles.tdTime}>{fmtTimestamp(sg.createdAt)}</td>
                  <td>
                    <div className={styles.pillarsRow}>
                      {Object.entries(sg.pillars).map(([k, v]) => (
                        <PillarPill key={k} pillar={k} info={v} />
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <button className={styles.btnRelaunch}
                        onClick={() => handleRelaunch(sg)}
                        title="Re-launch with same parameters">
                        ↺ Re-run
                      </button>
                      {confirm === sg.id ? (
                        <>
                          <button className={styles.btnConfirmDel}
                            onClick={() => handleDelete(sg.id)}>Confirm</button>
                          <button className={styles.btnCancelDel}
                            onClick={() => setConfirm(null)}>Cancel</button>
                        </>
                      ) : (
                        <button className={styles.btnDelete}
                          onClick={() => setConfirm(sg.id)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button className={styles.pageBtn} disabled={page === 1}
            onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span className={styles.pageInfo}>Page {page} of {totalPages}</span>
          <button className={styles.pageBtn} disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
