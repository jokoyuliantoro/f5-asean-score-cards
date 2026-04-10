import { useState, useEffect } from 'react';
import styles from './ResendTimer.module.css';

export default function ResendTimer({ onResend }) {
  const [timer, setTimer] = useState(30);

  useEffect(() => {
    if (timer <= 0) return;
    const t = setTimeout(() => setTimer(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timer]);

  const handleResend = () => {
    if (timer > 0) return;
    setTimer(30);
    onResend();
  };

  return (
    <p className={styles.text}>
      {timer > 0 ? (
        <>Resend code in <strong>{timer}s</strong></>
      ) : (
        <>
          Didn't receive it?{' '}
          <button type="button" className={styles.btn} onClick={handleResend}>
            Resend
          </button>
        </>
      )}
    </p>
  );
}
