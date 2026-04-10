# Application Resilience Score Card — Project Context

> **Read this first in any new chat.**
> This file captures all design decisions, architecture, and implementation state
> so development can continue without losing context from prior sessions.

---

## What this is

A React + Vite front-end mockup for **F5 ASEAN presales**. The tool lets a presales
engineer assess a customer's application resilience across four pillars (DNS, HTTPS,
Surface Scan, Deep Scan), manage multiple customer accounts privately, and present
sample reports to win approval for scanning engagements.

This is a **prototype / mockup** — all data is in-memory JS. No backend, no API calls,
no authentication server. The OTP login is simulated with a timeout.

---

## Stack

| Concern | Choice |
|---|---|
| Framework | React 19 + Vite 8 |
| Styling | CSS Modules (one `.module.css` per component) |
| Charts | Chart.js 4 via `react-chartjs-2` |
| State | `useState` only — no Redux, no Context API yet |
| Data | Plain JS modules in `src/data/` |
| Auth | OTP-only (no password step) — simulated |

**To run locally:**
```bash
unzip asean-scorecard.zip
cd asean-scorecard
npm install
npm run dev
```

---

## Design system

All colours are CSS custom properties defined in `src/index.css`.
**Never hardcode hex values in components** — always use the variables.

### Key tokens
```css
--f5-red:               #e4002b   /* F5 brand red */
--f5-blue:              #4f73ff   /* primary action */
--f5-blue-hover:        #2e50d9
--f5-blue-light:        #dbe2ff   /* tinted background */
--f5-green:             #35d068
--f5-green-light:       #d0f5dc
--f5-amber:             #ffc400
--f5-amber-light:       #fff3cc
--f5-purple:            #8777d9
--f5-purple-light:      #ebe8ff
--f5-pomegranate:       #f94627   /* danger/error */
--f5-pomegranate-light: #ffdad4
--f5-N0 … --f5-N700     /* neutral grays, N0=white, N600=navy */
```

### Score colour function (replicated in `src/data/appData.js`)
```
≥ 85  →  green  (#35d068)
≥ 70  →  blue   (#4f73ff)
≥ 55  →  amber  (#ffc400)
< 55  →  red    (#f94627)
```

### Typography
- Font: Inter (Google Fonts, loaded in `index.css`)
- Body: 14px / 400
- Labels: 11–12px / 600 / uppercase / letter-spacing 0.4–0.7px
- Headings: 18px / 700

### Radius tokens
```css
--radius-sm: 4px
--radius-md: 6px
--radius-lg: 8px
```

---

## Navigation / routing

Routing is **manual switch** in `App.jsx` — no React Router. `navItem` string is
passed to `Sidebar` as `active` prop and controls which page renders.

### Sidebar structure
```
OVERVIEW
  dashboard          → Dashboard.jsx

DELIVERY
  dns                → placeholder (page not built)
  https              → placeholder (page not built)

SECURITY
  surface-scan       → placeholder (page not built)
  deep-scan          → placeholder (page not built)

MANAGE
  accounts           → AccountsPage.jsx
  scan-history       → ScanHistoryPage.jsx
```

---

## Pages built

### Login (`LoginPage.jsx`)
- Step 1: email input → validate → simulate OTP send
- Step 2: 6-box OTP input — **auto-advances to dashboard on last digit**, no button
- No password step — OTP is the sole auth factor
- F5 logo, privacy footer, CSS Modules

### Dashboard (`Dashboard.jsx`)
Three sub-sections, all filtered by `CompanyFilter` dropdown:

**1. Top Issues strip** (`TopIssuesStrip.jsx`)
- Shows top 3 issues by severity for the selected account
- Each card shows: severity badge, pillar tag, issue title, full provenance:
  `[Pillar] from [Scan Group Name] · [Account] · [domain] · X days ago (timestamp)`
- Severity colour-coded cards: critical=red tint, high=amber, medium=blue, low=gray

**2. Report List** (`ReportList.jsx`)
- Paginated, 5 per page, newest first
- Each row: scan group name + account + domains + timestamp (left) | 4 pillar status pills (right)
- Pillar statuses: `Completed` (green) · `In Progress` with detail (blue) · `Queued` (amber) · `Not Configured` (gray) · `Failed` (red)
- `+ New Scan` button in header (not wired to a form yet)
- Pagination resets when account filter changes (uses React `key` prop trick)

