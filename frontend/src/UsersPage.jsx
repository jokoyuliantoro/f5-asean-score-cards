import { useState, useEffect, useCallback } from 'react';
import { listUsers, createUser, updateUser, deleteUser } from '../api/users';
import { INITIAL_USERS } from '../data/users';
import styles from './UsersPage.module.css';

// ── Role config ───────────────────────────────────────────────────────────────

const ROLE_CONFIG = {
  admin: {
    label: 'Admin',
    desc:  'Full access — probes, reports, Users page, Audit Log',
    color: 'admin',
  },
  user: {
    label: 'User',
    desc:  'Standard access — probes, reports, own Audit Log',
    color: 'user',
  },
  readonly: {
    label: 'Read-Only',
    desc:  'Sample Reports + own Audit Log only',
    color: 'readonly',
  },
};

const ROLES = ['admin', 'user', 'readonly'];

const BUILT_IN_EMAILS = new Set(INITIAL_USERS.map(u => u.email.toLowerCase()));

// ── Sub-components ────────────────────────────────────────────────────────────

function RolePill({ role }) {
  const cfg = ROLE_CONFIG[role] ?? { label: role, color: 'readonly' };
  return (
    <span className={`${styles.rolePill} ${styles[`role_${cfg.color}`]}`}>
      {cfg.label}
    </span>
  );
}

function UserRow({ user, isSelf, onRoleChange, onRemove, isNew }) {
  const [editing,     setEditing]     = useState(false);
  const [pendingRole, setPendingRole] = useState(user.role);
  const [saving,      setSaving]      = useState(false);
  const [rowError,    setRowError]    = useState('');

  const handleSave = async () => {
    if (pendingRole === user.role) { setEditing(false); return; }
    setSaving(true);
    setRowError('');
    const err = await onRoleChange(user.email, pendingRole);
    setSaving(false);
    if (err) {
      setRowError(err);
    } else {
      setEditing(false);
    }
  };

  const handleCancel = () => {
    setPendingRole(user.role);
    setRowError('');
    setEditing(false);
  };

  return (
    <>
      <tr className={`${styles.row} ${isNew ? styles.rowNew : ''}`}>
        {/* indicator */}
        <td className={styles.indicatorCell}>
          <span className={`${styles.indicator} ${styles[`ind_${ROLE_CONFIG[user.role]?.color ?? 'readonly'}`]}`} />
        </td>

        {/* name + email */}
        <td className={styles.identityCell}>
          <span className={styles.userName}>{user.name}</span>
          <span className={styles.userEmail}>{user.email}</span>
          {isSelf && <span className={styles.selfBadge}>you</span>}
        </td>

        {/* role */}
        <td className={styles.roleCell}>
          {editing ? (
            <div className={styles.roleSelectWrap}>
              <select
                className={styles.roleSelect}
                value={pendingRole}
                onChange={e => setPendingRole(e.target.value)}
                disabled={saving}
              >
                {ROLES.map(r => (
                  <option key={r} value={r}>{ROLE_CONFIG[r].label}</option>
                ))}
              </select>
              <span className={styles.roleSelectDesc}>
                {ROLE_CONFIG[pendingRole]?.desc}
              </span>
            </div>
          ) : (
            <RolePill role={user.role} />
          )}
        </td>

        {/* source badge */}
        <td className={styles.sourceCell}>
          <span className={`${styles.sourceBadge} ${
            BUILT_IN_EMAILS.has(user.email.toLowerCase()) ? styles.sourceBuiltIn : styles.sourceAdded
          }`}>
            {BUILT_IN_EMAILS.has(user.email.toLowerCase()) ? 'Built-in' : 'Added'}
          </span>
        </td>

        {/* actions */}
        <td className={styles.actionsCell}>
          {isSelf ? (
            <span className={styles.selfNote}>Cannot edit own account</span>
          ) : editing ? (
            <div className={styles.editActions}>
              <button className={styles.btnSave}   onClick={handleSave}   disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className={styles.btnCancel} onClick={handleCancel} disabled={saving}>
                Cancel
              </button>
            </div>
          ) : (
            <div className={styles.editActions}>
              <button className={styles.btnEdit} onClick={() => { setEditing(true); setRowError(''); }}>
                Change Role
              </button>
              {!BUILT_IN_EMAILS.has(user.email.toLowerCase()) && (
                <button className={styles.btnRemove} onClick={() => onRemove(user.email)}>
                  Remove
                </button>
              )}
            </div>
          )}
        </td>
      </tr>
      {rowError && (
        <tr className={styles.errorRow}>
          <td colSpan={5} className={styles.rowErrorCell}>{rowError}</td>
        </tr>
      )}
    </>
  );
}

// ── Add-user form ─────────────────────────────────────────────────────────────

