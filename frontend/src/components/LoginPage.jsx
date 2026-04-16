import { useState } from 'react';
import F5Logo from './F5Logo';
import OtpInput from './OtpInput';
import ResendTimer from './ResendTimer';
import PrivacyFooter from './PrivacyFooter';
import { getRoleForEmail, INITIAL_USERS } from '../data/users';
import { initiateAuth, respondToChallenge, AUTH_MODE } from '../api/auth';
import styles from './LoginPage.module.css';

export default function LoginPage({ onAuthenticated, users = INITIAL_USERS }) {
  const [step,       setStep]       = useState('email'); // 'email' | 'otp'
  const [email,      setEmail]      = useState('');
  const [otp,        setOtp]        = useState('');
  const [session,    setSession]    = useState(null);   // Cognito session token
  const [isLoading,  setIsLoading]  = useState(false);
  const [emailError, setEmailError] = useState('');
  const [otpError,   setOtpError]   = useState('');

  const maskedEmail = email
    ? email.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + b.replace(/./g, '•') + c)
    : '';

  const validateEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  // Step 1 — validate email, call Cognito InitiateAuth, trigger OTP email
  const handleEmailSubmit = async e => {
    e.preventDefault();
    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    if (!email.toLowerCase().endsWith('@f5.com')) {
      setEmailError('Access is restricted to @f5.com accounts only.');
      return;
    }
    setEmailError('');
    setIsLoading(true);
    try {
      const sess = await initiateAuth(email);
      setSession(sess);
      setStep('otp');
    } catch (err) {
      setEmailError(err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2 — submit OTP to Cognito RespondToAuthChallenge, get IdToken
  const handleOtpComplete = async completeOtp => {
    setIsLoading(true);
    try {
      const tokens = await respondToChallenge(email, session, completeOtp);
      const role = getRoleForEmail(email, users);
      onAuthenticated(email, role ?? 'readonly', tokens.IdToken);
    } catch (err) {
      setOtpError(err.message || 'Invalid code. Please try again.');
      setOtp('');
    } finally {
      setIsLoading(false);
    }
  };

  // Resend: re-trigger InitiateAuth to get a fresh session + new OTP email
  const handleResend = async () => {
    setOtp('');
    setOtpError('');
    try {
      const sess = await initiateAuth(email);
      setSession(sess);
    } catch (err) {
      setOtpError('Failed to resend code. Please go back and try again.');
    }
  };

  const subTitles = {
    email: 'Access is restricted to @f5.com accounts.',
    otp:   `We sent a 6-digit code to ${maskedEmail}`,
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.logo}>
          <a href="https://www.f5.com/cloud"><F5Logo size={48} /></a>
        </div>
        <div className={styles.header}>
          <h3 className={styles.title}>ASEAN Resilience Score Card System</h3>
          <p className={styles.subtitle}>{subTitles[step]}</p>
        </div>

        <div className={styles.card}>
          <div className={styles.cardBody}>

            {/* ── STEP 1: Email ── */}
            {step === 'email' && (
              <form onSubmit={handleEmailSubmit} className={styles.form}>
                <div className={styles.formGroup}>
                  <label htmlFor="username" className={styles.label}>
                    <span className={styles.required}>* </span>Email
                  </label>
                  <input
                    id="username"
                    className={`${styles.input} ${emailError ? styles.inputError : ''}`}
                    name="username"
                    type="text"
                    autoFocus
                    autoComplete="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setEmailError(''); }}
                    placeholder="you@f5.com"
                  />
                  {emailError && <p className={styles.fieldError}>{emailError}</p>}
                </div>
                <div className={styles.actions}>
                  {isLoading ? (
                    <button className={styles.btnPrimary} disabled>
                      <span className={styles.spinner} />Sending…
                    </button>
                  ) : (
                    <button className={styles.btnPrimary} type="submit">Continue</button>
                  )}
                </div>
              </form>
            )}

            {/* ── STEP 2: OTP ── */}
            {step === 'otp' && (
              <div className={styles.form}>
                <div className={styles.formGroup}>
                  <OtpInput value={otp} onChange={v => { setOtp(v); setOtpError(''); }} onComplete={handleOtpComplete} />
                  {otpError && <p className={styles.fieldError} style={{ marginTop: 8 }}>{otpError}</p>}
                </div>
                {isLoading && (
                  <div className={styles.verifying}>
                    <span className={styles.spinnerDark} />Verifying…
                  </div>
                )}
                {!isLoading && <ResendTimer onResend={handleResend} />}
                <div className={styles.formGroup} style={{ marginTop: 16 }}>
                  <button type="button" className={styles.btnBack}
                    onClick={() => { setStep('email'); setOtp(''); setOtpError(''); setSession(null); }}>
                    ← Back to email
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
      <PrivacyFooter />
    </div>
  );
}
