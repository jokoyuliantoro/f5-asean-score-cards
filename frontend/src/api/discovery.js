/**
 * frontend/src/api/discovery.js
 *
 * Changes vs previous version:
 *   runDnsDiscovery() now accepts an optional third argument `onPhase`
 *   — a callback(phaseKey) that drives the DiscoveryProgress floater.
 *
 * All existing token logic and error handling is UNCHANGED.
 * The phase simulation runs on a timer while the real fetch is in-flight,
 * then `analysis` and `done` are fired when the response arrives.
 */

const API_BASE =
  (window.__ENV__ && window.__ENV__.API_URL) ||
  import.meta.env.VITE_API_BASE_URL ||
  'https://0ol0f4sixh.execute-api.ap-southeast-1.amazonaws.com/v1';

// ── Phase simulation ──────────────────────────────────────────────────────────
// Phases init→scoring advance on a timer while the Lambda runs.
// `analysis` fires on response arrival (GPT-4o done), `done` 600ms later.

const PHASE_DELAYS = [
  ['init',     300],
  ['apex',     900],
  ['records',  1200],
  ['ns',       1400],
  ['latency',  2000],
  ['anycast',  1500],
  ['ripe',     1200],
  ['scoring',  800],
  // 'analysis' and 'done' are driven by response arrival
];

function startPhaseSimulation(onPhase, signal) {
  let cancelled = false;
  signal.addEventListener('abort', () => { cancelled = true; });

  (async () => {
    for (const [phase, delay] of PHASE_DELAYS) {
      if (cancelled) return;
      onPhase(phase);
      await new Promise(r => setTimeout(r, delay));
      if (cancelled) return;
    }
    // Hold at 'scoring' until the real response comes back
  })();
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Run DNS discovery.
 *
 * @param {string}   domain
 * @param {string}   idToken   — Cognito IdToken (passed from DnsPage prop)
 * @param {Function} [onPhase] — optional phase callback for progress floater
 * @returns {Promise<object>}  — full API response including aiAnalysis
 */
export async function runDnsDiscovery(domain, idToken, onPhase = null) {
  // Separate controllers — fetch abort and phase simulator abort are independent
  const fetchController   = new AbortController();
  const phaseController   = new AbortController();

  if (onPhase) {
    onPhase('init');
    startPhaseSimulation(onPhase, phaseController.signal);
  }

  let response;
  try {
    const rawToken = import.meta.env.VITE_DEMO_TOKEN
      || sessionStorage.getItem('idToken')
      || idToken;
    const token = rawToken && !rawToken.startsWith('demo.') ? rawToken : null;

    response = await fetch(`${API_BASE}/discovery/dns`, {
      method: 'POST',
      signal: fetchController.signal,   // fetch uses its own controller
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ domain }),
    });
  } catch (err) {
    phaseController.abort();            // stop simulator on fetch error
    throw err;
  }

  // Stop the phase simulator only — fetch is already complete
  phaseController.abort();

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Discovery failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = await response.json();

  if (onPhase) {
    onPhase('analysis');
    await new Promise(r => setTimeout(r, 600));
    onPhase('done');
  }

  return data;
}

export async function runHttpsDiscovery(domain, idToken, onPhase = null) {
  throw new Error('HTTPS discovery not yet implemented');
}
