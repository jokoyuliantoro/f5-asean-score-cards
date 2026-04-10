export const COUNTRIES = [
  { name: 'Singapore',   code: 'SG', score: 94, waf: 98, ddos: 96, bot: 93, api: 91, status: 'Excellent', trend: '+2.1' },
  { name: 'Malaysia',    code: 'MY', score: 82, waf: 86, ddos: 80, bot: 83, api: 79, status: 'Good',      trend: '+0.8' },
  { name: 'Brunei',      code: 'BN', score: 87, waf: 89, ddos: 85, bot: 88, api: 86, status: 'Good',      trend: '+0.5' },
  { name: 'Thailand',    code: 'TH', score: 78, waf: 82, ddos: 75, bot: 78, api: 77, status: 'Good',      trend: '+1.4' },
  { name: 'Vietnam',     code: 'VN', score: 74, waf: 77, ddos: 72, bot: 73, api: 74, status: 'Good',      trend: '+2.4' },
  { name: 'Indonesia',   code: 'ID', score: 71, waf: 74, ddos: 68, bot: 72, api: 70, status: 'Fair',      trend: '-0.3' },
  { name: 'Philippines', code: 'PH', score: 66, waf: 70, ddos: 63, bot: 65, api: 66, status: 'Fair',      trend: '+1.1' },
  { name: 'Myanmar',     code: 'MM', score: 52, waf: 55, ddos: 48, bot: 53, api: 52, status: 'At Risk',   trend: '-1.2' },
  { name: 'Cambodia',    code: 'KH', score: 48, waf: 51, ddos: 44, bot: 48, api: 49, status: 'At Risk',   trend: '-0.6' },
  { name: 'Laos',        code: 'LA', score: 44, waf: 47, ddos: 42, bot: 43, api: 44, status: 'At Risk',   trend: '-1.8' },
];

export const ALERTS = [
  { severity: 'danger', text: 'Indonesia: DDoS attack mitigated — 3.2 Gbps volumetric flood blocked', time: '2 min ago' },
  { severity: 'warning', text: 'Philippines: API anomaly detected — unusual traffic pattern on /v2/auth', time: '17 min ago' },
  { severity: 'warning', text: 'Myanmar: WAF policy update required — 12 rules outdated', time: '1 hr ago' },
  { severity: 'success', text: 'Singapore: Certificate rotation completed successfully', time: '3 hrs ago' },
  { severity: 'success', text: 'Vietnam: Bot mitigation rate improved to 97.4%', time: '5 hrs ago' },
];

export function scoreColor(s) {
  if (s >= 85) return '#35d068';
  if (s >= 70) return '#4f73ff';
  if (s >= 55) return '#ffc400';
  return '#f94627';
}
