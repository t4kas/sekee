/**
 * Dropbox client
 * ---------------------------------------------------------------------------
 * The only file that knows Dropbox's endpoints and holds its tokens. The file
 * store (`dropboxFileStore.js`) asks it for an authorized `fetch` and doesn't
 * think about auth at all.
 *
 * WHY DROPBOX IS THE EASY ONE. Its OAuth supports PKCE with a public app key
 * and `token_access_type=offline`, which means a browser with no server can
 * get a REFRESH token. The connection then survives indefinitely without ever
 * shipping a client secret. (Google Drive can't do this — see
 * `googleDriveClient.js` for what it does instead.)
 *
 * SCOPE. The app is registered with "App folder" access, so every path here
 * is relative to `Apps/<app name>/` in the user's Dropbox. This code cannot
 * see, read or write anything else they have stored, and removing the app
 * from their account takes the folder with it.
 *
 * WHERE THE REFRESH TOKEN LIVES, honestly: `localStorage`, via the connection
 * record in `fileProviders.js`. Any XSS on this origin could read it. There is
 * no better option for an app with no backend — a token has to be somewhere
 * the page can reach — and the damage is bounded by the app-folder scope
 * above: it grants access to this app's own folder, not to the user's
 * Dropbox. If that tradeoff isn't acceptable for a given user, the answer is
 * to stay on "This device only", which is why that remains the default.
 */

import { createPkcePair, createState, getRedirectUri, openAuthPopup, postForm } from './oauthPkce.js';

const APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY?.trim() || '';

/** True when an app key is configured, i.e. Dropbox sync is offered at all. */
export const isDropboxConfigured = Boolean(APP_KEY);

const AUTHORIZE_URL = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const RPC_URL = 'https://api.dropboxapi.com/2';
const CONTENT_URL = 'https://content.dropboxapi.com/2';

/** The narrowest set that still lets the app read and write its own folder. */
const SCOPES = ['account_info.read', 'files.content.read', 'files.content.write'].join(' ');

/** Refresh a little before the token actually expires, so a request that's
 *  already in flight when the clock runs out doesn't fail. */
const EXPIRY_SKEW_MS = 60_000;

function assertConfigured() {
  if (!isDropboxConfigured) throw new Error('Dropbox sync isn’t configured for this app.');
}

/** @param {string} accessToken */
async function fetchAccount(accessToken) {
  // `get_current_account` takes no arguments: Dropbox rejects the call if a
  // JSON body or Content-Type is sent with it.
  const response = await fetch(`${RPC_URL}/users/get_current_account`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Could not read the Dropbox account (HTTP ${response.status}).`);
  return response.json();
}

function sessionFrom(tokens, account, previous) {
  return {
    accountId: account?.account_id ?? previous?.accountId,
    accountLabel: account?.email ?? account?.name?.display_name ?? previous?.accountLabel ?? 'Dropbox',
    // A refresh grant's response has no `refresh_token` of its own — the
    // original one keeps working, so carry it forward.
    refreshToken: tokens.refresh_token ?? previous?.refreshToken,
    accessToken: tokens.access_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 14400) * 1000,
  };
}

/**
 * Runs the interactive consent flow.
 * @returns {Promise<object>} a session for `syncService`'s connection record
 */
export async function connect() {
  assertConfigured();

  const { verifier, challenge } = await createPkcePair();
  const state = createState();
  const redirectUri = getRedirectUri();

  const authUrl = `${AUTHORIZE_URL}?${new URLSearchParams({
    client_id: APP_KEY,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    redirect_uri: redirectUri,
    // Without this Dropbox issues a short-lived access token and no refresh
    // token, and the connection would silently die after a few hours.
    token_access_type: 'offline',
    scope: SCOPES,
    state,
  })}`;

  const code = await openAuthPopup(authUrl, state);
  const tokens = await postForm(TOKEN_URL, {
    code,
    grant_type: 'authorization_code',
    client_id: APP_KEY,
    code_verifier: verifier,
    redirect_uri: redirectUri,
  });

  const account = await fetchAccount(tokens.access_token);
  return sessionFrom(tokens, account, null);
}

/**
 * Silently re-establishes a stored session, or returns null if it can't.
 * Returning null (rather than throwing) is what lets `useSync` show a
 * "reconnect" prompt instead of crashing the page on a revoked token.
 *
 * @param {object} session
 * @returns {Promise<object|null>}
 */
export async function restore(session) {
  if (!isDropboxConfigured || !session?.refreshToken) return null;
  if (session.accessToken && session.expiresAt > Date.now() + EXPIRY_SKEW_MS) return session;

  try {
    const tokens = await postForm(TOKEN_URL, {
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
      client_id: APP_KEY,
    });
    return sessionFrom(tokens, null, session);
  } catch (error) {
    console.warn('[dropbox] could not refresh the access token', error);
    return null;
  }
}

/** Revokes the token so the app disappears from the user's connected apps. */
export async function disconnect(session) {
  if (!session?.accessToken) return;
  await fetch(`${RPC_URL}/auth/token/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
}

/**
 * Wraps `fetch` with a valid bearer token, refreshing on demand.
 *
 * `onSessionChange` is how a refreshed access token gets written back to the
 * connection record — without it the app would refresh on every single page
 * load, since the stored session would never advance.
 *
 * @param {object} initialSession
 * @param {(session: object) => void} [onSessionChange]
 */
export function createAuthorizedFetch(initialSession, onSessionChange) {
  let session = initialSession;
  // Concurrent calls must not each start their own refresh — Dropbox would
  // be fine with it, but the losers would then be holding a stale token.
  let inFlightRefresh = null;

  async function getAccessToken() {
    if (session.accessToken && session.expiresAt > Date.now() + EXPIRY_SKEW_MS) {
      return session.accessToken;
    }
    inFlightRefresh ??= restore(session)
      .then((next) => {
        if (!next) throw new Error('Your Dropbox connection expired. Reconnect it in Settings → Files.');
        session = next;
        onSessionChange?.(next);
        return next.accessToken;
      })
      .finally(() => {
        inFlightRefresh = null;
      });
    return inFlightRefresh;
  }

  /**
   * @param {string} url
   * @param {RequestInit} options
   * @param {boolean} [isRetry] guards against looping on a token that keeps
   *   coming back unauthorized
   */
  return async function authorizedFetch(url, options = {}, isRetry = false) {
    const accessToken = await getAccessToken();
    const response = await fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${accessToken}` },
    });

    // 401 means the token was revoked or invalidated early — force one
    // refresh and try again before giving up.
    if (response.status === 401 && !isRetry) {
      session = { ...session, accessToken: null, expiresAt: 0 };
      return authorizedFetch(url, options, true);
    }
    return response;
  };
}

export { CONTENT_URL, RPC_URL };
