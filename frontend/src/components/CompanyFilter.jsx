import styles from './CompanyFilter.module.css';
import { ACCOUNTS } from '../data/appData';

export default function CompanyFilter({ value, onChange }) {
  const active = ACCOUNTS.filter(a => !a.archived);

  return (
    <div className={styles.wrap}>
      <span className={styles.prefix}>[MOCK-UP] Dashboard for</span>
      <div className={styles.selectWrap}>
        <select
          className={styles.select}
          value={value}
          onChange={e => onChange(e.target.value)}
        >
          <option value="all">All Accounts</option>
          {active.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <span className={styles.chevron}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
               stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M2 4.5l4 4 4-4"/>
          </svg>
        </span>
      </div>
    </div>
  );
}