function AddUserForm({ existingEmails, onAdd, onCancel }) {
  const [email,   setEmail]   = useState('');
  const [name,    setName]    = useState('');
  const [role,    setRole]    = useState('readonly');
  const [error,   setError]   = useState('');
  const [saving,  setSaving]  = useState(false);

  const handleAdd = async () => {
    const norm = email.trim().toLowerCase();
    if (!norm)                               return setError('Email is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm)) return setError('Enter a valid email address.');
    if (existingEmails.has(norm))           return setError('This address is already in the registry.');

    setSaving(true);
    setError('');
    const err = await onAdd({ email: norm, name: name.trim() || norm, role });
    setSaving(false);
    if (err) setError(err);
  };

  return (
    <div className={styles.addForm}>
      <h3 className={styles.addFormTitle}>Add User</h3>

      {error && <p className={styles.formError}>{error}</p>}

      <div className={styles.formGrid}>
        <label className={styles.formLabel}>
          Email address
          <input
            type="email"
            className={styles.formInput}
            placeholder="user@example.com"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(''); }}
            disabled={saving}
          />
        </label>

        <label className={styles.formLabel}>
          Display name <span className={styles.formOptional}>(optional)</span>
          <input
            type="text"
            className={styles.formInput}
            placeholder="First Last"
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={saving}
          />
        </label>

        <label className={styles.formLabel}>
          Role
          <div className={styles.roleSelectWrap}>
            <select
              className={styles.roleSelect}
              value={role}
              onChange={e => setRole(e.target.value)}
              disabled={saving}
            >
              {ROLES.map(r => (
                <option key={r} value={r}>{ROLE_CONFIG[r].label}</option>
              ))}
            </select>
            <span className={styles.roleSelectDesc}>{ROLE_CONFIG[role]?.desc}</span>
          </div>
        </label>
      </div>

      <div className={styles.formFooter}>
        <button className={styles.btnSave}   onClick={handleAdd}  disabled={saving}>
          {saving ? 'Adding…' : 'Add User'}
        </button>
        <button className={styles.btnCancel} onClick={onCancel}   disabled={saving}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function UsersPage({ currentUserEmail, idToken }) {
  const [users,       setUsers]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [pageError,   setPageError]   = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmails,   setNewEmails]   = useState(new Set());

  // ── Initial load ────────────────────────────────────────────────────────────
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

  // ── CRUD callbacks ──────────────────────────────────────────────────────────

  const handleRoleChange = async (email, newRole) => {
    const { data, error } = await updateUser(idToken, email, { role: newRole });
    if (error) return error;          // return error string to UserRow
    setUsers(prev => prev.map(u => u.email === email ? data.user : u));
    return null;
  };

  const handleRemove = async (email) => {
    const { error } = await deleteUser(idToken, email);
    if (error) {
      setPageError(`Could not remove ${email}: ${error}`);
      return;
    }
    setUsers(prev => prev.filter(u => u.email !== email));
    setNewEmails(prev => { const n = new Set(prev); n.delete(email); return n; });
  };

  const handleAdd = async ({ email, name, role }) => {
    const { data, error } = await createUser(idToken, { email, name, role });
    if (error) return error;          // return error string to AddUserForm
    setUsers(prev => [...prev, data.user]);
    setNewEmails(prev => new Set([...prev, email]));
    setShowAddForm(false);
    return null;
  };

  // ── Derived ─────────────────────────────────────────────────────────────────
  const existingEmails = new Set(users.map(u => u.email.toLowerCase()));
  const adminCount    = users.filter(u => u.role === 'admin').length;
  const userCount     = users.filter(u => u.role === 'user').length;
  const readonlyCount = users.filter(u => u.role === 'readonly').length;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <div className={styles.headerIcon}>
            <svg width="18" height="18" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="7.5" cy="5" r="2.5"/>
              <path d="M2 13c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/>
            </svg>
          </div>
          <div>
            <h1 className={styles.title}>User Registry</h1>
            <p className={styles.subtitle}>
              Manage who can access the tool and at what privilege level
            </p>
          </div>
        </div>

        {/* stat chips */}
        {!loading && !pageError && (
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statVal}>{users.length}</span>
              <span className={styles.statLabel}>Total</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <span className={`${styles.statVal} ${styles.statAdmin}`}>{adminCount}</span>
              <span className={styles.statLabel}>Admin</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <span className={`${styles.statVal} ${styles.statUser}`}>{userCount}</span>
              <span className={styles.statLabel}>User</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <span className={styles.statVal}>{readonlyCount}</span>
              <span className={styles.statLabel}>Read-Only</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Role legend ── */}
      <div className={styles.legend}>
        {ROLES.map(r => (
          <div key={r} className={styles.legendItem}>
            <RolePill role={r} />
            <span className={styles.legendDesc}>{ROLE_CONFIG[r].desc}</span>
          </div>
        ))}
      </div>

      {/* ── Page-level error ── */}
      {pageError && (
        <div className={styles.pageError}>
          <span className={styles.pageErrorIcon}>⚠</span>
          {pageError}
          <button className={styles.retryBtn} onClick={loadUsers}>Retry</button>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className={styles.loadingWrap}>
          <div className={styles.spinner} />
          <span className={styles.loadingText}>Loading users…</span>
        </div>
      )}

      {/* ── Add user / toolbar ── */}
      {!loading && !pageError && !showAddForm && (
        <div className={styles.toolbar}>
          <button className={styles.btnAdd} onClick={() => setShowAddForm(true)}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="1" x2="6" y2="11"/>
              <line x1="1" y1="6" x2="11" y2="6"/>
            </svg>
            Add User
          </button>
          <span className={styles.toolbarNote}>
            Changes are written to DynamoDB immediately.
          </span>
        </div>
      )}

      {showAddForm && (
        <AddUserForm
          existingEmails={existingEmails}
          onAdd={handleAdd}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* ── Table ── */}
      {!loading && !pageError && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.thead}>
                <th className={styles.thIndicator} />
                <th className={styles.th}>User</th>
                <th className={styles.th}>Role</th>
                <th className={styles.th}>Source</th>
                <th className={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <UserRow
                  key={user.email}
                  user={user}
                  isSelf={user.email.toLowerCase() === currentUserEmail?.toLowerCase()}
                  onRoleChange={handleRoleChange}
                  onRemove={handleRemove}
                  isNew={newEmails.has(user.email)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.sessionNote}>
        Changes are persisted to DynamoDB and take effect on the user's next login.
        Built-in users cannot be removed — update <code>INITIAL_USERS</code> in{' '}
        <code>src/data/users.js</code> and redeploy to make permanent changes.
      </p>
    </div>
  );
}
