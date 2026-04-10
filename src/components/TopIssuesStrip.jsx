import { useState } from 'react';
import { TOP_ISSUES_DATA, SCAN_GROUPS, ACCOUNTS, daysAgo, fmtTimestamp } from '../data/appData';
import styles from './TopIssuesStrip.module.css';

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const SEV_CLASS = {
  critical: styles.sevCritical,
  high:     styles.sevHigh,
  medium:   styles.sevMedium,
  low:      styles.sevLow,
};
const SEV_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

// Expanded detail panel shown below the 3 cards when one is clicked
function IssueDetail({ issue, onClose }) {
  const sg      = SCAN_GROUPS.find(s => s.id === issue.scanGroupId);
  const account = ACCOUNTS.find(a => a.id === sg?.accountId);

  // Severity-specific mock remediation text
  const remediation = {
    critical: 'Treat as P1. Escalate to security team immediately. Isolate affected endpoint if possible. Deploy emergency WAF rule via F5 XC App Protect while patch is being developed.',
    high:     'Schedule remediation within 72 hours. Review affected configuration, apply vendor patch or interim mitigation. Validate with F5 XC policy before re-probing.',
    medium:   'Plan remediation in next sprint. Review configuration against OWASP guidelines. Consider deploying F5 XC Bot Defense as interim protection.',
    low:      'Include in next maintenance window. No immediate risk. Document and track to closure.',
  }[issue.severity];

  return (
    <div className={[styles.detailPanel, SEV_CLASS[issue.severity]].join(' ')}>
      <div className={styles.detailHeader}>
        <div className={styles.detailTitleRow}>
          <span className={[styles.sevBadge, styles.sevBadgeLg].join(' ')}>
            {SEV_LABEL[issue.severity]}
          </span>
          <span className={styles.detailPillar}>{issue.pillar}</span>
          <span className={styles.detailTitle}>{issue.title}</span>
        </div>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close detail">
          <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="2" y1="2" x2="13" y2="13"/><line x1="13" y1="2" x2="2" y2="13"/>
          </svg>
        </button>
      </div>

      <div className={styles.detailGrid}>
        <div className={styles.detailBlock}>
          <span className={styles.detailBlockLabel}>Domain</span>
          <span className={styles.detailBlockValue} style={{ fontFamily: 'monospace' }}>{issue.domain}</span>
        </div>
        <div className={styles.detailBlock}>
          <span className={styles.detailBlockLabel}>Account</span>
          <span className={styles.detailBlockValue}>{account?.name}</span>
        </div>
        <div className={styles.detailBlock}>
          <span className={styles.detailBlockLabel}>Probe Group</span>
          <span className={styles.detailBlockValue}>{sg?.name}</span>
        </div>
        <div className={styles.detailBlock}>
          <span className={styles.detailBlockLabel}>Detected</span>
          <span className={styles.detailBlockValue}>{fmtTimestamp(issue.createdAt)} ({daysAgo(issue.createdAt)})</span>
        </div>
      </div>

      <div className={styles.detailRemediation}>
        <span className={styles.detailRemLabel}>Recommended Action</span>
        <p className={styles.detailRemText}>{remediation}</p>
      </div>
    </div>
  );
}

export default function TopIssuesStrip({ accountId }) {
  const [expanded,    setExpanded]    = useState(true);   // section collapse
  const [activeIssue, setActiveIssue] = useState(null);   // id of expanded card

  const relevantGroupIds = SCAN_GROUPS
    .filter(sg => accountId === 'all' || sg.accountId === accountId)
    .map(sg => sg.id);

  const issues = TOP_ISSUES_DATA
    .filter(i => relevantGroupIds.includes(i.scanGroupId))
    .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
    .slice(0, 3);

  const handleCardClick = (id) =>
    setActiveIssue(prev => prev === id ? null : id);

  const activeIssueData = issues.find(i => i.id === activeIssue);

  return (
    <div className={styles.section}>
      {/* ── Collapsible header ── */}
      <button
        className={styles.header}
        onClick={() => { setExpanded(e => !e); setActiveIssue(null); }}
        aria-expanded={expanded}
      >
        <span className={[styles.triangle, expanded ? styles.triangleOpen : ''].join(' ')} />
        <span className={styles.sectionTitle}>Top Issues</span>
        <span className={styles.sectionSub}>
          {issues.length === 0
            ? 'No issues found for selected account'
            : `Top ${issues.length} by severity across all probe groups`}
        </span>
      </button>

      {expanded && (
        <>
          {issues.length === 0 ? null : (
            <div className={styles.strip}>
              {issues.map(issue => {
                const sg      = SCAN_GROUPS.find(s => s.id === issue.scanGroupId);
                const account = ACCOUNTS.find(a => a.id === sg?.accountId);
                const isActive = activeIssue === issue.id;
                return (
                  <button
                    key={issue.id}
                    className={[styles.card, SEV_CLASS[issue.severity], isActive ? styles.cardActive : ''].join(' ')}
                    onClick={() => handleCardClick(issue.id)}
                    aria-pressed={isActive}
                  >
                    <div className={styles.cardTop}>
                      <span className={styles.sevBadge}>{SEV_LABEL[issue.severity]}</span>
                      <span className={styles.pillarTag}>{issue.pillar}</span>
                    </div>
                    <p className={styles.issueTitle}>{issue.title}</p>
                    <div className={styles.meta}>
                      <span className={styles.metaLine}>
                        from <strong>{sg?.name}</strong>{' · '}{account?.name}
                      </span>
                      <span className={styles.metaDomain}>{issue.domain}</span>
                      <span className={styles.metaTime}>{daysAgo(issue.createdAt)}</span>
                    </div>
                    <span className={styles.cardCta}>
                      {isActive ? 'Hide details ↑' : 'View details ↓'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Detail panel — inline, below cards, pushes ReportList down */}
          {activeIssueData && (
            <IssueDetail
              issue={activeIssueData}
              onClose={() => setActiveIssue(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