**3. Sample Reports** (`SampleReport.jsx`)
- 4 `PillarCard` components (DNS, HTTPS, Surface Scan, Deep Scan)
- Clicking a card selects it and reveals its sample report below
- Clicking again collapses it
- Each pillar has realistic fictitious findings for "Acme Bank (Sample)"
- DNS/HTTPS: 3-column dimension grid with findings + recommendation per dimension
- Surface/Deep Scan: severity-ranked finding table with remediation notes
- All data in `src/data/sampleReports.js`

### Accounts (`AccountsPage.jsx`)
- Two tabs: **Active** | **Archived** (with counts)
- Each row is expandable (click to reveal domains + action buttons)
- Actions: Edit (stub) · Archive / Restore · Delete
- Archive = hides account from `CompanyFilter` dropdown and all report views
- Add Account form: name, industry, country, first domain
- State is local (`useState(ACCOUNTS)`) — resets on page reload

### Scan History (`ScanHistoryPage.jsx`)
- Full table: scan group name, account, domains, created timestamp, pillar status pills
- Account filter dropdown
- Checkbox multi-select with bulk delete
- Per-row actions: **↺ Re-run** (clones scan group with Queued status) · **Delete** (two-step confirm)
- Pagination (8 per page)

---

## Data layer

### `src/data/appData.js` — master data
```
ACCOUNTS[]         id, name, industry, country, presales, domains[], archived, createdAt
SCAN_GROUPS[]      id, name, accountId, domains[], createdAt, pillars{}
TOP_ISSUES_DATA[]  id, scanGroupId, pillar, severity, title, domain, createdAt
```

**Pillar keys** (in `SCAN_GROUPS.pillars`):
```
dns | https | surfaceScan | deepScan
```
Each pillar: `{ status, score, detail }`

**Severity values:** `critical | high | medium | low`

**Pillar status values:**
`Completed | In Progress | Queued | Not Configured | Failed`
(plus inline detail strings like `"Scanning TTFB (3 of 10 sites)"`)

### `src/data/sampleReports.js` — sample report content
Fictitious data for "Acme Bank (Sample)" / `acmebank-demo.example`.
Used only by `SampleReport.jsx` on the dashboard.
```
DNS_SAMPLE      overallScore, status, summary, dimensions[{label,score,findings[],recommendation}]
HTTPS_SAMPLE    same shape as DNS_SAMPLE
SURFACE_SAMPLE  overallScore, status, summary, findings[{severity,title,affected,detail,remediation}]
DEEP_SAMPLE     same shape as SURFACE_SAMPLE
SCAN_ACTIVITY[] type, domain, time, status, score
TOP_ISSUES[]    severity, pillar, text
```

### `src/data/countries.js` — legacy ASEAN country data
Used by `ScoreTable`, `RadarChart`, `AlertsPanel` (these components exist but are
**not currently used** in any active page — left in place for future use).

---

## Components (complete list)

```
src/components/
├── F5Logo.jsx/.css            SVG logo — red circle + white F5 mark, size prop
├── LoginPage.jsx/.css         Email + OTP login shell
├── OtpInput.jsx/.css          6-box OTP input, onComplete callback
├── ResendTimer.jsx/.css       30s countdown + resend button
├── PrivacyFooter.jsx/.css     F5 legal links footer
├── Sidebar.jsx/.css           Left nav, 4 sections, Manage group added
├── Topbar.jsx/.css            Title + Live badge + email + Log out button
│
├── Dashboard.jsx/.css         3-section dashboard page
├── CompanyFilter.jsx/.css     "Dashboard for [X]" styled select dropdown
├── TopIssuesStrip.jsx/.css    Top 3 issues, 3-col grid, severity cards
├── ReportList.jsx/.css        Paginated scan group list
├── PillarCard.jsx/.css        Clickable pillar card (score, bar, CTA)
├── SampleReport.jsx/.css      Contextual sample report (DNS/HTTPS/Surface/Deep)
│
├── AccountsPage.jsx/.css      Active/Archived tabs, expandable rows
├── ScanHistoryPage.jsx/.css   Table, multi-select, re-run, delete confirm
│
│   ── Not currently used in any active page ──
├── AlertsPanel.jsx/.css
├── MetricCard.jsx/.css
├── RadarChart.jsx/.css
├── ScanActivity.jsx/.css
├── ScoreTable.jsx/.css
└── TopIssues.jsx/.css
```

---

## Pages not yet built (placeholders)

These nav items show "coming soon" in `App.jsx`:

