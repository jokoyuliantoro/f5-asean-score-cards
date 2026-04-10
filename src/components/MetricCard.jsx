import styles from './MetricCard.module.css';

export default function MetricCard({ label, value, delta, deltaType = 'up', accent }) {
  return (
    <div className={`${styles.card} ${accent ? styles[accent] : ''}`}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value}</div>
      {delta && (
        <div className={`${styles.delta} ${styles[deltaType]}`}>
          {deltaType === 'up' ? '▲' : '▼'} {delta}
        </div>
      )}
    </div>
  );
}
