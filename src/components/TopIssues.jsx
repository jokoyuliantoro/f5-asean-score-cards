import { TOP_ISSUES } from '../data/sampleReports';
import styles from './TopIssues.module.css';

const SEV_CLASS = {
  critical: styles.sevCritical,
  high:     styles.sevHigh,
  medium:   styles.sevMedium,
  low:      styles.sevLow,
};

export default function TopIssues() {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.title}>Top Issues</div>
        <div className={styles.subtitle}>Ranked by severity across all pillars</div>
      </div>
      {TOP_ISSUES.map((issue, i) => (
        <div key={i} className={styles.row}>
          <span className={[styles.sev, SEV_CLASS[issue.severity]].join(' ')}>
            {issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1)}
          </span>
          <div className={styles.content}>
            <div className={styles.text}>{issue.text}</div>
            <div className={styles.pillar}>{issue.pillar}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