| Nav ID | Description |
|---|---|
| `dns` | DNS report page — Resilience, Stability, Response Time per domain |
| `https` | HTTPS report page — IP Anycast, TLS, TTFB per domain |
| `surface-scan` | Surface Scan results page |
| `deep-scan` | Deep Scan results page |

The sample report data in `sampleReports.js` and the dimension/finding structure
in `appData.js` are already designed to feed these pages.

---

## Key design decisions (carry forward)

**Privacy-first** — no cross-account visibility anywhere. The heat map was explicitly
removed to avoid customers feeling their data is shared. `CompanyFilter` only shows
non-archived accounts.

**Archive vs delete** — Archive hides account + all its scans from all views without
destroying data. Delete is permanent. The Archive tab in AccountsPage is kept
separate from the Active tab so presales never accidentally restores/exposes an
account in front of a customer.

**OTP-only auth** — no password step. Deliberately simplified for the prototype.
The `onAuthenticated(email)` callback in `LoginPage` propagates email up to `App.jsx`
for display in `Topbar`.

**Scan Group as the unit** — a "Scan Group" is one commissioned assessment
(e.g. "Q1 2025 Baseline") containing multiple domains scanned across all configured
pillars. It is the primary entity in `ReportList` and `ScanHistoryPage`.

**Sample reports are the sales tool** — the bottom section of Dashboard shows
fictitious but realistic findings to help customers understand what a scan delivers
before approving it. Each pillar card selects a contextual report. This is the
leave-behind for the first meeting.

**CSS Modules scoping** — every component has its own `.module.css`. Class name
collisions are impossible. When adding new styles, always add to the component's own
module file, never to `index.css` (which is reserved for global tokens only).

**No React Router** — navigation is a plain `navItem` string in `App.jsx` state,
switched in `renderPage()`. To add a new page: (1) create the component, (2) add
its `id` to `NAV` in `Sidebar.jsx`, (3) add a `case` in `App.jsx`.

---

## What to build next (suggested order)

1. **DNS page** — per-domain scorecard with Resilience / Stability / Response Time
   tabs, using real `SCAN_GROUPS` data filtered by selected scan group
2. **HTTPS page** — same structure, IP Anycast / TLS / TTFB tabs
3. **Surface Scan page** — finding list with severity filter, domain filter,
   expandable finding rows with remediation
4. **Deep Scan page** — same as Surface Scan but with "Auth required" banner
   and proxy configuration status
5. **New Scan flow** — wire up the `+ New Scan` button in ReportList to a
   multi-step form: select account → select domains → configure pillars → launch
6. **Real state management** — once pages get complex, introduce React Context or
   Zustand to share `accounts` and `scanGroups` state across pages without prop drilling

---

## Conventions to follow

- **File naming:** `PascalCase.jsx` + `PascalCase.module.css` — always paired
- **Component exports:** always `export default function ComponentName()`
- **Data imports:** always from `src/data/appData.js` or `src/data/sampleReports.js`
- **No hardcoded colours:** use CSS variables from `index.css`
- **No inline styles for layout:** use CSS Modules; inline styles only for dynamic
  values (e.g. `style={{ color: scoreColor(s) }}` or `style={{ width: pct + '%' }}`)
- **Score colours:** always via `scoreColor()` from `appData.js`
- **Timestamps:** always via `fmtTimestamp()` and `daysAgo()` from `appData.js`

---

## v8 changes (applied)

### 1. Sample Reports moved to its own sidebar item
- Removed the Sample Reports section from `Dashboard.jsx` entirely.
- Created `SampleReportsPage.jsx` + `SampleReportsPage.module.css` as a standalone page.
- Added `{ id: 'sample-reports', label: 'Sample Reports', icon: 'sparkle' }` under the **Overview** section in `Sidebar.jsx`.
- `App.jsx` routes `case 'sample-reports'` → `<SampleReportsPage />`.
- Dashboard is now leaner: just CompanyFilter + TopIssuesStrip + ReportList.

### 2–4. Dynamic Topbar title by section
- `Topbar.jsx` now accepts a `title` prop (default: `'Application Resilience Score Cards'`).
- `App.jsx` has `getTitle(navItem)` which returns:
  - `'Application Delivery Resilience Score Cards'` for `dns | dns-scans | https | https-scans`
  - `'Application Security Resilience Score Cards'` for `surface-scan | deep-scan`
  - `'Application Resilience Score Cards'` for everything else (Overview, Manage)
