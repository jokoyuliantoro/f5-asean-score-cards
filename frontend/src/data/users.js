// ─────────────────────────────────────────────────────────────────────────────
// User registry — single source of truth for roles.
// Roles: 'admin' | 'user' | 'readonly'
// Any @f5.com email NOT in the registry defaults to 'readonly'.
// Non-@f5.com emails are rejected at login.
// ─────────────────────────────────────────────────────────────────────────────

export const ROLE_LABELS = {
  admin:    'Admin',
  user:     'User',
  readonly: 'Read-Only',
};

export const ROLE_COLORS = {
  admin:    { bg: 'var(--f5-pomegranate-light)', text: '#9e2a10' },
  user:     { bg: 'var(--f5-blue-light)',        text: 'var(--f5-blue)' },
  readonly: { bg: 'var(--f5-N200)',              text: 'var(--f5-N500)' },
};

export const INITIAL_USERS = [
  // ── Core team ──────────────────────────────────────────────────────────────
  { email: 'j.yuliantoro@f5.com',  role: 'admin',    name: 'J. Yuliantoro',   country: 'Indonesia',    createdAt: '2026-01-10T08:00:00' },
  { email: 'a.iswanto@f5.com',     role: 'user',     name: 'A. Iswanto',      country: 'Indonesia',    createdAt: '2026-01-15T09:30:00' },
  { email: 'ky.cheong@f5.com',     role: 'user',     name: 'K.Y. Cheong',     country: 'Malaysia',     createdAt: '2026-02-01T10:00:00' },

  // ── Singapore ──────────────────────────────────────────────────────────────
  { email: 'w.tan@f5.com',         role: 'user',     name: 'W. Tan',          country: 'Singapore',    createdAt: '2026-01-20T08:30:00' },
  { email: 'r.lim@f5.com',         role: 'user',     name: 'R. Lim',          country: 'Singapore',    createdAt: '2026-01-22T09:00:00' },
  { email: 's.ng@f5.com',          role: 'readonly', name: 'S. Ng',           country: 'Singapore',    createdAt: '2026-02-03T11:00:00' },

  // ── Malaysia ───────────────────────────────────────────────────────────────
  { email: 'h.razali@f5.com',      role: 'user',     name: 'H. Razali',       country: 'Malaysia',     createdAt: '2026-01-18T10:00:00' },
  { email: 'n.ibrahim@f5.com',     role: 'readonly', name: 'N. Ibrahim',      country: 'Malaysia',     createdAt: '2026-02-10T14:00:00' },
  { email: 'cw.ong@f5.com',        role: 'readonly', name: 'C.W. Ong',        country: 'Malaysia',     createdAt: '2026-02-15T09:30:00' },

  // ── Thailand ───────────────────────────────────────────────────────────────
  { email: 'p.sombat@f5.com',      role: 'user',     name: 'P. Sombat',       country: 'Thailand',     createdAt: '2026-01-25T08:00:00' },
  { email: 'k.wongkham@f5.com',    role: 'readonly', name: 'K. Wongkham',     country: 'Thailand',     createdAt: '2026-02-08T10:30:00' },
  { email: 'n.thitiphan@f5.com',   role: 'readonly', name: 'N. Thitiphan',    country: 'Thailand',     createdAt: '2026-02-20T11:00:00' },

  // ── Philippines ────────────────────────────────────────────────────────────
  { email: 'm.santos@f5.com',      role: 'user',     name: 'M. Santos',       country: 'Philippines',  createdAt: '2026-01-28T09:00:00' },
  { email: 'j.reyes@f5.com',       role: 'readonly', name: 'J. Reyes',        country: 'Philippines',  createdAt: '2026-02-05T13:00:00' },
  { email: 'a.dela-cruz@f5.com',   role: 'readonly', name: 'A. Dela Cruz',    country: 'Philippines',  createdAt: '2026-02-18T10:00:00' },

  // ── Vietnam ────────────────────────────────────────────────────────────────
  { email: 'nt.huong@f5.com',      role: 'user',     name: 'N.T. Huong',      country: 'Vietnam',      createdAt: '2026-02-01T08:00:00' },
  { email: 'vd.minh@f5.com',       role: 'readonly', name: 'V.D. Minh',       country: 'Vietnam',      createdAt: '2026-02-12T09:30:00' },

  // ── Indonesia ──────────────────────────────────────────────────────────────
  { email: 'b.santoso@f5.com',     role: 'user',     name: 'B. Santoso',      country: 'Indonesia',    createdAt: '2026-01-30T10:00:00' },
  { email: 'd.pratama@f5.com',     role: 'readonly', name: 'D. Pratama',      country: 'Indonesia',    createdAt: '2026-02-14T11:30:00' },
  { email: 'r.kusuma@f5.com',      role: 'readonly', name: 'R. Kusuma',       country: 'Indonesia',    createdAt: '2026-02-22T08:00:00' },

  // ── Myanmar / Other ────────────────────────────────────────────────────────
  { email: 'yk.aung@f5.com',       role: 'readonly', name: 'Y.K. Aung',       country: 'Myanmar',      createdAt: '2026-02-25T09:00:00' },
  { email: 'ss.htun@f5.com',       role: 'readonly', name: 'S.S. Htun',       country: 'Myanmar',      createdAt: '2026-03-01T10:00:00' },
  { email: 'c.siriporn@f5.com',    role: 'readonly', name: 'C. Siriporn',     country: 'Thailand',     createdAt: '2026-03-05T08:30:00' },
  { email: 'l.nguyen@f5.com',      role: 'readonly', name: 'L. Nguyen',       country: 'Vietnam',      createdAt: '2026-03-08T11:00:00' },
];

export function getRoleForEmail(email, users) {
  const found = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (found) return found.role;
  if (email.toLowerCase().endsWith('@f5.com')) return 'readonly';
  return null;
}

export const DEMO_OTP = '123456';
