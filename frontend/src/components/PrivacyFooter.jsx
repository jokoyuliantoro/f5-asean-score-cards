import styles from './PrivacyFooter.module.css';

const links = [
  { label: 'Policies',                        href: 'https://www.f5.com/company/policies' },
  { label: 'Trademarks',                      href: 'https://www.f5.com/company/policies/trademarks' },
  { label: 'F5 CA Privacy Summary',           href: 'https://www.f5.com/company/policies/F5-California-privacy-summary' },
  { label: 'Do Not Sell My Personal Information', href: 'https://www.f5.com/company/policies/privacy-notice#no-sell' },
];

export default function PrivacyFooter() {
  return (
    <div className={styles.footer}>
      <span className={styles.copy}>© {new Date().getFullYear()} F5, Inc. All Rights Reserved.</span>
      {links.map(l => (
        <span key={l.label} className={styles.item}>
          <span className={styles.dot} />
          <a href={l.href} target="_blank" rel="noreferrer noopener">{l.label}</a>
        </span>
      ))}
    </div>
  );
}
