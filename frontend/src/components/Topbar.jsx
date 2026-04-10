import { ROLE_LABELS, ROLE_COLORS } from '../data/users';
import styles from './Topbar.module.css';

export default function Topbar({ email, role, onLogout, title = 'Application Resilience Score Cards' }) {
  const roleLabel  = ROLE_LABELS[role]  ?? role ?? '';
  const roleColor  = ROLE_COLORS[role]  ?? ROLE_COLORS.readonly;

  return (
    <div className={styles.topbar}>
      <span className={styles.title}>{title}</span>
      <span className={styles.liveBadge}>Live</span>

      <div className={styles.userInfo}>
        <span className={styles.email}>{email}</span>
        {roleLabel && (
          <span
            className={styles.roleBadge}
            style={{ background: roleColor.bg, color: roleColor.text }}
          >
            {roleLabel}
          </span>
        )}
      </div>

      <button className={styles.logoutBtn} onClick={onLogout}>Log out</button>
    </div>
  );
}