- Title is passed as `<Topbar title={getTitle(navItem)} ... />`.

### 5. Label consistency: DNS Scan / HTTPS Scan
- Sidebar items renamed: `DNS` → `DNS Scan`, `HTTPS` → `HTTPS Scan` (as group parent labels).
- `SampleReport.jsx` TITLES map updated: `'DNS Resilience'` → `'DNS Scan'`, `'HTTPS Delivery'` → `'HTTPS Scan'`.
- `SampleReportsPage.jsx` pillar card labels use `'DNS Scan'` and `'HTTPS Scan'`.

### 6. DNS Scan lifecycle — architecture decision (NOT yet built, next session)
- **Decision:** Separate menu item using the existing collapsible sub-item pattern.
- DNS and HTTPS sidebar entries are now **group parents** with children:
  ```
  DNS Scan (group parent — clicking opens group + navigates to Report)
    ├── Report   → id: 'dns'        (DnsPage.jsx — existing)
    └── Scans    → id: 'dns-scans'  (placeholder, to be built)
  HTTPS Scan (same pattern)
    ├── Report   → id: 'https'
    └── Scans    → id: 'https-scans'
  ```
- Group parent click: toggles expand/collapse AND navigates to first child (Report).
- Sub-item click: navigates directly to that child.
- `isActive` on parent highlights when any child is active.
- `initialOpen` auto-expands the group if a child is the active route on mount.

### Role-based access scaffold (in App.jsx)
- `handleAuthenticated(email, role)` now accepts a `role` param (`'full'` | `'readonly'`).
- `role='readonly'` users are redirected to `sample-reports` on login and `handleNav` blocks all other routes for them.
- `LoginPage.jsx` still calls `onAuthenticated(email)` (role defaults to `'full'`).
- **To activate read-only access for non-registered @f5.com:** In `LoginPage`, check if the email ends with `@f5.com` but is not in a registered list, then call `onAuthenticated(email, 'readonly')` instead of going through OTP — the App scaffolding is already wired to handle it.

### What to build next (updated order)
1. **DNS Scans page** (`id: 'dns-scans'`) — scan lifecycle: create, modify, launch, abort, delete
2. **HTTPS Scan Report page** (`id: 'https'`) — same structure as DnsPage
3. **HTTPS Scans page** (`id: 'https-scans'`)
4. **Surface Scan page** (`id: 'surface-scan'`)
5. **Deep Scan page** (`id: 'deep-scan'`)
6. **Read-only login path** — detect non-registered @f5.com in LoginPage, skip OTP, call `onAuthenticated(email, 'readonly')`
7. **New Scan flow** — wire `+ New Scan` in ReportList to a multi-step form

---

## v9 changes (applied)

### 1. Recent Reports: 3 per page + clickable row → report overview
- `PAGE_SIZE` reduced 5 → 3 in `ReportList.jsx`. Pagination preserved.
- Each row is now a `<button>` with a left-side triangle indicator. Clicking expands an inline `ReportOverview` panel below that row.
- `ReportOverview` shows 4 live pillar cards (using actual `SCAN_GROUPS` data, not sample data). Each pillar card shows score + score bar (if Completed) or status pill (otherwise). Clicking a completed pillar card expands a detail block that directs the user to the matching sidebar page.
- `PILLAR_LABELS` updated throughout ReportList to use "DNS Scan", "HTTPS Scan" (label consistency).

### 2. Collapsible sections: Top Issues + Recent Reports
- Both sections now have a triangle toggle button in the header (pointing right when collapsed, pointing down when open).
- Click the header to collapse/expand. Collapsing also resets any active expanded card/row.
- Triangle uses pure CSS border trick — no SVG, no icon library.

### 3. Top Issue cards: clickable → inline detail panel
- `TopIssuesStrip` cards are now `<button>` elements. Clicking one toggles an `IssueDetail` panel below the 3-card strip, which pushes the ReportList section down.
- `IssueDetail` shows: severity badge, pillar, title, 4-column metadata grid (Domain, Account, Scan Group, Detected), and severity-matched recommended action text.
- Clicking the same card again or the ✕ button closes the detail.

### 4. DNS/HTTPS sub-item renamed: Scans → Lifecycle
- `NAV` in `Sidebar.jsx` updated: `{ id: 'dns-scans', label: 'Scans' }` → `{ id: 'dns-lifecycle', label: 'Lifecycle' }` (same for HTTPS).
- `App.jsx` DELIVERY_IDS set updated to `dns-lifecycle`, `https-lifecycle`.

