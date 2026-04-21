// frontend/src/api/auth.js
// Cognito CUSTOM_AUTH (OTP) flow — no Amplify dependency
//
// Auth modes (set via VITE_AUTH_MODE in .env.local):
//   live  — real Cognito flow, OTP sent via SES (default)
//   demo  — no API calls, fixed OTP = 123456 (for local dev / cost-free iteration)

const REGION    = 'ap-southeast-1';
const CLIENT_ID = window.__ENV__?.COGNITO_CLIENT_ID || '5a3vcf65qbof6ul7popqsaav5d';
const ENDPOINT  = `https://cognito-idp.${REGION}.amazonaws.com/`;
const DEMO_OTP  = '123456';

export const AUTH_MODE = import.meta.env.VITE_AUTH_MODE === 'demo' ? 'demo' : 'live';

// Fake IdToken used in demo mode — encodes email as a minimal JWT-like string
// so downstream code that reads the token still gets a non-null value
function makeDemoToken(email) {
  const payload = btoa(JSON.stringify({ email, sub: 'demo', exp: Date.now() / 1000 + 28800 }));
  return `demo.${payload}.signature`;
}

async function cognitoPost(target, body) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.__type || 'Auth error');
  return data;
}

/**
 * Step 1 — trigger OTP.
 * demo mode: instant, no network call, returns a sentinel session string.
 * live mode: calls Cognito InitiateAuth → SES sends OTP email.
 */
export async function initiateAuth(email) {
  if (AUTH_MODE === 'demo') {
    // Simulate the ~800ms delay so the UI spinner feels realistic
    await new Promise(r => setTimeout(r, 600));
    return `demo-session::${email}`;
  }
  const data = await cognitoPost('InitiateAuth', {
    AuthFlow: 'CUSTOM_AUTH',
    ClientId: CLIENT_ID,
    AuthParameters: { USERNAME: email },
  });
  if (!data.Session) throw new Error('No session returned — check Cognito trigger logs');
  return data.Session;
}

/**
 * Step 2 — verify OTP.
 * demo mode: accepts DEMO_OTP ('123456') only, returns a fake token.
 * live mode: calls Cognito RespondToAuthChallenge → returns real IdToken.
 */
export async function respondToChallenge(email, session, otpCode) {
  if (AUTH_MODE === 'demo') {
    await new Promise(r => setTimeout(r, 400));
    if (otpCode.trim() !== DEMO_OTP) {
      throw new Error(`Demo mode: OTP must be ${DEMO_OTP}`);
    }
    return {
      IdToken:      makeDemoToken(email),
      AccessToken:  'demo-access-token',
      ExpiresIn:    28800,
    };
  }
  const data = await cognitoPost('RespondToAuthChallenge', {
    ChallengeName: 'CUSTOM_CHALLENGE',
    ClientId: CLIENT_ID,
    Session: session,
    ChallengeResponses: {
      USERNAME: email,
      ANSWER: otpCode.trim(),
    },
  });
  if (!data.AuthenticationResult) {
    throw new Error('Invalid code. Please check your email and try again.');
  }
  return data.AuthenticationResult;
}
