import styles from './AlertsPanel.module.css';

export default function AlertsPanel({ alerts }) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <div className={styles.panelTitle}>Recent Alerts</div>
          <div className={styles.panelSubtitle}>Across all countries</div>
        </div>
      </div>
      <div>
        {alerts.map((a, i) => (
          <div key={i} className={styles.alertItem}>
            <div className={`${styles.dot} ${styles[a.severity]}`} />
            <div>
              <div className={styles.alertText}>{a.text}</div>
              <div className={styles.alertTime}>{a.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
