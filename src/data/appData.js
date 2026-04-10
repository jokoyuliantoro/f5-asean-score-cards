// ─────────────────────────────────────────────────────────────────────────────
// Central application data store
// In a real app this would come from an API. Here it is module-level state
// exported as plain JS so any component can import it.
// ─────────────────────────────────────────────────────────────────────────────

// ── Accounts ─────────────────────────────────────────────────────────────────
export const ACCOUNTS = [
  {
    id: 'acc-001',
    name: 'Acme Bank',
    industry: 'Financial Services',
    country: 'Singapore',
    presales: 'sarah.tan@f5.com',
    domains: ['acmebank.example', 'api.acmebank.example', 'portal.acmebank.example'],
    archived: false,
    createdAt: '2026-02-10T08:00:00',
  },
  {
    id: 'acc-002',
    name: 'SkyRetail Group',
    industry: 'E-Commerce',
    country: 'Malaysia',
    presales: 'sarah.tan@f5.com',
    domains: ['skyretail.example', 'checkout.skyretail.example'],
    archived: false,
    createdAt: '2026-02-20T10:30:00',
  },
  {
    id: 'acc-003',
    name: 'NovaTelco',
    industry: 'Telecommunications',
    country: 'Thailand',
    presales: 'james.lim@f5.com',
    domains: ['novatelco.example', 'api.novatelco.example', 'oss.novatelco.example'],
    archived: false,
    createdAt: '2026-02-25T14:00:00',
  },
  {
    id: 'acc-004',
    name: 'PacificHealth',
    industry: 'Healthcare',
    country: 'Philippines',
    presales: 'sarah.tan@f5.com',
    domains: ['pacifichealth.example'],
    archived: true,
    createdAt: '2026-01-15T09:00:00',
  },
];

// ── Scan Groups ───────────────────────────────────────────────────────────────
// Dates are set relative to 2026-03-15 (today) to keep age values fresh (1–13 days).
export const SCAN_GROUPS = [
  {
    id: 'sg-001',
    name: 'Q1 2026 Baseline',
    accountId: 'acc-001',
    domains: ['acmebank.example', 'api.acmebank.example', 'portal.acmebank.example'],
    createdAt: '2026-03-13T09:00:00',   // 2 days ago
    pillars: {
      dns:         { status: 'Completed',      score: 76,   detail: null },
      https:       { status: 'In Progress',    score: null, detail: 'Probing TTFB (3 of 10 sites)' },
      surfaceScan: { status: 'Completed',      score: 71,   detail: null },
      deepScan:    { status: 'Not Configured', score: null, detail: null },
    },
  },
  {
    id: 'sg-002',
    name: 'March Pre-Sales Demo',
    accountId: 'acc-001',
    domains: ['acmebank.example'],
    createdAt: '2026-03-08T14:30:00',   // 7 days ago
    pillars: {
      dns:         { status: 'Completed', score: 74, detail: null },
      https:       { status: 'Completed', score: 80, detail: null },
      surfaceScan: { status: 'Completed', score: 68, detail: null },
      deepScan:    { status: 'Completed', score: 55, detail: null },
    },
  },
  {
    id: 'sg-003',
    name: 'Initial Probe',
    accountId: 'acc-002',
    domains: ['skyretail.example', 'checkout.skyretail.example'],
    createdAt: '2026-03-14T11:00:00',   // 1 day ago
    pillars: {
      dns:         { status: 'Completed',        score: 88,   detail: null },
      https:       { status: 'Completed',        score: 91,   detail: null },
      surfaceScan: { status: 'In Progress',      score: null, detail: 'Probing Headers' },
      deepScan:    { status: 'Queued',           score: null, detail: null },
    },
  },
  {
    id: 'sg-004',
    name: 'Feb Baseline',
    accountId: 'acc-002',
    domains: ['skyretail.example'],
    createdAt: '2026-03-02T09:00:00',   // 13 days ago
    pillars: {
      dns:         { status: 'Completed', score: 85,   detail: null },
      https:       { status: 'Completed', score: 87,   detail: null },
      surfaceScan: { status: 'Completed', score: 79,   detail: null },
      deepScan:    { status: 'Failed',    score: null, detail: 'Proxy unreachable' },
    },
  },
  {
    id: 'sg-005',
    name: 'Pilot Assessment',
    accountId: 'acc-003',
    domains: ['novatelco.example'],
    createdAt: '2026-03-10T10:00:00',   // 5 days ago
    pillars: {
      dns:         { status: 'Completed',      score: 62,   detail: null },
      https:       { status: 'Completed',      score: 58,   detail: null },
      surfaceScan: { status: 'Completed',      score: 53,   detail: null },
      deepScan:    { status: 'Not Configured', score: null, detail: null },
    },
  },
  {
    id: 'sg-006',
    name: 'API Gateway Focus',
    accountId: 'acc-003',
    domains: ['api.novatelco.example'],
    createdAt: '2026-03-12T08:30:00',   // 3 days ago
    pillars: {
      dns:         { status: 'Completed',   score: 70,   detail: null },
      https:       { status: 'In Progress', score: null, detail: 'Probing TLS (2 of 3 domains)' },
      surfaceScan: { status: 'Queued',      score: null, detail: null },
      deepScan:    { status: 'Queued',      score: null, detail: null },
    },
  },
];

