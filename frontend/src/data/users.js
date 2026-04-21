// frontend/src/data/users.js
//
// Seed constants and UI helpers for the user registry.
// Runtime data lives in DynamoDB — see frontend/src/api/users.js.
//
// Exports used by existing components:
//   LoginPage.jsx  — getRoleForEmail, INITIAL_USERS, DEMO_OTP
//   Topbar.jsx     — ROLE_LABELS, ROLE_COLORS
//   UsersPage.jsx  — ROLE_LABELS, ROLE_COLORS, INITIAL_USERS
//   App.jsx        — getRoleFromSeed
//   api/users.js   — seed fallback

/** @typedef {{ email: string, role: 'admin'|'user'|'readonly', name: string }} User */

/** @type {User[]} */
export const INITIAL_USERS = [
  { email: 'j.yuliantoro@f5.com', role: 'admin',    name: 'Joko Yuliantoro' },
  { email: 'a.iswanto@f5.com',    role: 'user',     name: 'A. Iswanto'      },
  { email: 'ky.cheong@f5.com',    role: 'user',     name: 'KY Cheong'       },
];

/** Demo OTP — only works when DEMO_OTP_ENABLED=true on the create-auth Lambda */
export const DEMO_OTP = '123456';

/** Display labels for each role */
export const ROLE_LABELS = {
  admin:    'Admin',
  user:     'User',
  readonly: 'Read-Only',
};

/** Color tokens for each role — used as inline styles { bg, text } */
export const ROLE_COLORS = {
  admin:    { bg: '#ffe4e4', text: '#9e2a10' },
  user:     { bg: '#dbe2ff', text: '#1a3bbf' },
  readonly: { bg: '#e6e9f3', text: '#4a5275' },
};

// ── Internal seed map ─────────────────────────────────────────────────────────
const _SEED_MAP = Object.fromEntries(
  INITIAL_USERS.map(u => [u.email.toLowerCase(), u.role])
);

/**
 * Seed-only role lookup — used by LoginPage and as fallback in App.jsx
 * when the /users API is unreachable or the caller is non-admin.
 *
 * @param {string}  email
 * @param {User[]}  [users]  optional live registry to check first
 * @returns {'admin'|'user'|'readonly'}
 */
export function getRoleForEmail(email, users = []) {
  const norm = (email ?? '').toLowerCase().trim();
  // Check live registry first if provided
  if (users.length) {
    const match = users.find(u => u.email.toLowerCase() === norm);
    if (match) return match.role;
  }
  return _SEED_MAP[norm] ?? 'readonly';
}

/**
 * Alias used by App.jsx / api/users.js when no live registry is available.
 */
export function getRoleFromSeed(email) {
  return getRoleForEmail(email);
}
