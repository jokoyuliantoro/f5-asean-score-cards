// ─────────────────────────────────────────────────────────────────────────────
// frontend/src/data/auditLog.js
//
// Audit-log store with persistent backend write-through.
//
// Write path:
//   logEvent(type, actor, role, meta, idToken)
//     → push to in-memory array + sessionStorage (instant UI)
//     → fire-and-forget POST /audit with the real JWT
//
// Read path (AuditLogPage):
//   loadRemoteEvents(idToken) → GET /audit → merge into in-memory cache
//   Historical events from previous sessions are visible after re-login.
//
// Demo mode (token starts with "demo." or is null):
//   postAuditEvent / fetchAuditEvents are no-ops in api/auditLog.js.
//   The in-memory + sessionStorage path still works for local dev.
// ─────────────────────────────────────────────────────────────────────────────

import { postAuditEvent, fetchAuditEvents } from '../api/auditLog';

const STORAGE_KEY = 'f5_audit_log';

// ── Canonical event types ─────────────────────────────────────────────────────
export const EVENT_TYPES = {
  LOGIN:           'login',
  LOGOUT:          'logout',
  DNS_PROBE_START: 'dns_probe_start',
  DNS_PROBE_DONE:  'dns_probe_done',
  DNS_PROBE_ERROR: 'dns_probe_error',
};

// ── Event display config ──────────────────────────────────────────────────────
export const EVENT_CONFIG = {
  [EVENT_TYPES.LOGIN]: {
    label: 'Login',              color: 'green',   icon: '→',
  },
  [EVENT_TYPES.LOGOUT]: {
    label: 'Logout',             color: 'neutral', icon: '←',
  },
  [EVENT_TYPES.DNS_PROBE_START]: {
    label: 'DNS Probe Started',  color: 'blue',    icon: '⟳',
  },
  [EVENT_TYPES.DNS_PROBE_DONE]: {
    label: 'DNS Probe Complete', color: 'blue',    icon: '✓',
  },
  [EVENT_TYPES.DNS_PROBE_ERROR]: {
    label: 'DNS Probe Failed',   color: 'red',     icon: '✕',
  },
};

// ── In-memory cache ───────────────────────────────────────────────────────────
let _events = [];

// Hydrate from sessionStorage on module load (survives page refresh)
try {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (raw) _events = JSON.parse(raw);
} catch (_) {
  _events = [];
}

function _persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(_events));
  } catch (_) { /* quota exceeded */ }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Append a new audit event and write-through to DynamoDB.
 *
 * @param {string} type     — EVENT_TYPES value
 * @param {string} actor    — email
 * @param {string} role     — 'admin' | 'user' | 'readonly'
 * @param {object} meta     — optional payload (domain, score, error…)
 * @param {string} idToken  — Cognito IdToken from App state (null in demo mode)
 */
export function logEvent(type, actor, role, meta = {}, idToken = null) {
  const event = {
    id:    crypto.randomUUID(),
    type,
    actor: actor ?? 'unknown',
    role:  role  ?? 'unknown',
    meta,
    ts:    new Date().toISOString(),
  };
  _events = [event, ..._events];
  _persist();

  // Write-through to backend — fire-and-forget, never throws
  postAuditEvent(event.id, type, actor, role, meta, idToken);

  return event;
}

/**
 * Return a copy of all in-memory events (newest first).
 */
export function getEvents() {
  return [..._events];
}

/**
 * Fetch events from DynamoDB and merge into the local cache.
 * Called by AuditLogPage on mount.
 *
 * @param {string} idToken — Cognito IdToken from App state
 * @returns {Promise<object[]>} merged event list, newest first
 */
export async function loadRemoteEvents(idToken = null) {
  try {
    const remote = await fetchAuditEvents(idToken);
    if (!remote.length) return getEvents();

    // Merge: deduplicate by id, keep newest-first order
    const existingIds = new Set(_events.map(e => e.id));
    const newRemote   = remote.filter(e => !existingIds.has(e.id));
    if (newRemote.length > 0) {
      _events = [..._events, ...newRemote]
        .sort((a, b) => b.ts.localeCompare(a.ts));
      _persist();
    }
    return getEvents();
  } catch (err) {
    console.warn('[auditLog] loadRemoteEvents failed:', err.message);
    return getEvents();   // fall back to in-memory
  }
}

/**
 * Clear in-memory + sessionStorage (called on logout).
 * Does NOT delete from DynamoDB — that data is permanent.
 */
export function clearEvents() {
  _events = [];
  try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
}