### 5. Surface Scan and Deep Scan: same group+children structure
- Both now use group parent pattern (like DNS Scan / HTTPS Scan) with children:
  - `surface-scan` (Report) + `surface-lifecycle` (Lifecycle)
  - `deep-scan` (Report) + `deep-lifecycle` (Lifecycle)
- `App.jsx` SECURITY_IDS updated to include `surface-lifecycle`, `deep-lifecycle`.

### 6. Archived account filtering in CompanyFilter
- Already correctly implemented since v1: `ACCOUNTS.filter(a => !a.archived)`.
- PacificHealth (acc-004, archived: true) was already excluded from the dropdown. No change needed.

### 7. Date refresh in appData.js
- All `createdAt` timestamps updated to be relative to 2026-03-15 (today).
- Scan groups: 1–13 days ago (sg-003=1d, sg-001=2d, sg-006=3d, sg-005=5d, sg-002=7d, sg-004=13d).
- Issues: match their parent scan group dates.
- Accounts: set to Feb–Mar 2026 (creation dates, less critical for display).

### What to build next (updated order)
1. **DNS Lifecycle page** (`id: 'dns-lifecycle'`) — scan lifecycle: create, modify, launch, abort, delete
2. **HTTPS Scan Report page** (`id: 'https'`) — same structure as DnsPage
3. **HTTPS Lifecycle page** (`id: 'https-lifecycle'`)
4. **Surface Scan Report page** (`id: 'surface-scan'`)
5. **Surface Lifecycle page** (`id: 'surface-lifecycle'`)
6. **Deep Scan Report + Lifecycle pages**
7. **Read-only login path** — detect non-registered @f5.com in LoginPage, call `onAuthenticated(email, 'readonly')`
8. **New Scan flow** — wire `+ New Scan` button in ReportList to multi-step form

---

## v10 changes (applied)

### Report overview moves below the entire Recent Reports section
The single structural change from v9: `ReportOverview` is no longer rendered
*inside* each list row. It now renders *outside and below* the list+pagination
block as a single section-level element.

**Layout flow (matches attached screenshot):**
```
▼ Recent Reports   1–3 of 6          [+ New Scan]
  ┌────────────────────────────────────────────┐
  │ ▶ Initial Scan      DNS 88  HTTPS 91  …   │  ← highlighted (active)
  │ ▶ Q1 2026 Baseline  DNS 76  HTTPS …   …   │
  │ ▶ API Gateway Focus DNS 70  HTTPS …   …   │
  └────────────────────────────────────────────┘
                              ← Prev  Page 1 of 2  Next →

  Initial Scan                        (overview header)
  SkyRetail Group · skyretail… · 14 Mar 2026
  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
  │DNS Scan │ │HTTPS …  │ │Surface… │ │Deep Scan│
  │  88     │ │  91     │ │Scanning │ │ Queued  │
  └─────────┘ └─────────┘ └─────────┘ └─────────┘
  [active pillar detail block if a card is clicked]
```

**Key implementation details:**
- `activeRowId` and `activeSg` state stays in the parent `ReportList` component.
- The `activeSg` is looked up from `filtered` (all pages), not just `paged`,
  so clicking a row on page 2, switching to page 1, still shows the report.
- Page change resets `activeRowId` to prevent stale report display.
- `PillarOverviewCard` is a new local component that visually mirrors
  `PillarCard.jsx` (same score, badge, bar, CTA pattern) but is driven by
  live `SCAN_GROUPS` pillar data instead of sample report data.
- Cards with no score (`Not Configured`, `Queued`, `Failed`, `In Progress`)
  are rendered as disabled buttons showing only their status pill.
- `key={activeSg.id}` on `<ReportOverview>` resets its internal `activePillar`
  state whenever a different row is selected.

---

## v11 changes (applied)

### New file: `src/data/users.js`
Single source of truth for the user registry. Exports:
- `INITIAL_USERS[]` — 3 registered users: j.yuliantoro (admin), a.iswanto (user), ky.cheong (user)
- `getRoleForEmail(email, users)` — returns the live role for any email; any unregistered @f5.com → 'readonly'
- `ROLE_LABELS` / `ROLE_COLORS` — display helpers used by Topbar and UsersPage
- `DEMO_OTP = '123456'` — the fixed OTP for this demo

