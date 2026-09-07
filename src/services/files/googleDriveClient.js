/**
 * Google Drive client
 * ---------------------------------------------------------------------------
 * The only file that knows Google's endpoints and holds its access token.
 * `googleDriveFileStore.js` asks it for an authorized `fetch` and doesn't
 * think about auth at all — same split as `dropboxClient.js`.
 *
 * WHY THIS DOESN'T LOOK LIKE THE DROPBOX ONE. Google's authorization-code
 * flow for a "Web application" client requires a client secret at the token
 * endpoint, and a secret cannot ship inside a JavaScript bundle — anyone can
 * read it. So there is no PKCE code exchange here and no refresh token.
 *
 * What browsers get instead is Google Identity Services' token client, which
 * hands back an access token directly (the implicit flow) and lasts about an
 * hour. Renewal is a silent re-request with `prompt: ''`: while the user still
 * has a live Google session and has already consented, it resolves without any
 * UI at all. When it can't — consent revoked, signed out of Google — `restore`
 * returns null and `useSync` shows a reconnect prompt rather than failing
 * silently. That's the real cost of this provider versus Dropbox, and it's why
 * the adapter retries a 401 exactly once after forcing a renewal.
 *
 * SCOPE. `drive.file` grants access to files this app itself creates or the
 * user explicitly opens with it — and nothing else in their Drive. This code
 * cannot enumerate, read or write anything it didn't put there.
 *
 * WHY `drive.file` AND NOT `drive.appdata`. The app-data folder is hidden
 * from the user, which is right for a config blob and wrong for the files
 * here: someone storing an image wants to see it in their own Drive, move
 * it, and know it's theirs. `drive.file` also happens to be the scope Google
 * treats as non-sensitive, so an OAuth client using it isn't held to the
 * test-user cap that a sensitive scope carries. (Google does revise these
 * classifications — the consent screen in the console shows the current one
 * for whatever scopes you've added.)
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || '';

/** True when a client id is configured, i.e. Drive sync is offered at all. */
export const isGoogleDriveConfigured = Boolean(CLIENT_ID);

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
export const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

/** Renew a little early, so a request already in flight doesn't expire. */
const EXPIRY_SKEW_MS = 60_000;

function assertConfigured() {
  if (!isGoogleDriveConfigured) throw new Error('Google Drive sync isn’t configured for this app.');
}

/** Loads Google's script once, on first use — not in `index.html`, so a user
 *  who never touches Drive sync never fetches anything from Google. */
let scriptPromise = null;
function loadIdentityServices() {
  scriptPromise ??= new Promise((resolve, reject) => {
    if (globalThis.google?.accounts?.oauth2) {
      resolve(globalThis.google.accounts.oauth2);
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (globalThis.google?.accounts?.oauth2) resolve(globalThis.google.accounts.oauth2);
      else reject(new Error('Google’s sign-in library loaded but didn’t initialise.'));
    };
    script.onerror = () => {
      scriptPromise = null; // let a later attempt retry rather than caching the failure
      reject(new Error('Could not reach Google to sign in. Check your connection and try again.'));
    };
    document.head.append(script);
  });
  return scriptPromise;
}

/**
 * Requests an access token from Google.
 *
 * @param {object} options
 * @param {'' | 'consent'} options.prompt `''` asks for a silent renewal and
 *   fails if Google would need to show anything; `'consent'` is the visible
 *   first-time flow.
 * @param {string} [options.hint] the account email, so a renewal targets the
 *   account already connected rather than whichever one is default.
 * @returns {Promise<{accessToken: string, expiresAt: number}>}
 */
function requestToken({ prompt, hint }) {
  return loadIdentityServices().then(
    (oauth2) =>
      new Promise((resolve, reject) => {
        const client = oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPE,
          prompt,
          hint,
          callback: (response) => {
            if (response.error) {
              reject(new Error(response.error_description || response.error));
              return;
            }
            resolve({
              accessToken: response.access_token,
              expiresAt: Date.now() + Number(response.expires_in ?? 3600) * 1000,
            });
          },
          error_callback: (error) => {
            // Covers the popup being closed and a silent renewal that would
            // have needed UI — both are "not signed in", not a crash.
            reject(new Error(error?.type === 'popup_closed' ? 'Sign-in was cancelled.' : 'Google sign-in failed.'));
          },
        });
        client.requestAccessToken();
      }),
  );
}

/** @param {string} accessToken */
async function fetchAccount(accessToken) {
  const response = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) return null;
  return response.json();
}

/**
 * Runs the interactive consent flow.
 * @returns {Promise<object>} a session for `syncService`'s connection record
 */
export async function connect() {
  assertConfigured();

  const token = await requestToken({ prompt: 'consent' });
  const account = await fetchAccount(token.accessToken);

  return {
    // No stable id without an identity token, and the email is what the user
    // recognises anyway — it's only ever used to key the local mirror and to
    // hint renewals back at the right account.
    accountId: account?.email ?? 'google',
    accountLabel: account?.email ?? 'Google Drive',
    ...token,
  };
}

/**
 * Silently re-establishes a stored session, or returns null if Google would
 * need to ask the user something. Null (rather than a throw) is what lets
 * `useSync` offer a reconnect instead of breaking the page.
 *
 * @param {object} session
 * @returns {Promise<object|null>}
 */
export async function restore(session) {
  if (!isGoogleDriveConfigured || !session) return null;
  if (session.accessToken && session.expiresAt > Date.now() + EXPIRY_SKEW_MS) return session;

  try {
    const token = await requestToken({ prompt: '', hint: session.accountLabel });
    return { ...session, ...token };
  } catch (error) {
    console.warn('[googleDrive] could not renew the access token silently', error);
    return null;
  }
}

/** Revokes the token, so the app disappears from the user's Google account
 *  permissions and the appDataFolder becomes unreachable. */
export async function disconnect(session) {
  if (!session?.accessToken) return;
  await fetch(`${REVOKE_URL}?token=${encodeURIComponent(session.accessToken)}`, { method: 'POST' });
}

/**
 * Wraps `fetch` with a valid bearer token, renewing on demand.
 *
 * @param {object} initialSession
 * @param {(session: object) => void} [onSessionChange] persists a renewed token
 */
export function createAuthorizedFetch(initialSession, onSessionChange) {
  let session = initialSession;
  // Concurrent calls must share one renewal — Google would issue several
  // tokens happily, but the losers would then be holding stale ones.
  let inFlightRenewal = null;

  async function getAccessToken() {
    if (session.accessToken && session.expiresAt > Date.now() + EXPIRY_SKEW_MS) {
      return session.accessToken;
    }
    inFlightRenewal ??= restore({ ...session, accessToken: null })
      .then((next) => {
        if (!next) {
          throw new Error('Your Google Drive connection expired. Reconnect it in Settings → Files.');
        }
        session = next;
        onSessionChange?.(next);
        return next.accessToken;
      })
      .finally(() => {
        inFlightRenewal = null;
      });
    return inFlightRenewal;
  }

  /** @param {boolean} [isRetry] guards against looping on a token Google
   *   keeps rejecting */
  return async function authorizedFetch(url, options = {}, isRetry = false) {
    const accessToken = await getAccessToken();
    const response = await fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 401 && !isRetry) {
      session = { ...session, accessToken: null, expiresAt: 0 };
      return authorizedFetch(url, options, true);
    }
    return response;
  };
}
