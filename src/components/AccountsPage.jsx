import { useState } from 'react';
import { ACCOUNTS, fmtTimestamp } from '../data/appData';
import styles from './AccountsPage.module.css';

// ── Shared badge ──────────────────────────────────────────────────────────────
function IndustryBadge({ label }) {
  return <span className={styles.industryBadge}>{label}</span>;
}

// ── Account row ───────────────────────────────────────────────────────────────
function AccountRow({ account, onArchive, onRestore, onDelete }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={styles.row}>
      <div className={styles.rowMain} onClick={() => setExpanded(e => !e)}>
        {/* Info */}
        <div className={styles.rowInfo}>
          <div className={styles.rowName}>{account.name}</div>
          <div className={styles.rowMeta}>
            <IndustryBadge label={account.industry} />
            <span className={styles.metaDot} />
            <span className={styles.metaText}>{account.country}</span>
            <span className={styles.metaDot} />
            <span className={styles.metaText}>{account.presales}</span>
            <span className={styles.metaDot} />
            <span className={styles.metaText}>Added {fmtTimestamp(account.createdAt)}</span>
          </div>
        </div>

        {/* Domain count */}
        <div className={styles.domainCount}>
          <span className={styles.domainNum}>{account.domains.length}</span>
          <span className={styles.domainLabel}>domain{account.domains.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Chevron */}
        <span className={[styles.rowChevron, expanded ? styles.rowChevronOpen : ''].join(' ')}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
               stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M2 4.5l4 4 4-4"/>
          </svg>
        </span>
      </div>

      {/* Expanded: domains + actions */}
      {expanded && (
        <div className={styles.rowExpanded}>
          <div className={styles.domainList}>
            <span className={styles.domainListLabel}>Domains</span>
            {account.domains.map(d => (
              <span key={d} className={styles.domainTag}>{d}</span>
            ))}
          </div>
          <div className={styles.rowActions}>
            <button className={styles.btnEdit}>Edit</button>
            {!account.archived
              ? <button className={styles.btnArchive} onClick={() => onArchive(account.id)}>Archive</button>
              : <button className={styles.btnRestore} onClick={() => onRestore(account.id)}>Restore</button>
            }
            <button className={styles.btnDelete} onClick={() => onDelete(account.id)}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AccountsPage() {
  const [tab,      setTab]      = useState('active');    // 'active' | 'archived'
  const [accounts, setAccounts] = useState(ACCOUNTS);
  const [showAdd,  setShowAdd]  = useState(false);
  const [newName,  setNewName]  = useState('');
  const [newCountry, setNewCountry] = useState('');
  const [newIndustry, setNewIndustry] = useState('');
  const [newDomain, setNewDomain] = useState('');

  const active   = accounts.filter(a => !a.archived);
  const archived = accounts.filter(a =>  a.archived);

  const handleArchive = (id) =>
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, archived: true }  : a));
  const handleRestore = (id) =>
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, archived: false } : a));
  const handleDelete  = (id) =>
    setAccounts(prev => prev.filter(a => a.id !== id));

  const handleAdd = () => {
    if (!newName.trim()) return;
    const newAcc = {
      id: `acc-${Date.now()}`,
      name: newName.trim(),
      industry: newIndustry.trim() || 'Other',
      country: newCountry.trim() || '—',
      presales: 'you@f5.com',
      domains: newDomain.trim() ? [newDomain.trim()] : [],
      archived: false,
      createdAt: new Date().toISOString(),
    };
    setAccounts(prev => [newAcc, ...prev]);
    setNewName(''); setNewCountry(''); setNewIndustry(''); setNewDomain('');
    setShowAdd(false);
  };

  return (
    <div className={styles.page}>
      {/* Page header */}
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.pageTitle}>Accounts</h2>
          <p className={styles.pageSubtitle}>
            Manage customer accounts and their associated domains.
            Archive an account to hide all its probe reports from view.
          </p>
        </div>
        <button className={styles.addBtn} onClick={() => setShowAdd(s => !s)}>
          {showAdd ? '✕ Cancel' : '+ Add Account'}
        </button>
      </div>

      {/* Add account form */}
      {showAdd && (
        <div className={styles.addForm}>
          <div className={styles.addFormGrid}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Company Name *</label>
              <input className={styles.formInput} value={newName}
                placeholder="e.g. Acme Bank"
                onChange={e => setNewName(e.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Industry</label>
              <input className={styles.formInput} value={newIndustry}
                placeholder="e.g. Financial Services"
                onChange={e => setNewIndustry(e.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Country</label>
              <input className={styles.formInput} value={newCountry}
                placeholder="e.g. Singapore"
                onChange={e => setNewCountry(e.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>First Domain</label>
              <input className={styles.formInput} value={newDomain}
                placeholder="e.g. acme.example"
                onChange={e => setNewDomain(e.target.value)} />
            </div>
          </div>
          <button className={styles.saveBtn} onClick={handleAdd}>Save Account</button>
        </div>
      )}

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={[styles.tab, tab === 'active' ? styles.tabActive : ''].join(' ')}
          onClick={() => setTab('active')}
        >
          Active <span className={styles.tabCount}>{active.length}</span>
        </button>
        <button
          className={[styles.tab, tab === 'archived' ? styles.tabActive : ''].join(' ')}
          onClick={() => setTab('archived')}
        >
          Archived <span className={styles.tabCount}>{archived.length}</span>
        </button>
      </div>

      {/* Account list */}
      <div className={styles.list}>
        {tab === 'active' && (
          active.length === 0
            ? <div className={styles.empty}>No active accounts.</div>
            : active.map(a => (
                <AccountRow key={a.id} account={a}
                  onArchive={handleArchive}
                  onRestore={handleRestore}
                  onDelete={handleDelete} />
              ))
        )}
        {tab === 'archived' && (
          archived.length === 0
            ? <div className={styles.empty}>No archived accounts. Archive an account from the Active tab to hide it from reports.</div>
            : archived.map(a => (
                <AccountRow key={a.id} account={a}
                  onArchive={handleArchive}
                  onRestore={handleRestore}
                  onDelete={handleDelete} />
              ))
        )}
      </div>
    </div>
  );
}
