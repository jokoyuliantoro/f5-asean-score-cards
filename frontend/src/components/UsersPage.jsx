import { useState } from 'react';
import { ROLE_LABELS, ROLE_COLORS, INITIAL_USERS } from '../data/users';
import styles from './UsersPage.module.css';

const ROLES = ['readonly', 'user', 'admin'];

// ── Role buttons (unchanged) ──────────────────────────────────────────────────
function RoleButtons({ currentRole, onSetRole }) {
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
          disabled={currentRole === r}
        >
          {ROLE_LABELS[r]}
        </button>
      ))}
    </div>
  );
}

// ── Add User inline form ──────────────────────────────────────────────────────
function AddUserForm({ existingEmails, onAdd, onCancel }) {
  const [email,   setEmail]   = useState('');
  const [name,    setName]    = useState('');
  const [country, setCountry] = useState('');
  const [role,    setRole]    = useState('readonly');
  const [err,     setErr]     = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setErr('Email is required.'); return; }
    if (!trimmed.endsWith('@f5.com')) { setErr('Must be an @f5.com address.'); return; }
    if (existingEmails.has(trimmed)) { setErr('This user is already registered.'); return; }
    setErr('');
    onAdd({
      email:     trimmed,
      name:      name.trim() || trimmed.split('@')[0],
      country:   country.trim() || '—',
      role,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <form className={styles.addForm} onSubmit={handleSubmit} noValidate>
      <div className={styles.addFormGrid}>
        {/* Email */}
        <div className={styles.addField}>
          <label className={styles.addLabel}>Email <span className={styles.req}>*</span></label>
          <input
            className={[styles.addInput, err ? styles.addInputErr : ''].join(' ')}
            type="text" placeholder="name@f5.com"
            value={email} onChange={e => { setEmail(e.target.value); setErr(''); }}
            autoFocus
          />
          {err && <p className={styles.addErr}>{err}</p>}
        </div>
        {/* Name */}
        <div className={styles.addField}>
          <label className={styles.addLabel}>Display Name</label>
          <input className={styles.addInput} type="text" placeholder="e.g. J. Smith"
            value={name} onChange={e => setName(e.target.value)} />
        </div>
        {/* Country */}
        <div className={styles.addField}>
          <label className={styles.addLabel}>Country</label>
          <input className={styles.addInput} type="text" placeholder="e.g. Singapore"
            value={country} onChange={e => setCountry(e.target.value)} />
        </div>
        {/* Role */}
        <div className={styles.addField}>
          <label className={styles.addLabel}>Initial Role</label>
          <div className={styles.addRoleWrap}>
            <select className={styles.addSelect} value={role} onChange={e => setRole(e.target.value)}>
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
        <button type="submit"  className={styles.btnAdd}>Add User</button>
        <button type="button"  className={styles.btnCancel} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function UsersPage({ currentUserEmail, users: initialUsers, onUsersChange }) {
  const [users,      setUsers]      = useState(initialUsers ?? INITIAL_USERS);
  const [selected,   setSelected]   = useState(new Set());   // emails
  const [showAdd,    setShowAdd]    = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  // Sorted: admin → user → readonly, then alphabetical within group
  const sortedUsers = [...users].sort((a, b) => {
    const order = { admin: 0, user: 1, readonly: 2 };
    const d = order[a.role] - order[b.role];
    return d !== 0 ? d : a.email.localeCompare(b.email);
  });

  const existingEmails = new Set(users.map(u => u.email.toLowerCase()));

  // ── Mutations ──────────────────────────────────────────────────────────────
  const applyUpdate = (updated) => {
    setUsers(updated);
    onUsersChange?.(updated);
  };

  const handleSetRole = (email, newRole) => {
    const admins = users.filter(u => u.role === 'admin');
    if (admins.length === 1 && email === admins[0].email && newRole !== 'admin') {
      alert('Cannot demote the only admin. Promote another user to admin first.');
      return;
    }
    applyUpdate(users.map(u => u.email === email ? { ...u, role: newRole } : u));
  };

  const handleAdd = (newUser) => {
    applyUpdate([...users, newUser]);
    setShowAdd(false);
  };

  const handleDeleteSelected = () => {
    // Protect: cannot delete yourself, cannot delete the last admin
    const admins       = users.filter(u => u.role === 'admin');
    const selfSelected = selected.has(currentUserEmail?.toLowerCase());
    const deletingAllAdmins = admins.every(a => selected.has(a.email.toLowerCase()));

    if (selfSelected) { alert('You cannot delete your own account.'); return; }
    if (deletingAllAdmins) { alert('Cannot delete all admins. Promote another user to admin first.'); return; }

    applyUpdate(users.filter(u => !selected.has(u.email.toLowerCase())));
    setSelected(new Set());
    setConfirmDel(false);
  };

  // ── Selection helpers ──────────────────────────────────────────────────────
  const toggleSelect = (email) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });

  // Select-all scoped to selectable rows (not self)
  const selectableEmails = sortedUsers
    .filter(u => u.email.toLowerCase() !== currentUserEmail?.toLowerCase())
    .map(u => u.email.toLowerCase());

  const allSelected = selectableEmails.length > 0 && selectableEmails.every(e => selected.has(e));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(selectableEmails));
  };

  return (
    <div className={styles.page}>

      {/* ── Page header: fixed, never scrolls ── */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <h1 className={styles.pageTitle}>[MOCK-UP] Users</h1>
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
            <button
              className={styles.btnAddUser}
              onClick={() => { setShowAdd(s => !s); setConfirmDel(false); }}
            >
              {showAdd ? '✕ Cancel' : '+ Add User'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Add user form (inline, below header) ── */}
      {showAdd && (
        <AddUserForm
          existingEmails={existingEmails}
          onAdd={handleAdd}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* ── Table: fixed-height, only the body scrolls ── */}
      <div className={styles.tableWrap}>
        {/* Sticky column header */}
        <div className={styles.tableHead}>
          {/* Select-all checkbox */}
          <div className={styles.colCheck}>
            <label className={styles.checkWrap}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={allSelected}
                onChange={toggleAll}
              />
              <span className={styles.checkMark} />
            </label>
          </div>
          <div className={styles.colUser}>User</div>
          <div className={styles.colCountry}>Country</div>
          <div className={styles.colRole}>Role</div>
          <div className={styles.colActions}>Set Role</div>
          <div className={styles.colAdded}>Added</div>
        </div>

        {/* Scrollable body */}
        <div className={styles.tableBody}>
          {sortedUsers.map(u => {
            const isSelf     = u.email.toLowerCase() === currentUserEmail?.toLowerCase();
            const isSelected = selected.has(u.email.toLowerCase());
            const color      = ROLE_COLORS[u.role];

            return (
              <div
                key={u.email}
                className={[
                  styles.tableRow,
                  isSelf     ? styles.tableRowSelf     : '',
                  isSelected ? styles.tableRowSelected : '',
                ].join(' ')}
              >
                {/* Checkbox */}
                <div className={styles.colCheck}>
                  {isSelf ? (
                    <span className={styles.checkPlaceholder} />
                  ) : (
                    <label className={styles.checkWrap}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={isSelected}
                        onChange={() => toggleSelect(u.email.toLowerCase())}
                      />
                      <span className={styles.checkMark} />
                    </label>
                  )}
                </div>

                {/* Avatar + info */}
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

                {/* Country */}
                <div className={styles.colCountry}>
                  <span className={styles.countryText}>{u.country ?? '—'}</span>
                </div>

                {/* Current role badge */}
                <div className={styles.colRole}>
                  <span className={styles.roleBadge}
                    style={{ background: color.bg, color: color.text }}>
                    {ROLE_LABELS[u.role]}
                  </span>
                </div>

                {/* Role buttons */}
                <div className={styles.colActions}>
                  {isSelf ? (
                    <span className={styles.selfNote}>Cannot change own role</span>
                  ) : (
                    <RoleButtons
                      currentRole={u.role}
                      onSetRole={(r) => handleSetRole(u.email, r)}
                    />
                  )}
                </div>

                {/* Added date */}
                <div className={styles.colAdded}>
                  <span className={styles.addedDate}>
                    {new Date(u.createdAt).toLocaleDateString('en-SG', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className={styles.infoFooter}>
        <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
          <circle cx="7.5" cy="7.5" r="6"/>
          <line x1="7.5" y1="5" x2="7.5" y2="7.5"/>
          <circle cx="7.5" cy="10" r="0.8" fill="currentColor" stroke="none"/>
        </svg>
        {users.length} registered user{users.length !== 1 ? 's' : ''} · Role changes take effect at next login · In production, changes would be persisted to a backend.
      </div>
    </div>
  );
}