// ── Top Issues (cross-pillar, per scan group) ─────────────────────────────────
export const TOP_ISSUES_DATA = [
  {
    id: 'iss-001',
    scanGroupId: 'sg-001',
    pillar: 'Deep Probe',
    severity: 'critical',
    title: 'BOLA vulnerability on authenticated API allows cross-account data access',
    domain: 'api.acmebank.example',
    createdAt: '2026-03-13T11:42:00',
  },
  {
    id: 'iss-002',
    scanGroupId: 'sg-001',
    pillar: 'Deep Probe',
    severity: 'critical',
    title: 'Session fixation risk — token not rotated post-login',
    domain: 'portal.acmebank.example',
    createdAt: '2026-03-13T11:43:00',
  },
  {
    id: 'iss-003',
    scanGroupId: 'sg-001',
    pillar: 'Surface Probe',
    severity: 'high',
    title: 'Verbose stack traces exposed on public API endpoints',
    domain: 'api.acmebank.example',
    createdAt: '2026-03-13T10:15:00',
  },
  {
    id: 'iss-004',
    scanGroupId: 'sg-001',
    pillar: 'HTTPS Probe',
    severity: 'high',
    title: 'TLS 1.1 still accepted on legacy subdomain',
    domain: 'acmebank.example',
    createdAt: '2026-03-13T09:58:00',
  },
  {
    id: 'iss-005',
    scanGroupId: 'sg-001',
    pillar: 'DNS Probe',
    severity: 'medium',
    title: 'No geographic redundancy — single NS cluster for all of ASEAN',
    domain: 'acmebank.example',
    createdAt: '2026-03-13T09:22:00',
  },
  {
    id: 'iss-006',
    scanGroupId: 'sg-003',
    pillar: 'Surface Probe',
    severity: 'high',
    title: 'Missing Content-Security-Policy on checkout flow',
    domain: 'checkout.skyretail.example',
    createdAt: '2026-03-14T13:10:00',
  },
  {
    id: 'iss-007',
    scanGroupId: 'sg-005',
    pillar: 'Surface Probe',
    severity: 'critical',
    title: 'Admin panel exposed on public internet without authentication',
    domain: 'novatelco.example',
    createdAt: '2026-03-10T11:30:00',
  },
  {
    id: 'iss-008',
    scanGroupId: 'sg-005',
    pillar: 'HTTPS Probe',
    severity: 'high',
    title: 'Certificate expires in 8 days — no auto-renewal configured',
    domain: 'novatelco.example',
    createdAt: '2026-03-10T10:45:00',
  },
];

// ── Helper: days ago string ───────────────────────────────────────────────────
export function daysAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export function fmtTimestamp(isoString) {
  return new Date(isoString).toLocaleString('en-SG', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Score colour ──────────────────────────────────────────────────────────────
export function scoreColor(s) {
  if (!s && s !== 0) return '#9ea7b8';
  if (s >= 85) return '#35d068';
  if (s >= 70) return '#4f73ff';
  if (s >= 55) return '#ffc400';
  return '#f94627';
}
