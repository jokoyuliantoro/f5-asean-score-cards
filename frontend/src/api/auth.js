// frontend/src/api/auth.js
// Cognito CUSTOM_AUTH (OTP) flow — no Amplify dependency

const REGION    = 'ap-southeast-1';
const CLIENT_ID = '233vpvh8n0c3q95hn6021mpod8';
const ENDPOINT  = `https://cognito-idp.${REGION}.amazonaws.com/`;

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
 * Step 1 — trigger OTP email via SES.
 * Returns the Cognito Session token needed for step 2.
 */
export async function initiateAuth(email) {
  const data = await cognitoPost('InitiateAuth', {
    AuthFlow: 'CUSTOM_AUTH',
    ClientId: CLIENT_ID,
    AuthParameters: { USERNAME: email },
  });
  if (!data.Session) throw new Error('No session returned — check Cognito trigger logs');
  return data.Session;
}

/**
 * Step 2 — submit OTP answer.
 * Returns { IdToken, AccessToken, ExpiresIn, RefreshToken }.
 */
export async function respondToChallenge(email, session, otpCode) {
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
