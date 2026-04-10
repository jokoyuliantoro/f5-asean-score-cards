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
        id: 'dns-group', label: 'DNS Probe', icon: 'dns',
        children: [
          { id: 'dns',           label: 'Report'    },
          { id: 'dns-lifecycle', label: 'Lifecycle' },
        ],
      },
      {
        id: 'https-group', label: 'HTTPS Probe', icon: 'https',
        children: [
          { id: 'https',           label: 'Report'    },
          { id: 'https-lifecycle', label: 'Lifecycle' },
        ],
      },
    ],
  },
  {
    section: 'Security',
    items: [
      {
        id: 'surface-group', label: 'Surface Probe', icon: 'scan', badge: 'Public', badgeType: 'neutral',
        children: [
          { id: 'surface-scan',       label: 'Report'    },
          { id: 'surface-lifecycle',  label: 'Lifecycle' },
        ],
      },
      {
        id: 'deep-group', label: 'Deep Probe', icon: 'probe', badge: 'Auth', badgeType: 'auth',
        children: [
          { id: 'deep-scan',       label: 'Report'    },
          { id: 'deep-lifecycle',  label: 'Lifecycle' },
        ],
      },
    ],
  },
  {
    section: 'Manage',
    items: [
      { id: 'accounts',     label: 'Accounts',     icon: 'accounts' },
      { id: 'scan-history', label: 'Probe History', icon: 'history'  },
      { id: 'users',        label: 'Users',        icon: 'users', adminOnly: true },
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
    /* Building / enterprise icon — two floors + roof line */
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="4" width="11" height="9" rx="1"/>
      <path d="M5 13V9h5v4"/>
      <path d="M2 4l5.5-3 5.5 3"/>
      <line x1="5" y1="7" x2="5" y2="7.01" strokeWidth="2" strokeLinecap="round"/>
      <line x1="10" y1="7" x2="10" y2="7.01" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  users: (
    /* Person silhouette — the old accounts icon */
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
          ASEAN<br />
          <span className={styles.logoSub}>Resilience Score Card</span>
        </span>
      </div>

      <div className={styles.navScroll}>
        {NAV.map((group, gi) => (
          <div key={group.section} className={`${styles.section} ${gi > 0 ? styles.sectionBorder : ''}`}>
            <div className={styles.sectionLabel}>{group.section}</div>
            {group.items
              .filter(item => !item.adminOnly || role === 'admin')
              .map(item => {
              const isActive = active === item.id || item.children?.some(c => c.id === active);
              const isOpen   = openGroups.includes(item.id);
              return (
                <div key={item.id}>
                  <button
                    className={[styles.navItem, isActive ? styles.active : ''].join(' ')}
                    onClick={() => handleItemClick(item)}
                    aria-expanded={item.children ? isOpen : undefined}
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
