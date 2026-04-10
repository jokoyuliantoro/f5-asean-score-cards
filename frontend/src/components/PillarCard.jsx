import styles from './PillarCard.module.css';

const SCORE_COLOR = (s) => {
  if (s >= 85) return '#35d068';
  if (s >= 70) return '#4f73ff';
  if (s >= 55) return '#ffc400';
  return '#f94627';
};

const STATUS_CLASS = {
  Excellent: styles.badgeGreen,
  Good:      styles.badgeBlue,
  Fair:      styles.badgeAmber,
  'At Risk': styles.badgeRed,
};

export default function PillarCard({ id, icon, label, description, score, status, coverage, active, onClick }) {
  const color = SCORE_COLOR(score);
  const pct   = score;

  return (
    <button
      className={[styles.card, active ? styles.active : ''].join(' ')}
      onClick={() => onClick(id)}
      aria-pressed={active}
    >
      <div className={styles.top}>
        <span className={styles.iconWrap}>{icon}</span>
        <span className={[styles.badge, STATUS_CLASS[status]].join(' ')}>{status}</span>
      </div>

      <div className={styles.label}>{label}</div>
      <div className={styles.desc}>{description}</div>

      <div className={styles.scoreRow}>
        <span className={styles.scoreNum} style={{ color }}>{score}</span>
        <span className={styles.scoreOf}>/100</span>
      </div>

      <div className={styles.barTrack}>
        <div className={styles.barFill} style={{ width: `${pct}%`, background: color }} />
      </div>

      <div className={styles.coverage}>{coverage}</div>

      <div className={styles.cta}>
        {active ? 'Viewing sample report ↓' : 'View sample report →'}
      </div>
    </button>
  );
}
