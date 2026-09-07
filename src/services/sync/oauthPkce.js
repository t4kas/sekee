/**
 * Browser-only OAuth (PKCE) helpers
 * ---------------------------------------------------------------------------
 * Shared by the bring-your-own-cloud providers. Everything here runs in the
 * browser with no server and no client secret — PKCE is what makes that safe:
 * the authorization code is bound to a one-time secret this tab generated and
 * never sent, so intercepting the redirect on its own gets an attacker
 * nothing.
 *
 * WHY A POPUP RATHER THAN A FULL-PAGE REDIRECT. This app is a new-tab page.
 * Navigating the whole tab away to a consent screen and back means tearing
 * down and rebuilding everything the user was looking at, and landing them on
 * a URL with `?code=` in it. A popup keeps the page they started from intact,
 * and `oauth-callback.html` in `public/` is a static page whose only job is to
 * hand the code back through `postMessage` and close itself.
 *
 * TWO CHECKS MAKE THAT HANDBACK SAFE, and both matter — `postMessage` is
 * receivable by anything that can get a handle on this window:
 *   1. the message must come from THIS origin and from the popup we opened;
 *   2. the `state` must match the one we generated for this attempt.
 */

/** Base64url — the URL-safe alphabet, no padding, per RFC 7636. */
function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(byteLength) {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/**
 * @returns {Promise<{verifier: string, challenge: string}>} the verifier stays
 *   in this tab; only the challenge (its SHA-256) ever goes over the wire.
 */
export async function createPkcePair() {
  const verifier = randomString(64);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

/** A one-time value tying the redirect back to the request that started it. */
export function createState() {
  return randomString(16);
}

/**
 * The redirect target registered with each provider. A static file in
 * `public/`, so it resolves the same way under `vite dev`, `vite preview` and
 * a real deployment — no route to add, since this app has no router.
 */
export function getRedirectUri() {
  return `${window.location.origin}/oauth-callback.html`;
}

/** Popup dimensions — big enough for a consent screen on a laptop. */
const POPUP_FEATURES = 'width=560,height=720,menubar=no,toolbar=no,location=no';

/**
 * Opens `authUrl` in a popup and resolves with the authorization code.
 *
 * @param {string} authUrl
 * @param {string} expectedState the value passed as `state` in `authUrl`
 * @returns {Promise<string>} the authorization code
 */
export function openAuthPopup(authUrl, expectedState) {
  return new Promise((resolve, reject) => {
    const popup = window.open(authUrl, 'sekee-oauth', POPUP_FEATURES);
    if (!popup) {
      reject(new Error('Your browser blocked the sign-in window. Allow popups for this page and try again.'));
      return;
    }

    let closedPoll;

    function finish(error, code) {
      window.removeEventListener('message', handleMessage);
      clearInterval(closedPoll);
      popup.close();
      if (error) reject(error);
      else resolve(code);
    }

    function handleMessage(event) {
      // Both checks are load-bearing — see the header.
      if (event.origin !== window.location.origin || event.source !== popup) return;
      const data = event.data;
      if (data?.source !== 'sekee-oauth') return;

      if (data.state !== expectedState) {
        finish(new Error('The sign-in response didn’t match this request. Please try again.'));
        return;
      }
      if (data.error) {
        finish(new Error(data.error === 'access_denied' ? 'Sign-in was cancelled.' : data.error));
        return;
      }
      finish(null, data.code);
    }

    window.addEventListener('message', handleMessage);

    // The popup being closed by hand produces no message at all, so without
    // this the promise would hang forever and the Sync tab would sit on
    // "Connecting…".
    closedPoll = setInterval(() => {
      if (popup.closed) finish(new Error('Sign-in was cancelled.'));
    }, 500);
  });
}

/**
 * POSTs a form-encoded body to a token endpoint and returns the parsed JSON.
 * Shared because every provider's token and refresh calls have this shape,
 * and because their error payloads need turning into something a user can
 * actually read.
 *
 * @param {string} endpoint
 * @param {Record<string, string>} params
 */
export async function postForm(endpoint, params) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.error_description || payload?.error || `HTTP ${response.status}`;
    throw new Error(`Authorization failed: ${detail}`);
  }
  return payload;
}
