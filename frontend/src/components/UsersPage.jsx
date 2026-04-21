import { useState, useEffect, useCallback } from 'react';
import { ROLE_LABELS, ROLE_COLORS, INITIAL_USERS } from '../data/users';
import { listUsers, createUser, updateUser, deleteUser } from '../api/users';
import styles from './UsersPage.module.css';

const ROLES = ['readonly', 'user', 'admin'];

const BUILT_IN_EMAILS = new Set(INITIAL_USERS.map(u => u.email.toLowerCase()));

// ── Role buttons ──────────────────────────────────────────────────────────────
function RoleButtons({ currentRole, onSetRole, saving }) {
  return (
    <div className={styles.roleBtns}>
      {ROLES.map(r => (
        <button
          key={r}
          className={[
            styles.roleBtn,
            currentRole === r ? styles.roleBtnActive : '',
            styles[`roleBtnVar_${r}`],
          ].join(' ')}
          onClick={() => onSetRole(r)}
          disabled={currentRole === r || saving}
        >
          {ROLE_LABELS[r]}
        </button>
      ))}
    </div>
  );
}

// ── Add User form ─────────────────────────────────────────────────────────────
function AddUserForm({ existingEmails, onAdd, onCancel }) {
  const [email,   setEmail]   = useState('');
  const [name,    setName]    = useState('');
  const [country, setCountry] = useState('');
  const [role,    setRole]    = useState('readonly');
  const [err,     setErr]     = useState('');
  const [saving,  setSaving]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed)                        { setErr('Email is required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setErr('Enter a valid email address.'); return; }
    if (existingEmails.has(trimmed))     { setErr('This user is already registered.'); return; }
    setSaving(true);
    setErr('');
    const apiErr = await onAdd({
      email:   trimmed,
      name:    name.trim() || trimmed.split('@')[0],
      country: country.trim() || '—',
      role,
    });
    setSaving(false);
    if (apiErr) setErr(apiErr);
  };

  return (
    <form className={styles.addForm} onSubmit={handleSubmit} noValidate>
      <div className={styles.addFormGrid}>
        <div className={styles.addField}>
          <label className={styles.addLabel}>Email <span className={styles.req}>*</span></label>
          <input
            className={[styles.addInput, err ? styles.addInputErr : ''].join(' ')}
            type="text" placeholder="name@f5.com"
            value={email} onChange={e => { setEmail(e.target.value); setErr(''); }}
            disabled={saving} autoFocus
          />
          {err && <p className={styles.addErr}>{err}</p>}
        </div>
        <div className={styles.addField}>
          <label className={styles.addLabel}>Display Name</label>
          <input className={styles.addInput} type="text" placeholder="e.g. J. Smith"
            value={name} onChange={e => setName(e.target.value)} disabled={saving} />
        </div>
        <div className={styles.addField}>
          <label className={styles.addLabel}>Country</label>
          <input className={styles.addInput} type="text" placeholder="e.g. Singapore"
            value={country} onChange={e => setCountry(e.target.value)} disabled={saving} />
        </div>
        <div className={styles.addField}>
          <label className={styles.addLabel}>Initial Role</label>
          <div className={styles.addRoleWrap}>
            <select className={styles.addSelect} value={role}
              onChange={e => setRole(e.target.value)} disabled={saving}>
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <span className={styles.addSelectChevron}>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M2 4l3 3 3-3"/>
              </svg>
            </span>
          </div>
        </div>
      </div>
      <div className={styles.addActions}>
        <button type="submit"  className={styles.btnAddUser} disabled={saving}>
          {saving ? 'Adding…' : 'Add User'}
        </button>
        <button type="button" className={styles.btnCancel} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function UsersPage({ currentUserEmail, idToken }) {
  const [users,      setUsers]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [pageError,  setPageError]  = useState('');
  const [selected,   setSelected]   = useState(new Set());
  const [showAdd,    setShowAdd]    = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [savingRow,  setSavingRow]  = useState(''); // email currently being saved

  // ── Load users from DynamoDB ────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setLoading(true);
    setPageError('');
    const { data, error } = await listUsers(idToken);
    setLoading(false);
    if (error) {
      setPageError(error);
    } else {
      setUsers(data.users ?? []);
    }
  }, [idToken]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // ── Sorted display ──────────────────────────────────────────────────────────
  const sortedUsers = [...users].sort((a, b) => {
    const order = { admin: 0, user: 1, readonly: 2 };
    const d = order[a.role] - order[b.role];
    return d !== 0 ? d : a.email.localeCompare(b.email);
  });

  const existingEmails = new Set(users.map(u => u.email.toLowerCase()));

  // ── Role change ─────────────────────────────────────────────────────────────
  const handleSetRole = async (email, newRole) => {
    const admins = users.filter(u => u.role === 'admin');
    if (admins.length === 1 && email === admins[0].email && newRole !== 'admin') {
      setPageError('Cannot demote the only admin. Promote another user to admin first.');
      return;
    }
    setSavingRow(email);
    const { data, error } = await updateUser(idToken, email, { role: newRole });
    setSavingRow('');
    if (error) {
      setPageError(`Could not update ${email}: ${error}`);
    } else {
      setUsers(prev => prev.map(u => u.email === email ? { ...u, ...data.user } : u));
    }
  };

  // ── Add user ────────────────────────────────────────────────────────────────
  const handleAdd = async ({ email, name, country, role }) => {
    const { data, error } = await createUser(idToken, { email, name, country, role });
    if (error) return error;
    setUsers(prev => [...prev, data.user]);
    setShowAdd(false);
    return null;
  };

  // ── Delete selected ─────────────────────────────────────────────────────────
  const handleDeleteSelected = async () => {
    const admins          = users.filter(u => u.role === 'admin');
    const selfSelected    = selected.has(currentUserEmail?.toLowerCase());
    const deletingAllAdmins = admins.every(a => selected.has(a.email.toLowerCase()));

    if (selfSelected)       { setPageError('You cannot delete your own account.'); setConfirmDel(false); return; }
    if (deletingAllAdmins)  { setPageError('Cannot delete all admins.'); setConfirmDel(false); return; }

    // Only allow deleting non-built-in users
    const toDelete = [...selected].filter(e => !BUILT_IN_EMAILS.has(e));
    const skipped  = [...selected].filter(e => BUILT_IN_EMAILS.has(e));

    for (const email of toDelete) {
      const { error } = await deleteUser(idToken, email);
      if (error) { setPageError(`Could not delete ${email}: ${error}`); }
    }

    setUsers(prev => prev.filter(u => !toDelete.includes(u.email.toLowerCase())));
    setSelected(new Set());
    setConfirmDel(false);

    if (skipped.length) {
      setPageError(`Built-in users cannot be deleted: ${skipped.join(', ')}`);
    }
  };

  // ── Selection helpers ───────────────────────────────────────────────────────
  const toggleSelect = (email) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });

  const selectableEmails = sortedUsers
    .filter(u => u.email.toLowerCase() !== currentUserEmail?.toLowerCase())
    .map(u => u.email.toLowerCase());

  const allSelected = selectableEmails.length > 0 && selectableEmails.every(e => selected.has(e));
  const toggleAll   = () => allSelected ? setSelected(new Set()) : setSelected(new Set(selectableEmails));

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>

      {/* ── Page header ── */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <h1 className={styles.pageTitle}>Users</h1>
          <p className={styles.pageSubtitle}>
            Manage access roles for registered @f5.com users.
            Unregistered @f5.com addresses default to <strong>Read-Only</strong>.
          </p>
        </div>

        <div className={styles.headerRight}>
          <div className={styles.legend}>
            {ROLES.map(r => (
              <span key={r} className={styles.legendItem}
                style={{ background: ROLE_COLORS[r].bg, color: ROLE_COLORS[r].text }}>
                {ROLE_LABELS[r]}
              </span>
            ))}
          </div>
          <div className={styles.headerBtns}>
            {selected.size > 0 && !confirmDel && (
              <button className={styles.btnDelete} onClick={() => setConfirmDel(true)}>
                Delete Selected ({selected.size})
              </button>
            )}
            {confirmDel && (
              <>
                <span className={styles.confirmText}>Delete {selected.size} user{selected.size > 1 ? 's' : ''}?</span>
                <button className={styles.btnDeleteConfirm} onClick={handleDeleteSelected}>Yes, delete</button>
                <button className={styles.btnCancel} onClick={() => setConfirmDel(false)}>Cancel</button>
              </>
            )}
            <button className={styles.btnAddUser}
              onClick={() => { setShowAdd(s => !s); setConfirmDel(false); setPageError(''); }}>
              {showAdd ? '✕ Cancel' : '+ Add User'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Page-level error ── */}
      {pageError && (
        <div className={styles.pageError}>
          <span>⚠ {pageError}</span>
          <button className={styles.retryBtn} onClick={() => setPageError('')}>Dismiss</button>
        </div>
      )}

      {/* ── Add user form ── */}
      {showAdd && (
        <AddUserForm
          existingEmails={existingEmails}
          onAdd={handleAdd}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className={styles.loadingWrap}>
          <div className={styles.spinner} />
          <span className={styles.loadingText}>Loading users…</span>
        </div>
      )}

      {/* ── Table ── */}
      {!loading && (
        <div className={styles.tableWrap}>
          <div className={styles.tableHead}>
            <div className={styles.colCheck}>
              <label className={styles.checkWrap}>
                <input type="checkbox" className={styles.checkbox}
                  checked={allSelected} onChange={toggleAll} />
                <span className={styles.checkMark} />
              </label>
            </div>
            <div className={styles.colUser}>User</div>
            <div className={styles.colCountry}>Country</div>
            <div className={styles.colRole}>Role</div>
            <div className={styles.colActions}>Set Role</div>
            <div className={styles.colAdded}>Added</div>
          </div>

          <div className={styles.tableBody}>
            {sortedUsers.map(u => {
              const isSelf     = u.email.toLowerCase() === currentUserEmail?.toLowerCase();
              const isSelected = selected.has(u.email.toLowerCase());
              const color      = ROLE_COLORS[u.role] ?? ROLE_COLORS.readonly;
              const isSaving   = savingRow === u.email;

              return (
                <div key={u.email} className={[
                  styles.tableRow,
                  isSelf     ? styles.tableRowSelf     : '',
                  isSelected ? styles.tableRowSelected : '',
                ].join(' ')}>
                  <div className={styles.colCheck}>
                    {isSelf ? <span className={styles.checkPlaceholder} /> : (
                      <label className={styles.checkWrap}>
                        <input type="checkbox" className={styles.checkbox}
                          checked={isSelected} onChange={() => toggleSelect(u.email.toLowerCase())} />
                        <span className={styles.checkMark} />
                      </label>
                    )}
                  </div>

                  <div className={styles.colUser}>
                    <div className={styles.avatarWrap}>
                      <div className={styles.avatar} style={{ background: color.bg, color: color.text }}>
                        {(u.name ?? u.email).charAt(0).toUpperCase()}
                      </div>
                      {isSelected && <span className={styles.avatarCheck}>✓</span>}
                    </div>
                    <div className={styles.userInfo}>
                      <span className={styles.userName}>
                        {u.name ?? u.email}
                        {isSelf && <span className={styles.selfTag}>You</span>}
                      </span>
                      <span className={styles.userEmail}>{u.email}</span>
                    </div>
                  </div>

                  <div className={styles.colCountry}>
                    <span className={styles.countryText}>{u.country ?? '—'}</span>
                  </div>

                  <div className={styles.colRole}>
                    <span className={styles.roleBadge}
                      style={{ background: color.bg, color: color.text }}>
                      {isSaving ? '…' : ROLE_LABELS[u.role]}
                    </span>
                  </div>

                  <div className={styles.colActions}>
                    {isSelf ? (
                      <span className={styles.selfNote}>Cannot change own role</span>
                    ) : (
                      <RoleButtons
                        currentRole={u.role}
                        onSetRole={(r) => handleSetRole(u.email, r)}
                        saving={isSaving}
                      />
                    )}
                  </div>

                  <div className={styles.colAdded}>
                    <span className={styles.addedDate}>
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-SG', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      }) : '—'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      {!loading && (
        <div className={styles.infoFooter}>
          <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="7.5" cy="7.5" r="6"/>
            <line x1="7.5" y1="5" x2="7.5" y2="7.5"/>
            <circle cx="7.5" cy="10" r="0.8" fill="currentColor" stroke="none"/>
          </svg>
          {users.length} registered user{users.length !== 1 ? 's' : ''} · Role changes take effect at next login · Changes are persisted to DynamoDB.
        </div>
      )}
    </div>
  );
}
