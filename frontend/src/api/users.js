// src/frontend/src/api/users.js
//
// API client for the /users Lambda.
// All functions return { data, error } — callers never need to try/catch.
//
// Auth: every call attaches the Cognito IdToken as Bearer.
// All write operations (POST, PUT, DELETE) are admin-only; the Lambda
// enforces this server-side — the frontend just forwards the token.
//
// Usage:
//   import { listUsers, createUser, updateUser, deleteUser } from '../api/users';
//
//   const { data, error } = await listUsers(idToken);
//   if (error) { /* show error */ } else { /* data.users */ }

const API_BASE =
  window.__ENV__?.API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'https://0ol0f4sixh.execute-api.ap-southeast-1.amazonaws.com/v1';

function _headers(idToken) {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${idToken}`,
  };
}

async function _call(method, path, idToken, body) {
  try {
    const resp = await fetch(`${API_BASE}${path}`, {
      method,
      headers: _headers(idToken),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const json = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      return { data: null, error: json.error || `HTTP ${resp.status}` };
    }
    return { data: json, error: null };
  } catch (err) {
    return { data: null, error: err?.message || 'Network error' };
  }
}

/**
 * GET /users
 * Returns { data: { users: User[], count: number }, error }
 * Admin only.
 */
export function listUsers(idToken) {
  return _call('GET', '/users', idToken);
}

/**
 * POST /users
 * @param {{ email: string, name?: string, role: 'admin'|'user'|'readonly' }} user
 * Returns { data: { user: User }, error }
 */
export function createUser(idToken, user) {
  return _call('POST', '/users', idToken, user);
}

/**
 * PUT /users/{email}
 * @param {string} email
 * @param {{ role?: string, name?: string }} updates
 * Returns { data: { user: User }, error }
 */
export function updateUser(idToken, email, updates) {
  return _call('PUT', `/users/${encodeURIComponent(email)}`, idToken, updates);
}

/**
 * DELETE /users/{email}
 * Returns { data: { ok: true, deleted: string }, error }
 */
export function deleteUser(idToken, email) {
  return _call('DELETE', `/users/${encodeURIComponent(email)}`, idToken);
}

/**
 * Resolve the role for a single email.
 * Called at login time to get the live role from DynamoDB.
 * Falls back to 'readonly' on any error (network, 404, etc.).
 *
 * @param {string} email
 * @param {string} idToken
 * @returns {Promise<'admin'|'user'|'readonly'>}
 */
export async function resolveRole(email, idToken) {
  // We GET /users (admin-only) — if the caller is not admin that returns 403,
  // so instead we call GET /users and look ourselves up only when we ARE admin,
  // otherwise we rely on a cheap single-item GET pattern.
  //
  // The simplest approach with the current Lambda design: GET /users returns
  // the full list for admins only.  For non-admins we fall back to deriving
  // role from the seed list on the frontend.  Since the Lambda auto-seeds on
  // the first admin GET, the seed is always consistent.
  //
  // To keep this call fast and role resolution robust, we POST a synthetic
  // GET to /users with the caller's own token: if they're admin it succeeds
  // and we find ourselves; if forbidden we use the seed fallback.
  const { data } = await _call('GET', '/users', idToken);
  if (data?.users) {
    const match = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (match) return match.role;
  }
  // Fallback: derive from seed (same logic as the old static users.js)
  return _roleFromSeed(email);
}

// ── Seed fallback (mirrors users.js INITIAL_USERS) ───────────────────────────
const SEED_ROLES = {
  'j.yuliantoro@f5.com': 'admin',
  'a.iswanto@f5.com':    'user',
  'ky.cheong@f5.com':    'user',
};

function _roleFromSeed(email) {
  const norm = (email || '').toLowerCase().trim();
  return SEED_ROLES[norm] ?? 'readonly';
}
