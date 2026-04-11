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
  if (DELIVERY_IDS.has(navItem))  return 'Application Delivery Discovery Score Cards';
  if (SECURITY_IDS.has(navItem))  return 'Application Security Discovery Score Cards';
  return 'Application Discovery Score Cards';
}

export default function App() {
  const [email,   setEmail]   = useState(null);
  const [role,    setRole]    = useState(null);   // 'admin' | 'user' | 'readonly'
  const [idToken, setIdToken] = useState(null);   // Cognito IdToken for API calls
  const [navItem, setNavItem] = useState('dashboard');

  // Live user registry — admins can edit roles in UsersPage
  const [users, setUsers] = useState(INITIAL_USERS);

  // Called by LoginPage after successful OTP verification
  const handleAuthenticated = (email, incomingRole, token) => {
    const liveRole = getRoleForEmail(email, users) ?? incomingRole ?? 'readonly';
    setEmail(email);
    setRole(liveRole);
    setIdToken(token);
    setNavItem(liveRole === 'readonly' ? 'sample-reports' : 'dashboard');
  };

  if (!email) {
    return <LoginPage onAuthenticated={handleAuthenticated} users={users} />;
  }

  const handleNav = (id) => {
    if (role === 'readonly' && id !== 'sample-reports') return;
    if (id === 'users' && role !== 'admin') return;
    setNavItem(id);
  };

  const handleLogout = () => {
    setEmail(null);
    setRole(null);
    setIdToken(null);
    setNavItem('dashboard');
  };

  const renderPage = () => {
    switch (navItem) {
      case 'dashboard':       return <Dashboard />;
      case 'sample-reports':  return <SampleReportsPage />;
      case 'accounts':        return <AccountsPage />;
      case 'scan-history':    return <ScanHistoryPage />;
      case 'dns':             return <DnsPage idToken={idToken} />;
      case 'dns-lifecycle':   return <LifecyclePage pillar="dns" />;
      case 'https':           return <HttpsPage idToken={idToken} />;
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
          onLogout={handleLogout}
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
