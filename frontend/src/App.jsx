import { useState } from 'react';
import LoginPage          from './components/LoginPage';
import Sidebar            from './components/Sidebar';
import Topbar             from './components/Topbar';
import Dashboard          from './components/Dashboard';
import AccountsPage       from './components/AccountsPage';
import ScanHistoryPage    from './components/ScanHistoryPage';
import DnsPage            from './components/DnsPage';
import SampleReportsPage  from './components/SampleReportsPage';
import UsersPage          from './components/UsersPage';
import PrivacyFooter      from './components/PrivacyFooter';
import SurfaceScanPage    from './components/SurfaceScanPage';
import DeepScanPage       from './components/DeepScanPage';
import HttpsPage          from './components/HttpsPage';
import LifecyclePage      from './components/LifecyclePage';
import { INITIAL_USERS, getRoleForEmail } from './data/users';
import styles from './App.module.css';

// ── Section → topbar title mapping ───────────────────────────────────────────
const DELIVERY_IDS = new Set(['dns', 'dns-lifecycle', 'https', 'https-lifecycle']);
const SECURITY_IDS = new Set(['surface-scan', 'surface-lifecycle', 'deep-scan', 'deep-lifecycle']);

function getTitle(navItem) {
  if (DELIVERY_IDS.has(navItem))  return 'Application Delivery Resilience Score Cards';
  if (SECURITY_IDS.has(navItem))  return 'Application Security Resilience Score Cards';
  return 'Application Resilience Score Cards';
}

export default function App() {
  const [email,   setEmail]   = useState(null);
  const [role,    setRole]    = useState(null);   // 'admin' | 'user' | 'readonly'
  const [navItem, setNavItem] = useState('dashboard');

  // Live user registry — admins can edit roles in UsersPage
  const [users, setUsers] = useState(INITIAL_USERS);

  const handleAuthenticated = (email, incomingRole) => {
    // Re-derive role from live registry (in case it was changed during this session)
    const liveRole = getRoleForEmail(email, users) ?? incomingRole ?? 'readonly';
    setEmail(email);
    setRole(liveRole);
    setNavItem(liveRole === 'readonly' ? 'sample-reports' : 'dashboard');
  };

  if (!email) {
    return <LoginPage onAuthenticated={handleAuthenticated} users={users} />;
  }

  const handleNav = (id) => {
    // Read-only: only sample-reports accessible
    if (role === 'readonly' && id !== 'sample-reports') return;
    // Users page: admin only
    if (id === 'users' && role !== 'admin') return;
    setNavItem(id);
  };

  const renderPage = () => {
    switch (navItem) {
      case 'dashboard':       return <Dashboard />;
      case 'sample-reports':  return <SampleReportsPage />;
      case 'accounts':        return <AccountsPage />;
      case 'scan-history':    return <ScanHistoryPage />;
      case 'dns':             return <DnsPage />;
      case 'dns-lifecycle':   return <LifecyclePage pillar="dns" />;
      case 'https':           return <HttpsPage />;
      case 'https-lifecycle': return <LifecyclePage pillar="https" />;
      case 'surface-scan':    return <SurfaceScanPage />;
      case 'surface-lifecycle': return <LifecyclePage pillar="surfaceScan" />;
      case 'deep-scan':       return <DeepScanPage />;
      case 'deep-lifecycle':  return <LifecyclePage pillar="deepScan" />;
      case 'users':
        return role === 'admin'
          ? <UsersPage currentUserEmail={email} users={users} onUsersChange={setUsers} />
          : null;
      default:
        return (
          <div className={styles.placeholder}>
            <p className={styles.placeholderTitle}>
              {navItem.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
            </p>
            <p className={styles.placeholderSub}>This section is coming soon.</p>
          </div>
        );
    }
  };

  return (
    <div className={styles.shell}>
      <Sidebar active={navItem} onNav={handleNav} role={role} />
      <div className={styles.main}>
        <Topbar
          email={email}
          role={role}
          onLogout={() => { setEmail(null); setRole(null); }}
          title={getTitle(navItem)}
        />
        <div className={styles.body}>
          {renderPage()}
        </div>
        <PrivacyFooter />
      </div>
    </div>
  );
}
