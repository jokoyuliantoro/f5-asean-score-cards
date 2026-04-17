import { useState } from 'react';
import PillarCard  from './PillarCard';
import SampleReport from './SampleReport';
import { DNS_SAMPLE, HTTPS_SAMPLE, SURFACE_SAMPLE, DEEP_SAMPLE } from '../data/sampleReports';
import styles from './SampleReportsPage.module.css';

// Label names are kept consistent with the sidebar (DNS Discovery, HTTPS Discovery, etc.)
const PILLARS = [
  {
    id: 'dns',
    label: 'DNS Discovery',
    description: 'Resilience · Stability · Response Time',
    score: DNS_SAMPLE.overallScore,
    status: DNS_SAMPLE.status,
    coverage: '4 nameservers measured',
    icon: (
      <svg width="22" height="22" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3">
        <circle cx="7.5" cy="7.5" r="6"/>
        <ellipse cx="7.5" cy="7.5" rx="2.6" ry="6"/>
        <line x1="1.5" y1="7.5"  x2="13.5" y2="7.5"/>
        <line x1="2"   y1="4.5"  x2="13"   y2="4.5"/>
        <line x1="2"   y1="10.5" x2="13"   y2="10.5"/>
      </svg>
    ),
  },
  {
    id: 'https',
    label: 'HTTPS Discovery',
    description: 'IP Anycast · TLS · TTFB',
    score: HTTPS_SAMPLE.overallScore,
    status: HTTPS_SAMPLE.status,
    coverage: '5 subdomains · 6 ASEAN PoPs tested',
    icon: (
      <svg width="22" height="22" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3">
        <rect x="3" y="6.5" width="9" height="7" rx="1"/>
        <path d="M5 6.5V4.5a2.5 2.5 0 0 1 5 0v2"/>
        <circle cx="7.5" cy="10" r="1" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
  {
    id: 'surface-scan',
    label: 'Surface Discovery',
    description: 'Public endpoints · No credentials required',
    score: SURFACE_SAMPLE.overallScore,
    status: SURFACE_SAMPLE.status,
    coverage: `${SURFACE_SAMPLE.findings.length} findings across public endpoints`,
    icon: (
      <svg width="22" height="22" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3">
        <circle cx="6.5" cy="6.5" r="4"/>
        <line x1="9.5" y1="9.5" x2="13" y2="13"/>
      </svg>
    ),
  },
  {
    id: 'deep-scan',
    label: 'Deep Discovery',
    description: 'Authenticated · F5 forward proxy traffic analysis',
    score: DEEP_SAMPLE.overallScore,
    status: DEEP_SAMPLE.status,
    coverage: `${DEEP_SAMPLE.findings.length} findings via authenticated traffic replay`,
    icon: (
      <svg width="22" height="22" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3">
        <circle cx="6.5" cy="6.5" r="4"/>
        <line x1="9.5" y1="9.5" x2="13" y2="13"/>
        <circle cx="6.5" cy="6.5" r="1.8" strokeDasharray="2 1.5"/>
      </svg>
    ),
  },
];

export default function SampleReportsPage() {
  const [activePillar, setActivePillar] = useState('dns');

  const handleCardClick = (id) =>
    setActivePillar(prev => prev === id ? null : id);

  return (
    <div className={styles.page}>
      {/* ── Page header ── */}
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.pillarBadge}>
            <svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M7.5 1.5v2M7.5 11.5v2M1.5 7.5h2M11.5 7.5h2"/>
              <path d="M3.7 3.7l1.4 1.4M9.9 9.9l1.4 1.4M9.9 5.1l1.4-1.4M3.7 11.3l1.4-1.4"/>
              <circle cx="7.5" cy="7.5" r="2.5"/>
            </svg>
            Sample Reports
          </div>
          <h1 className={styles.pageTitle}>What a real report looks like</h1>
          <p className={styles.pageSubtitle}>
            Illustrative findings for <strong>Acme Bank (Sample)</strong> across all four assessment pillars.
            Select a pillar below to explore its report format and depth.
          </p>
        </div>
        <div className={styles.disclaimer}>
          <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="7.5" cy="7.5" r="6"/>
            <line x1="7.5" y1="5" x2="7.5" y2="7.5"/>
            <circle cx="7.5" cy="10" r="0.8" fill="currentColor" stroke="none"/>
          </svg>
          All data is illustrative and does not represent any real customer infrastructure.
        </div>
      </div>

      {/* ── Pillar selector cards ── */}
      <div className={styles.pillarsGrid}>
        {PILLARS.map(p => (
          <PillarCard
            key={p.id}
            {...p}
            active={activePillar === p.id}
            onClick={handleCardClick}
          />
        ))}
      </div>

      {/* ── Sample report body ── */}
      {activePillar && (
        <div className={styles.reportWrap}>
          <SampleReport pillar={activePillar} />
        </div>
      )}
    </div>
  );
}
