import { useState } from 'react';
import CompanyFilter   from './CompanyFilter';
import TopIssuesStrip  from './TopIssuesStrip';
import ReportList      from './ReportList';
import styles from './Dashboard.module.css';

export default function Dashboard() {
  const [accountId, setAccountId] = useState('all');

  return (
    <div className={styles.content}>
      <div className={styles.pageHeader}>
        <CompanyFilter value={accountId} onChange={(v) => { setAccountId(v); }} />
      </div>
      <TopIssuesStrip key={accountId} accountId={accountId} />
      <ReportList key={`rl-${accountId}`} accountId={accountId} />
    </div>
  );
}