### 1. Role display in Topbar
- `Topbar` now accepts a `role` prop.
- Shows `email` + a coloured `roleBadge` pill next to it: admin=red tint, user=blue tint, readonly=grey.
- Example: `j.yuliantoro@f5.com` + `[Admin]`

### 2. Login: OTP validation + role derivation
- `LoginPage` now validates OTP against `DEMO_OTP` ('123456'). Wrong OTP shows an inline error, clears the boxes, and allows retry.
- Email step now enforces `@f5.com` domain — non-f5 emails get a clear error message.
- On successful OTP, calls `getRoleForEmail(email, users)` and passes role to `onAuthenticated(email, role)`.
- LoginPage accepts `users` prop (the live registry from App state) so role changes made in UsersPage are reflected immediately on next login.

### 3. Users page (`UsersPage.jsx` + `UsersPage.module.css`)
- New page, accessible only to admins (`adminOnly: true` in Sidebar NAV item).
- Shows a table of registered users sorted by role (admin → user → read-only).
- Each row: avatar initial, name, email, current role badge, 3 role buttons (Read-Only / User / Admin), added date.
- Active role button is highlighted; inactive buttons have clear hover states per role colour.
- "You" tag on the current user's row; that row shows "Cannot change own role" instead of buttons.
- Guard: cannot demote the last remaining admin (shows alert).
- Role changes call `onUsersChange(updated)` to propagate back to App state, so the registry stays live.

### 4. Sidebar: icons and adminOnly gating
- `accounts` icon changed to a building/enterprise icon (roof line + two floors + two windows).
- `users` icon is the old person silhouette (moved from accounts).
- `Sidebar` accepts `role` prop; items with `adminOnly: true` are filtered out for non-admins.
- Users nav item: `{ id: 'users', label: 'Users', icon: 'users', adminOnly: true }`.

### 5. App.jsx: users state lifted up
- `users` state initialized from `INITIAL_USERS`, passed to LoginPage and UsersPage.
- `onUsersChange` callback on UsersPage updates App-level users state.
- `handleNav` guards: readonly → only sample-reports; non-admin → no users page.
- `Topbar` and `Sidebar` both receive `role` prop.

### What to build next
1. DNS Lifecycle page (`id: 'dns-lifecycle'`)
2. HTTPS Scan Report page + Lifecycle
3. Surface / Deep Scan Report + Lifecycle pages
4. Read-only login path (non-registered @f5.com bypass OTP → sample-reports)
5. New Scan flow — wire `+ New Scan` button

---

## v12 changes (applied)

### 1. Add User button + inline form
- `+ Add User` button sits in the top-right of the Users page header.
- Clicking toggles an inline `AddUserForm` panel below the header (button text changes to `✕ Cancel`).
- Form has 4 fields in a grid: Email (required, @f5.com enforced), Display Name, Country, Initial Role (select dropdown).
- Duplicate email and invalid domain show inline field errors.
- On submit, new user is appended to state and propagated via `onUsersChange`.
- New user includes a `country` field (added to the data shape in `users.js`).

### 2. Checkboxes + Delete Selected button
- Every row (except "You") has a custom checkbox to the left of the avatar.
- Select-all checkbox in the column header selects/deselects all non-self rows.
- When ≥1 user is selected, `Delete Selected (N)` button appears in the header.
- Clicking Delete shows an inline confirmation ("Delete N users? | Yes, delete | Cancel").
- Guards: cannot delete yourself, cannot delete all admins.
- Selected rows get a blue `#eef1ff` highlight; a blue `✓` badge overlays the avatar.

### 3. 23 ASEAN users in `users.js`
- 3 original + 20 new users across SG, MY, TH, PH, VN, ID, MM.
- Each user has a `country` field (new column in the table: between User and Role).
- Users sorted admin → user → readonly, then alphabetically within group.

### Scrollable table body (table-only scroll)
- `.page` uses `height: 100%` + `flex column` to fill the `.body` scroll container.
- `.tableWrap` uses `flex: 1; min-height: 0` to grow into remaining space.
- `.tableHead` is `flex-shrink: 0` (never scrolls — always visible).
- `.tableBody` uses `flex: 1; overflow-y: auto` — only this area scrolls.
- Result: title, buttons, legend, Add User form, column headers, and footer all stay
  fixed in view; only the user rows scroll vertically.

### Data shape change
All users in `INITIAL_USERS` now include a `country` field. The `AddUserForm` also
captures `country`. Existing code that spreads user objects is unaffected.
