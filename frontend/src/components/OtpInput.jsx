import { useRef } from 'react';
import styles from './OtpInput.module.css';

export default function OtpInput({ value, onChange, onComplete }) {
  const inputs = useRef([]);
  const digits = value.split('').concat(Array(6).fill('')).slice(0, 6);

  const handleKey = (e, idx) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = [...digits];
      if (next[idx]) {
        next[idx] = '';
        onChange(next.join(''));
      } else if (idx > 0) {
        next[idx - 1] = '';
        onChange(next.join(''));
        inputs.current[idx - 1]?.focus();
      }
      return;
    }
    if (e.key === 'ArrowLeft'  && idx > 0) { inputs.current[idx - 1]?.focus(); return; }
    if (e.key === 'ArrowRight' && idx < 5) { inputs.current[idx + 1]?.focus(); return; }
    if (!/^\d$/.test(e.key)) return;
    e.preventDefault();
    const next = [...digits];
    next[idx] = e.key;
    const joined = next.join('');
    onChange(joined);
    if (idx < 5) {
      inputs.current[idx + 1]?.focus();
    } else if (joined.replace(/\s/g, '').length === 6) {
      // Last digit filled — trigger auto-submit
      inputs.current[idx]?.blur();
      onComplete?.(joined);
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const joined = pasted.padEnd(6, '').slice(0, 6);
    onChange(joined);
    const focusIdx = Math.min(pasted.length, 5);
    inputs.current[focusIdx]?.focus();
    if (pasted.length === 6) {
      onComplete?.(joined);
    }
  };

  return (
    <div className={styles.group}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => (inputs.current[i] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onKeyDown={e => handleKey(e, i)}
          onPaste={handlePaste}
          onChange={() => {}}
          autoFocus={i === 0}
          className={`${styles.digit} ${d ? styles.filled : ''}`}
          aria-label={`OTP digit ${i + 1}`}
        />
      ))}
    </div>
  );
}
