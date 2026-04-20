import { useState } from 'react';
import F5Logo from './F5Logo';
import styles from './Sidebar.module.css';

const NAV = [
  {
    section: 'Overview',
    items: [
      { id: 'dashboard',      label: 'Dashboard',      icon: 'grid'    },
      { id: 'sample-reports', label: 'Sample Reports', icon: 'sparkle' },
    ],
  },
  {
    section: 'Delivery',
    items: [
      {
        id: 'dns-group', label: 'DNS Discovery', icon: 'dns',
        children: [
          { id: 'dns',           label: 'Online (AWS Lambda)'   },
          { id: 'dns-lifecycle', label: 'Local (Python Script)' },
        ],
      },
      {
        id: 'https-group', label: 'HTTPS Discovery', icon: 'https',
        children: [
          { id: 'https',           label: 'Online (AWS Lambda)'   },
          { id: 'https-lifecycle', label: 'Local (Python Script)' },
        ],
      },
    ],
  },
  {
    section: 'Web and API Security',
    items: [
      {
        id: 'surface-group', label: 'Surface Discovery', icon: 'scan', badge: 'Public', badgeType: 'neutral',
        children: [
          { id: 'surface-scan',       label: 'Report'    },
          { id: 'surface-lifecycle',  label: 'Lifecycle' },
        ],
      },
      {
        id: 'deep-group', label: 'Deep Discovery', icon: 'probe', badge: 'Auth', badgeType: 'auth',
        children: [
          { id: 'deep-scan',       label: 'Report'    },
          { id: 'deep-lifecycle',  label: 'Lifecycle' },
        ],
      },
    ],
  },
  {
    section: 'AI Security',
    comingSoon: true,
    items: [
      { id: 'ai-discovery',   label: 'AI Discovery',   icon: 'brain',   disabled: true },
    ],
  },
  {
    section: 'Manage',
    items: [
      { id: 'accounts',     label: 'Accounts',         icon: 'accounts' },
      { id: 'scan-history', label: 'Discovery History', icon: 'history'  },
      { id: 'audit-log',    label: 'Audit Log',         icon: 'audit'    },
      { id: 'users',        label: 'Users',            icon: 'users', adminOnly: true },
    ],
  },
];

const ICONS = {
  grid: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
      <rect x="1"   y="1"   width="5.5" height="5.5" rx="1"/>
      <rect x="8.5" y="1"   width="5.5" height="5.5" rx="1"/>
      <rect x="1"   y="8.5" width="5.5" height="5.5" rx="1"/>
      <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1"/>
    </svg>
  ),
  sparkle: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M7.5 1.5v2M7.5 11.5v2M1.5 7.5h2M11.5 7.5h2"/>
      <path d="M3.7 3.7l1.4 1.4M9.9 9.9l1.4 1.4M9.9 5.1l1.4-1.4M3.7 11.3l1.4-1.4"/>
      <circle cx="7.5" cy="7.5" r="2.5"/>
    </svg>
  ),
  dns: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="7.5" cy="7.5" r="6"/>
      <ellipse cx="7.5" cy="7.5" rx="2.6" ry="6"/>
      <line x1="1.5" y1="7.5"  x2="13.5" y2="7.5"/>
      <line x1="2"   y1="4.5"  x2="13"   y2="4.5"/>
      <line x1="2"   y1="10.5" x2="13"   y2="10.5"/>
    </svg>
  ),
  https: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3" y="6.5" width="9" height="7" rx="1"/>
      <path d="M5 6.5V4.5a2.5 2.5 0 0 1 5 0v2"/>
      <circle cx="7.5" cy="10" r="1" fill="currentColor" stroke="none"/>
    </svg>
  ),
  scan: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="6.5" cy="6.5" r="4"/>
      <line x1="9.5" y1="9.5" x2="13" y2="13"/>
    </svg>
  ),
  probe: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="6.5" cy="6.5" r="4"/>
      <line x1="9.5" y1="9.5" x2="13" y2="13"/>
      <circle cx="6.5" cy="6.5" r="1.8" strokeDasharray="2 1.5"/>
    </svg>
  ),
  accounts: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="4" width="11" height="9" rx="1"/>
      <path d="M5 13V9h5v4"/>
      <path d="M2 4l5.5-3 5.5 3"/>
      <line x1="5" y1="7" x2="5" y2="7.01" strokeWidth="2" strokeLinecap="round"/>
      <line x1="10" y1="7" x2="10" y2="7.01" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  users: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="7.5" cy="5" r="2.5"/>
      <path d="M2 13c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/>
    </svg>
  ),
  history: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="7.5" cy="7.5" r="6"/>
      <path d="M7.5 4.5v3.5l2.5 1.5"/>
      <path d="M1.5 7.5H4" strokeLinecap="round"/>
    </svg>
  ),
  audit: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="2" y="1.5" width="11" height="12" rx="1.5"/>
      <line x1="4.5" y1="5"   x2="10.5" y2="5"/>
      <line x1="4.5" y1="7.5" x2="10.5" y2="7.5"/>
      <line x1="4.5" y1="10"  x2="8"    y2="10"/>
    </svg>
  ),
  // AI Discovery — brain icon (two lobes + central stem)
  brain: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {/* central stem */}
      <line x1="7.5" y1="13" x2="7.5" y2="7.2"/>
      {/* left lobe */}
      <path d="M7.5 7.2 C7.5 7.2 6.4 7.6 5.3 7.2 C3.8 6.7 3 5.5 3 4.3 C3 2.7 4.1 1.5 5.4 1.5 C6.2 1.5 6.9 1.9 7.5 2.7"/>
      {/* right lobe */}
      <path d="M7.5 7.2 C7.5 7.2 8.6 7.6 9.7 7.2 C11.2 6.7 12 5.5 12 4.3 C12 2.7 10.9 1.5 9.6 1.5 C8.8 1.5 8.1 1.9 7.5 2.7"/>
      {/* left inner crease */}
      <path d="M3.8 5.2 C4.2 6 5 6.5 5.8 6.6"/>
      {/* right inner crease */}
      <path d="M11.2 5.2 C10.8 6 10 6.5 9.2 6.6"/>
      {/* base feet */}
      <line x1="5.5" y1="13" x2="9.5" y2="13"/>
    </svg>
  ),
  // kept for potential future use
  aiGateway: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="4" width="11" height="7" rx="1.5"/>
      <circle cx="7.5" cy="7.5" r="1.8"/>
      <line x1="2" y1="7.5" x2="5.7" y2="7.5"/>
      <line x1="9.3" y1="7.5" x2="13" y2="7.5"/>
    </svg>
  ),
  aiAssistant: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M2 11.5V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1H5L2 13v-1.5z"/>
      <circle cx="5.5" cy="6.5" r="0.8" fill="currentColor" stroke="none"/>
      <circle cx="7.5" cy="6.5" r="0.8" fill="currentColor" stroke="none"/>
      <circle cx="9.5" cy="6.5" r="0.8" fill="currentColor" stroke="none"/>
    </svg>
  ),
  chevron: (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M2.5 4l3 3 3-3"/>
    </svg>
  ),
};

