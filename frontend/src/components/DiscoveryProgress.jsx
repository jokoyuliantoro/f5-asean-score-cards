/**
 * DiscoveryProgress.jsx
 *
 * Floating progress window shown while a DNS discovery is running.
 * Mounts when discovery starts, unmounts (with fade-out) when complete.
 *
 * Props:
 *   phase   {string}  — current phase key (see PHASES below)
 *   visible {boolean} — controls mount/fade
 *   domain  {string}  — the domain being probed
 */

import { useEffect, useState } from 'react'
import styles from './DiscoveryProgress.module.css'

// Ordered phases with display labels and cumulative % weights
// Total = 100 when all phases complete
const PHASES = [
  { key: 'init',      label: 'Initialising discovery',        pct: 5  },
  { key: 'apex',      label: 'Resolving zone apex (SOA walk)', pct: 12 },
  { key: 'records',   label: 'Querying DNS records',           pct: 22 },
  { key: 'ns',        label: 'Identifying NS vendors',         pct: 35 },
  { key: 'latency',   label: 'Probing latency — SEA & USE1',  pct: 52 },
  { key: 'anycast',   label: 'Detecting anycast coverage',    pct: 65 },
  { key: 'ripe',      label: 'Enriching IP ownership (RIPE)', pct: 76 },
  { key: 'scoring',   label: 'Calculating resilience score',  pct: 86 },
  { key: 'analysis',  label: 'Generating AI analysis',        pct: 96 },
  { key: 'done',      label: 'Finalising report',             pct: 100 },
]

export default function DiscoveryProgress({ phase, visible, domain }) {
  const [opacity, setOpacity] = useState(0)
  const [closing, setClosing] = useState(false)

  // Fade in on mount
  useEffect(() => {
    if (visible) {
      setClosing(false)
      requestAnimationFrame(() => setOpacity(1))
    }
  }, [visible])

  // Fade out when phase = done or visible turns false
  useEffect(() => {
    if (phase === 'done' || (!visible && opacity === 1)) {
      setClosing(true)
      const t = setTimeout(() => setOpacity(0), 100)
      return () => clearTimeout(t)
    }
  }, [phase, visible])

  const currentPhase = PHASES.find(p => p.key === phase) || PHASES[0]
  const pct = currentPhase.pct
  const phaseIndex = PHASES.findIndex(p => p.key === phase)

  if (!visible && opacity === 0) return null

  return (
    <div
      className={styles.floater}
      style={{ opacity, transition: 'opacity 0.4s ease' }}
      aria-live="polite"
      aria-label="Discovery progress"
    >
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.spinner} aria-hidden="true" />
        <span className={styles.title}>
          {phase === 'done' ? 'Discovery complete' : 'Running discovery'}
        </span>
        {domain && (
          <span className={styles.domain}>{domain}</span>
        )}
      </div>

      {/* Progress bar */}
      <div className={styles.barTrack} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={styles.barFill}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Phase label + percentage */}
      <div className={styles.phaseRow}>
        <span className={styles.phaseLabel}>{currentPhase.label}</span>
        <span className={styles.pct}>{pct}%</span>
      </div>

      {/* Step dots */}
      <div className={styles.dots} aria-hidden="true">
        {PHASES.filter(p => p.key !== 'done').map((p, i) => (
          <span
            key={p.key}
            className={
              styles.dot +
              (i < phaseIndex ? ' ' + styles.dotDone :
               i === phaseIndex ? ' ' + styles.dotActive : '')
            }
          />
        ))}
      </div>
    </div>
  )
}
