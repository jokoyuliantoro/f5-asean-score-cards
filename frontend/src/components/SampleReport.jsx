import { useState } from 'react';
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
  const [aiOpen, setAiOpen] = useState(true);
  const [openRemediation, setOpenRemediation] = useState({});
  const [openVerify, setOpenVerify] = useState({});

  const toggleRemediation = (i) =>
    setOpenRemediation(p => ({ ...p, [i]: !p[i] }));
  const toggleVerify = (i) =>
    setOpenVerify(p => ({ ...p, [i]: !p[i] }));

  const findings = [
    {
      severity: 'critical',
      style: { borderLeft: '3px solid rgb(185,28,28)', background: 'rgb(255,240,240)' },
      badgeStyle: { background: 'rgb(255,240,240)', border: '1px solid rgb(252,165,165)', color: 'rgb(185,28,28)' },
      title: 'Self-hosted nameservers (Self-hosted (acmebank-demo.example)) — no external DNS redundancy',
      detail: "All nameservers are on the organisation's own infrastructure. A network outage, DDoS attack, or infrastructure failure takes down DNS alongside the application — there is no independent provider to maintain resolution during an incident.",
      remediation: 'Add a secondary DNS provider on a separate Anycast network. F5 Distributed Cloud DNS acts as a resilient secondary — ensuring resolution survives any single-provider incident, with automatic zone sync and failover.',
      verify: 'Run: dig NS acmebank-demo.example — if all NS records resolve to IPs within the same ASN, there is no external redundancy.',
    },
    {
      severity: 'high',
      style: { borderLeft: '3px solid rgb(194,65,12)', background: 'rgb(255,247,237)' },
      badgeStyle: { background: 'rgb(255,247,237)', border: '1px solid rgb(254,215,170)', color: 'rgb(194,65,12)' },
      title: 'Nameservers use unicast — no DDoS absorption capacity',
      detail: 'Unicast nameservers have fixed IPs with no geographic distribution. A volumetric DDoS attack targets those IPs directly — there is no network-layer mechanism to absorb or distribute the traffic.',
      remediation: 'Migrate to an Anycast DNS provider. F5 XC DNS announces the same prefix from 30+ PoPs globally; attack traffic is distributed across the network rather than concentrating on a single target.',
      verify: 'Run: whois <NS IP> — if all nameserver IPs belong to a single ASN with no Anycast announcement, unicast is confirmed.',
    },
    {
      severity: 'high',
      style: { borderLeft: '3px solid rgb(194,65,12)', background: 'rgb(255,247,237)' },
      badgeStyle: { background: 'rgb(255,247,237)', border: '1px solid rgb(254,215,170)', color: 'rgb(194,65,12)' },
      title: 'No geo-steering — all users directed to a single unicast endpoint',
      detail: 'All nameservers return a single IP with no anycast distribution. Every user worldwide is directed to the same physical endpoint regardless of location. There is no geographic failover — if this IP goes down, the application is unavailable globally.',
      remediation: 'Deploy Global Server Load Balancing (GSLB) with health-check-aware routing. F5 XC GSLB steers traffic to the nearest healthy origin and fails over within seconds of an origin going down.',
      verify: 'Run: dig A www.acmebank-demo.example from multiple global resolvers (e.g. 8.8.8.8 and 1.1.1.1 from different regions) — if all return identical IPs, no geo-steering is in place.',
    },
    {
      severity: 'medium',
      style: { borderLeft: '3px solid rgb(146,64,14)', background: 'rgb(255,251,235)' },
      badgeStyle: { background: 'rgb(255,251,235)', border: '1px solid rgb(253,230,138)', color: 'rgb(146,64,14)' },
      title: 'DNSSEC not enabled — DNS cache poisoning risk',
      detail: 'Without DNSSEC, DNS responses can be spoofed or poisoned in transit, redirecting users to attacker-controlled servers without detection.',
      remediation: 'Enable DNSSEC signing on the zone. F5 XC DNS provides automated key management and signing, removing the operational overhead of manual key rotation.',
      verify: 'Run: dig DS acmebank-demo.example — if no DS record is returned, DNSSEC is not enabled. Confirm with: dig DNSKEY acmebank-demo.example.',
    },
    {
      severity: 'medium',
      style: { borderLeft: '3px solid rgb(146,64,14)', background: 'rgb(255,251,235)' },
      badgeStyle: { background: 'rgb(255,251,235)', border: '1px solid rgb(253,230,138)', color: 'rgb(146,64,14)' },
      title: 'No health-check-aware DNS failover detected',
      detail: 'A single static IP with no anycast means there is no DNS-level failover. If the origin goes down, users see failures until an operator manually updates DNS records.',
      remediation: 'Configure active health monitors on origin pools. F5 XC health checks detect origin failure in under 10 seconds and automatically reroute traffic without manual intervention.',
      verify: 'Simulate origin failure and observe DNS — if the A record does not change within 30 seconds, health-check-aware failover is absent.',
    },
    {
      severity: 'low',
      style: { borderLeft: '3px solid rgb(22,101,52)', background: 'rgb(240,253,244)' },
      badgeStyle: { background: 'rgb(240,253,244)', border: '1px solid rgb(187,247,208)', color: 'rgb(22,101,52)' },
      title: 'No AAAA records — not dual-stack (IPv6) ready',
      detail: 'IPv6 adoption exceeds 40% globally and is higher in mobile-first SEA markets. Dual-stack is increasingly a baseline requirement.',
      remediation: 'Add AAAA records for the domain. F5 XC HTTP Load Balancer natively serves dual-stack traffic, handling IPv6 termination without changes to origin infrastructure.',
      verify: 'Run: dig AAAA www.acmebank-demo.example — if NOERROR is returned with no AAAA records, IPv6 is not configured.',
    },
  ];

  const aiSections = [
    {
      title: 'Executive Summary',
      text: "The DNS resilience score of 27/100 highlights significant vulnerabilities in your organisation's ability to maintain service availability and safeguard customer trust during network disruptions or attacks. Critical gaps in redundancy, DDoS protection, and failover mechanisms expose your DNS infrastructure to risks that could lead to prolonged outages, reputational damage, and competitive disadvantage in Southeast Asia's fast-moving digital economy. Immediate remediation is necessary to ensure business continuity and protect user experience.",
    },
    {
      title: 'Risk Assessment',
      text: "The critical finding of self-hosted nameservers with no external DNS redundancy means your DNS infrastructure is entirely reliant on internal systems. In the event of a network outage, DDoS attack, or infrastructure failure, DNS resolution will fail alongside your applications, leaving customers unable to access your services.\n\nUnicast nameservers with fixed IPs lack the ability to absorb or distribute DDoS traffic geographically. A volumetric attack targeting these IPs could overwhelm your DNS infrastructure — a risk particularly acute for high-traffic, revenue-critical applications.\n\nThe absence of geo-steering means all users are directed to a single endpoint regardless of location. If this endpoint becomes unavailable, there is no geographic failover, creating a global single point of failure.\n\nWithout DNSSEC, DNS responses are vulnerable to cache poisoning attacks, allowing attackers to redirect users to malicious sites — compromising customer trust, sensitive data, and regulatory compliance.\n\nThe lack of health-check-aware DNS failover means that if your origin server goes down, users experience service interruptions until DNS records are manually updated, increasing downtime and affecting customer satisfaction.",
    },
    {
      title: 'F5 Recommendation',
      text: "F5 Distributed Cloud provides a robust solution to address these gaps, enabling your organisation to achieve resilient, secure, and high-performing DNS infrastructure. The platform's Global DNS Load Balancing leverages an Anycast PoP network to ensure geographic redundancy and failover, reducing exposure to single points of failure and improving user experience worldwide. AI-powered DDoS mitigation protects against volumetric attacks by absorbing and distributing malicious traffic across the network. DNSSEC signing and validation safeguard against cache poisoning, ensuring the integrity of DNS responses. Additionally, F5 XC's health-check-aware failover capabilities provide visibility into server availability, enabling automated traffic redirection during outages.",
    },
    {
      title: 'Suggested Next Steps',
      text: "1. Schedule an F5 Distributed Cloud proof-of-value engagement to assess your DNS infrastructure and demonstrate platform capabilities.\n2. Enable DNSSEC across your domains to mitigate cache poisoning risks and improve DNS security.\n3. Transition from unicast to an Anycast-based DNS architecture to enhance redundancy and DDoS resilience.",
    },
  ];

  return (
    <>
      {/* Context bar */}
      <div className={styles.dnsContextBar}>
        {[
          { dot: true, label: 'App Domain',  val: 'www.acmebank-demo.example' },
          { label: 'DNS Zone', val: 'acmebank-demo.example' },
          { label: 'Probed',   val: '14 Mar 2026, 09:14 am' },
          { label: 'Source',   val: 'Client device / network' },
        ].map((item, i, arr) => (
          <div key={i} className={styles.dnsContextGroup}>
            <div className={styles.dnsContextItem}>
              {item.dot && <span className={styles.dnsContextDot} />}
              <span className={styles.dnsContextKey}>{item.label}</span>
              <span className={styles.dnsContextVal}>{item.val}</span>
            </div>
            {i < arr.length - 1 && <div className={styles.dnsContextSep} />}
          </div>
        ))}
      </div>

      {/* Score row */}
      <div className={styles.dnsScoreRow}>
        <div className={styles.dnsScoreCard}>
          {/* SVG gauge */}
          <div className={styles.dnsGaugeWrap}>
            <svg width="112" height="112" viewBox="0 0 112 112">
              <circle cx="56" cy="56" r="44" fill="none" stroke="var(--f5-N200)" strokeWidth="8" />
              <circle cx="56" cy="56" r="44" fill="none" stroke="#f94627" strokeWidth="8"
                strokeDasharray="74.64 276.46" strokeDashoffset="69.12" strokeLinecap="round" />
              <text x="56" y="52" textAnchor="middle" fill="#f94627"
                style={{ fontSize: 26, fontWeight: 800, fontFamily: 'inherit' }}>27</text>
              <text x="56" y="67" textAnchor="middle" fill="var(--f5-N400)"
                style={{ fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>/ 100</text>
            </svg>
          </div>
          <div className={styles.dnsScoreCardText}>
            <p className={styles.dnsScoreCardTitle}>Overall Score</p>
            <p className={styles.dnsScoreCardSub}>Based on 6 findings across NS resilience, geo-steering, latency, and security checks.</p>
          </div>
        </div>
        {/* Severity counts */}
        <div className={styles.dnsSevCounts}>
          {[
            { num: 1, label: 'CRITICAL', bg: 'rgb(255,240,240)', border: 'rgb(252,165,165)', color: 'rgb(185,28,28)' },
            { num: 2, label: 'HIGH',     bg: 'rgb(255,247,237)', border: 'rgb(254,215,170)', color: 'rgb(194,65,12)' },
            { num: 2, label: 'MEDIUM',   bg: 'rgb(255,251,235)', border: 'rgb(253,230,138)', color: 'rgb(146,64,14)' },
            { num: 1, label: 'LOW',      bg: 'rgb(240,253,244)', border: 'rgb(187,247,208)', color: 'rgb(22,101,52)'  },
          ].map(s => (
            <div key={s.label} className={styles.dnsSevCount}
              style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>
              <span className={styles.dnsSevNum}>{s.num}</span>
              <span className={styles.dnsSevLabel}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* AI Analysis collapsible */}
      <div className={styles.dnsCollapsibleAi}>
        <button className={styles.dnsCollapsibleTrigger} onClick={() => setAiOpen(p => !p)}>
          <span className={styles.dnsCollapsibleIcon}>
            <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="7.5" cy="7.5" r="6" /><path d="M5 7.5h5M7.5 5v5" />
            </svg>
          </span>
          <span className={styles.dnsCollapsibleLabel}>AI Analysis</span>
          <span className={styles.dnsAiMeta}>gpt-4o <span className={styles.dnsAiMetaTime}>· 14 Mar 2025, 9:14 am</span></span>
          <svg className={styles.dnsChevron} width="14" height="14" viewBox="0 0 14 14" fill="none"
            style={{ transform: aiOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {aiOpen && (
          <div className={styles.dnsCollapsibleBody}>
            {aiSections.map(sec => (
              <div key={sec.title} className={styles.dnsAiSubSection}>
                <div className={styles.dnsAiSubHeader}>
                  <span className={styles.dnsAiSubTitle}>{sec.title}</span>
                </div>
                <p className={styles.dnsAiText}>{sec.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Findings */}
      <div className={styles.dnsSectionHeader}>
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M7.5 1L14 13H1L7.5 1z" /><line x1="7.5" y1="6" x2="7.5" y2="9" />
          <circle cx="7.5" cy="11" r="0.5" fill="currentColor" />
        </svg>
        Findings <span className={styles.dnsSectionCount}>6</span>
      </div>

      <div className={styles.dnsFindingsList}>
        {findings.map((f, i) => (
          <div key={i} className={styles.dnsFindingCard} style={f.style}>
            <div className={styles.dnsFindingHeader}>
              <span className={styles.dnsFindingBadge} style={f.badgeStyle}>{f.severity.toUpperCase()}</span>
              <span className={styles.dnsFindingTitle}>{f.title}</span>
            </div>
            <p className={styles.dnsFindingDetail}>{f.detail}</p>

            {/* Remediation collapsible */}
            <div className={styles.dnsCollapsibleRemedy}>
              <button className={styles.dnsCollapsibleTrigger} onClick={() => toggleRemediation(i)}>
                <span className={styles.dnsCollapsibleIcon}>
                  <svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="var(--f5-blue)" strokeWidth="1.5">
                    <path d="M7.5 1.5v12M1.5 7.5h12" /><circle cx="7.5" cy="7.5" r="6" />
                  </svg>
                </span>
                <span className={styles.dnsCollapsibleLabel}>F5 XC Remediation</span>
                <svg className={styles.dnsChevron} width="14" height="14" viewBox="0 0 14 14" fill="none"
                  style={{ transform: openRemediation[i] ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {openRemediation[i] && (
                <div className={styles.dnsCollapsibleBody}>
                  <p className={styles.dnsRemediationText}>{f.remediation}</p>
                </div>
              )}
            </div>

            {/* Verify yourself collapsible */}
            <div className={styles.dnsCollapsibleVerify}>
              <button className={styles.dnsCollapsibleTrigger} onClick={() => toggleVerify(i)}>
                <span className={styles.dnsCollapsibleIcon}>
                  <svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <rect x="2" y="3" width="11" height="9" rx="1" /><path d="M5 7h5M5 9.5h3" />
                  </svg>
                </span>
                <span className={styles.dnsCollapsibleLabel}>Verify yourself</span>
                <svg className={styles.dnsChevron} width="14" height="14" viewBox="0 0 14 14" fill="none"
                  style={{ transform: openVerify[i] ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {openVerify[i] && (
                <div className={styles.dnsCollapsibleBody}>
                  <p className={styles.dnsVerifyText}>{f.verify}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* F5 XC Promo strip */}
      <div className={styles.dnsPromoStrip}>
        <div className={styles.dnsPromoIcon}>
          <svg width="18" height="18" viewBox="0 0 15 15" fill="none" stroke="var(--f5-blue)" strokeWidth="1.4">
            <circle cx="7.5" cy="7.5" r="6" />
            <ellipse cx="7.5" cy="7.5" rx="2.6" ry="6" />
            <line x1="1.5" y1="7.5" x2="13.5" y2="7.5" />
          </svg>
        </div>
        <div className={styles.dnsPromoText}>
          <strong>F5 Distributed Cloud DNS</strong> addresses all findings above — global anycast network,
          multi-vendor secondary DNS, built-in DNSSEC, health-check failover, and geo-steering across ASEAN PoPs.
        </div>
        <a href="https://www.f5.com/products/distributed-cloud-services/dns"
          target="_blank" rel="noreferrer" className={styles.dnsPromoLink}>Learn more →</a>
      </div>

      <div className={styles.runInfo}>Discovery completed: {DNS_SAMPLE.lastRun}</div>
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
      <div className={styles.runInfo}>Discovery completed: {d.lastRun}</div>
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
      <div className={styles.runInfo}>Discovery completed: {data.lastRun}</div>
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
const TITLES = {
  dns:            'DNS Discovery',
  https:          'HTTPS Discovery',
  'surface-scan': 'Surface Discovery',
  'deep-scan':    'Deep Discovery',
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
