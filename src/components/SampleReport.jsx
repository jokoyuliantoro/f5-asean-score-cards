import { DNS_SAMPLE, HTTPS_SAMPLE, SURFACE_SAMPLE, DEEP_SAMPLE, SAMPLE_CUSTOMER, SAMPLE_DOMAIN } from '../data/sampleReports';
import styles from './SampleReport.module.css';

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

const SEV_CLASS = {
  critical: styles.sevCritical,
  high:     styles.sevHigh,
  medium:   styles.sevMedium,
  low:      styles.sevLow,
};

const SEV_LABEL = {
  critical: 'Critical',
  high:     'High',
  medium:   'Medium',
  low:      'Low',
};

function ScorePill({ score }) {
  const color =
    score >= 85 ? '#35d068' :
    score >= 70 ? '#4f73ff' :
    score >= 55 ? '#ffc400' :
    '#f94627';
  return (
    <span className={styles.scorePill} style={{ background: color }}>
      {score}
    </span>
  );
}

// ── DNS report ────────────────────────────────────────────────────────────────
function DnsReport() {
  const d = DNS_SAMPLE;
  return (
    <>
      <p className={styles.summary}>{d.summary}</p>
      <div className={styles.dimGrid}>
        {d.dimensions.map(dim => (
          <div key={dim.label} className={styles.dimCard}>
            <div className={styles.dimHeader}>
              <span className={styles.dimLabel}>{dim.label}</span>
              <ScorePill score={dim.score} />
            </div>
            <ul className={styles.findingList}>
              {dim.findings.map((f, i) => (
                <li key={i} className={styles.findingItem}>{f}</li>
              ))}
            </ul>
            <div className={styles.recommendation}>
              <span className={styles.recLabel}>Recommendation</span>
              {dim.recommendation}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.runInfo}>Probe completed: {d.lastRun}</div>
    </>
  );
}

// ── HTTPS report ──────────────────────────────────────────────────────────────
function HttpsReport() {
  const d = HTTPS_SAMPLE;
  return (
    <>
      <p className={styles.summary}>{d.summary}</p>
      <div className={styles.dimGrid}>
        {d.dimensions.map(dim => (
          <div key={dim.label} className={styles.dimCard}>
            <div className={styles.dimHeader}>
              <span className={styles.dimLabel}>{dim.label}</span>
              <ScorePill score={dim.score} />
            </div>
            <ul className={styles.findingList}>
              {dim.findings.map((f, i) => (
                <li key={i} className={styles.findingItem}>{f}</li>
              ))}
            </ul>
            <div className={styles.recommendation}>
              <span className={styles.recLabel}>Recommendation</span>
              {dim.recommendation}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.runInfo}>Probe completed: {d.lastRun}</div>
    </>
  );
}

// ── Surface / Deep scan report (shared finding-table layout) ─────────────────
function ScanReport({ data }) {
  const sorted = [...data.findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
  return (
    <>
      <p className={styles.summary}>{data.summary}</p>
      <div className={styles.findingTable}>
        {sorted.map((f, i) => (
          <div key={i} className={styles.findingRow}>
            <div className={styles.findingMeta}>
              <span className={[styles.sevBadge, SEV_CLASS[f.severity]].join(' ')}>
                {SEV_LABEL[f.severity]}
              </span>
              <span className={styles.findingAffected}>{f.affected}</span>
            </div>
            <div className={styles.findingTitle}>{f.title}</div>
            <div className={styles.findingDetail}>{f.detail}</div>
            <div className={styles.recommendation}>
              <span className={styles.recLabel}>Remediation</span>
              {f.remediation}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.runInfo}>Probe completed: {data.lastRun}</div>
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
const TITLES = {
  dns:            'DNS Probe',
  https:          'HTTPS Probe',
  'surface-scan': 'Surface Probe',
  'deep-scan':    'Deep Probe',
};

export default function SampleReport({ pillar }) {
  return (
    <div className={styles.wrapper}>
      {/* Header banner */}
      <div className={styles.banner}>
        <div className={styles.bannerLeft}>
          <span className={styles.sampleTag}>Sample Report</span>
          <span className={styles.bannerTitle}>{TITLES[pillar]}</span>
        </div>
        <div className={styles.bannerMeta}>
          <span>{SAMPLE_CUSTOMER}</span>
          <span className={styles.dot} />
          <span>{SAMPLE_DOMAIN}</span>
        </div>
      </div>

      {/* Score strip */}
      <div className={styles.scoreStrip}>
        <div className={styles.scoreBlock}>
          <span className={styles.scoreLabel}>Overall Score</span>
          <span className={styles.scoreBig}>
            {{
              dns:            DNS_SAMPLE.overallScore,
              https:          HTTPS_SAMPLE.overallScore,
              'surface-scan': SURFACE_SAMPLE.overallScore,
              'deep-scan':    DEEP_SAMPLE.overallScore,
            }[pillar]}
          </span>
          <span className={styles.scoreMax}>/100</span>
        </div>
        <p className={styles.disclaimer}>
          All data shown is illustrative. This sample demonstrates the format and depth of a real report.
          Actual findings will reflect your specific infrastructure.
        </p>
      </div>

      {/* Report body */}
      <div className={styles.body}>
        {pillar === 'dns'            && <DnsReport />}
        {pillar === 'https'          && <HttpsReport />}
        {pillar === 'surface-scan'   && <ScanReport data={SURFACE_SAMPLE} />}
        {pillar === 'deep-scan'      && <ScanReport data={DEEP_SAMPLE} />}
      </div>
    </div>
  );
}
