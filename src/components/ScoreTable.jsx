import { scoreColor } from '../data/countries';
import styles from './ScoreTable.module.css';

const STATUS_CLASS = {
  Excellent: styles.badgeGreen,
  Good:      styles.badgePurple,
  Fair:      styles.badgeAmber,
  'At Risk': styles.badgeRed,
};

export default function ScoreTable({ countries }) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <div className={styles.panelTitle}>Country Score Breakdown</div>
          <div className={styles.panelSubtitle}>Overall and per-category resilience scores</div>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Country</th>
              <th>Overall Score</th>
              <th>WAF</th>
              <th>DDoS</th>
              <th>Bot Defense</th>
              <th>API Security</th>
              <th>Status</th>
              <th>Trend (30d)</th>
            </tr>
          </thead>
          <tbody>
            {countries.map(c => (
              <tr key={c.code}>
                <td><strong>{c.name}</strong></td>
                <td>
                  <div className={styles.scoreCell}>
                    <div className={styles.barWrap}>
                      <div
                        className={styles.bar}
                        style={{ width: `${c.score}%`, background: scoreColor(c.score) }}
                      />
                    </div>
                    <strong>{c.score}</strong>
                  </div>
                </td>
                <td>{c.waf}</td>
                <td>{c.ddos}</td>
                <td>{c.bot}</td>
                <td>{c.api}</td>
                <td>
                  <span className={`${styles.badge} ${STATUS_CLASS[c.status]}`}>
                    {c.status}
                  </span>
                </td>
                <td
                  className={styles.trend}
                  style={{ color: parseFloat(c.trend) >= 0 ? '#1ba554' : 'var(--f5-pomegranate)' }}
                >
                  {parseFloat(c.trend) >= 0 ? '▲' : '▼'} {c.trend}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
