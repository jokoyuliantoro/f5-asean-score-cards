// frontend/src/api/discovery.js
// Calls /discovery/dns and /discovery/https with Cognito JWT

const API_BASE = 'https://4j10a2iuk7.execute-api.ap-southeast-1.amazonaws.com/v1';

async function apiPost(path, body, idToken) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `API error ${res.status}`);
  return data;
}

/**
 * Run a DNS discovery probe against a single domain.
 * Returns the full findings object from the Lambda.
 * Shape: { jobId, domain, pillar, status, findings: { score, issues, A, ns, ttl, ... }, completedAt }
 */
export const runDnsDiscovery = (domain, idToken) =>
  apiPost('/discovery/dns', { domain }, idToken);

/**
 * Run an HTTPS discovery probe against a single domain.
 * Returns the full findings object from the Lambda.
 * Shape: { jobId, domain, pillar, status, findings: { score, issues, tls, ... }, completedAt }
 */
export const runHttpsDiscovery = (domain, idToken) =>
  apiPost('/discovery/https', { domain }, idToken);