export default function Sidebar({ active = 'dashboard', onNav, role = 'readonly' }) {
  // Auto-open the group that contains the active child
  const initialOpen = NAV.flatMap(g => g.items)
    .filter(item => item.children?.some(c => c.id === active))
    .map(item => item.id);
  const [openGroups, setOpenGroups] = useState(initialOpen);

  const toggleGroup = (id) =>
    setOpenGroups(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );

  const handleItemClick = (item) => {
    if (item.disabled) return;
    if (item.children) {
      toggleGroup(item.id);
      onNav?.(item.children[0].id);
    } else {
      onNav?.(item.id);
    }
  };

  return (
    <nav className={styles.sidebar}>
      <div className={styles.logoArea}>
        <F5Logo size={36} />
        <span className={styles.logoText}>
          ASEAN Presales<br />
          <span className={styles.logoSub}>Resilience Score Card</span>
        </span>
      </div>

      <div className={styles.navScroll}>
        {NAV.map((group, gi) => (
          <div key={group.section} className={`${styles.section} ${gi > 0 ? styles.sectionBorder : ''}`}>
            <div className={styles.sectionLabel}>
              {group.section}
              {group.comingSoon && (
                <span className={styles.comingSoonBadge}>Soon</span>
              )}
            </div>
            {group.items
              .filter(item => !item.adminOnly || role === 'admin')
              .map(item => {
              const isActive = !item.disabled && (active === item.id || item.children?.some(c => c.id === active));
              const isOpen   = openGroups.includes(item.id);
              return (
                <div key={item.id}>
                  <button
                    className={[
                      styles.navItem,
                      isActive ? styles.active : '',
                      item.disabled ? styles.navItemDisabled : '',
                    ].join(' ')}
                    onClick={() => handleItemClick(item)}
                    aria-expanded={item.children ? isOpen : undefined}
                    disabled={item.disabled}
                    title={item.disabled ? 'Coming soon' : undefined}
                  >
                    <span className={styles.icon}>{ICONS[item.icon]}</span>
                    <span className={styles.label}>{item.label}</span>
                    {item.badge && (
                      <span className={[styles.badge, styles['badge--' + item.badgeType]].join(' ')}>
                        {item.badge}
                      </span>
                    )}
                    {item.children && (
                      <span className={[styles.chevron, isOpen ? styles.chevronOpen : ''].join(' ')}>
                        {ICONS.chevron}
                      </span>
                    )}
                  </button>
                  {item.children && isOpen && (
                    <div className={styles.subItems}>
                      {item.children.map(child => (
                        <button
                          key={child.id}
                          className={[styles.subItem, active === child.id ? styles.subItemActive : ''].join(' ')}
                          onClick={() => onNav?.(child.id)}
                        >
                          <span className={styles.subDot} />
                          {child.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
