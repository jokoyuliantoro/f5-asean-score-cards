import { SCAN_ACTIVITY } from '../data/sampleReports';
import styles from './ScanActivity.module.css';

const SCORE_COLOR = (s) => {
  if (s >= 85) return '#35d068';
  if (s >= 70) return '#4f73ff';
  if (s >= 55) return '#ffc400';
  return '#f94627';
};

const TYPE_ICON = {
  'DNS':          '🌐',
  'HTTPS':        '🔒',
  'Surface Probe': '🔍',
  'Deep Probe':    '🔬',
};

export default function ScanActivity() {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.title}>Last Probe Activity</div>
        <div className={styles.subtitle}>Most recent runs for this account</div>
      </div>
      {SCAN_ACTIVITY.map((row, i) => (
        <div key={i} className={styles.row}>
          <span className={styles.typeIcon} aria-hidden="true">
            {TYPE_ICON[row.type]}
          </span>
          <div className={styles.meta}>
            <div className={styles.type}>{row.type}</div>
            <div className={styles.domain}>{row.domain}</div>
          </div>
          <div className={styles.right}>
            <span
              className={styles.score}
              style={{ color: SCORE_COLOR(row.score) }}
            >
              {row.score}
            </span>
            <span className={styles.time}>{row.time}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
