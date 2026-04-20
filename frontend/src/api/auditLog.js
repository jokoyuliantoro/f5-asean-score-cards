/**
 * frontend/src/api/auditLog.js
 *
 * Thin client for the persistent audit-log API endpoint.
 *
 * POST /audit  — write one event
 * GET  /audit  — fetch all events the caller is allowed to see
 *
 * The token is read from the same places discovery.js uses it so the two
 * modules stay in sync:
 *   1. VITE_DEMO_TOKEN env var (local dev with get_token.sh)
 *   2. sessionStorage idToken  (runtime after OTP login)
 *   3. The idToken prop passed at call time
 */

const API_BASE =
  (window.__ENV__ && window.__ENV__.API_URL) ||
  import.meta.env.VITE_API_BASE_URL ||
  'https://0ol0f4sixh.execute-api.ap-southeast-1.amazonaws.com/v1';

function _getToken(idToken) {
  const raw =
    import.meta.env.VITE_DEMO_TOKEN ||
    sessionStorage.getItem('idToken') ||
    idToken;
  // demo tokens (prefix "demo.") are excluded — they are not real JWTs
  return raw && !raw.startsWith('demo.') ? raw : null;
}

/**
 * Write one audit event to the backend.
 * Fire-and-forget from the caller's perspective: failures are logged to
 * console but never throw so they never break the UI flow.
 *
 * @param {string} type   — EVENT_TYPES value
 * @param {string} actor  — email
 * @param {string} role   — 'admin' | 'user' | 'readonly'
 * @param {object} meta   — optional payload (domain, score, error …)
 * @param {string} idToken — Cognito IdToken from App state
 */
export async function postAuditEvent(id, type, actor, role, meta = {}, idToken = null) {
  const token = _getToken(idToken);
  if (!token) return;   // demo mode — skip persistence, sessionStorage only

  try {
    await fetch(`${API_BASE}/audit`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ id, type, role, meta }),
      // keepalive so logout events survive page navigation
      keepalive: true,
    });
  } catch (err) {
    // Non-blocking — audit write failure must never disrupt the user
    console.warn('[audit] POST failed:', err.message);
  }
}

/**
 * Fetch all audit events the caller is authorised to see.
 * Admins receive all events; others receive only their own.
 *
 * @param {string} idToken  — Cognito IdToken
 * @returns {Promise<object[]>} array of event objects, newest first
 */
export async function fetchAuditEvents(idToken = null) {
  const token = _getToken(idToken);
  if (!token) return [];   // demo mode — nothing persisted

  const resp = await fetch(`${API_BASE}/audit`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Audit fetch failed (${resp.status}): ${text.slice(0, 200)}`);
  }

  const data = await resp.json();
  return data.events ?? [];
}
