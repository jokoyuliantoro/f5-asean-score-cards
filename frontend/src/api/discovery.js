// frontend/src/api/discovery.js
// Calls /discovery/dns and /discovery/https with Cognito JWT

const API_BASE = import.meta.env.VITE_API_BASE
  ?? 'https://4j10a2iuk7.execute-api.ap-southeast-1.amazonaws.com/v1';

// ── Token resolution ──────────────────────────────────────────────────────────
// Priority (highest first):
//   1. idToken passed by the caller (real Cognito auth, VITE_AUTH_MODE=live)
//   2. VITE_DEMO_TOKEN in .env.local  (dev shortcut — paste real token once)
//   3. window.__DEV_TOKEN__           (browser console fallback)
// In all cases the token is sent as Bearer — API Gateway Cognito authorizer
// validates it regardless of how it got here.
function isFakeToken(token) {
  // Tokens issued by demo mode in auth.js start with 'demo.' — not real JWTs
  if (!token) return true;
  if (token === 'demo' || token === '') return true;
  if (token.startsWith('demo.')) return true;
  return false;
}

function resolveToken(idToken) {
  // If the caller provided a real Cognito JWT, use it directly
  if (!isFakeToken(idToken)) return idToken;
  // Fall back to VITE_DEMO_TOKEN stored in .env.local
  const envToken = import.meta.env.VITE_DEMO_TOKEN;
  if (envToken && !isFakeToken(envToken)) return envToken;
  // Last resort: browser console injection
  if (typeof window !== 'undefined' && window.__DEV_TOKEN__) return window.__DEV_TOKEN__;
  return null; // nothing usable — will get a clear 401 error
}

async function apiPost(path, body, idToken) {
  const token = resolveToken(idToken);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    // Surface a clear message when the token is the likely cause
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        'Auth failed (401/403). ' +
        (import.meta.env.VITE_AUTH_MODE === 'demo'
          ? 'Demo auth token cannot call the real API. Set VITE_DEMO_TOKEN=<your-IdToken> in frontend/.env.local.'
          : 'Check your Cognito session and try logging in again.')
      );
    }
    throw new Error(data.message || `API error ${res.status}`);
  }
  return data;
}

/**
 * Run a DNS discovery probe against a single domain.
 * Returns the full findings object from the Lambda.
 */
export const runDnsDiscovery = (domain, idToken) =>
  apiPost('/discovery/dns', { domain }, idToken);

/**
 * Run an HTTPS discovery probe against a single domain.
 * Returns the full findings object from the Lambda.
 */
export const runHttpsDiscovery = (domain, idToken) =>
  apiPost('/discovery/https', { domain }, idToken);
