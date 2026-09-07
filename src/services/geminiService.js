/**
 * Gemini service
 * ---------------------------------------------------------------------------
 * Lets the search bar answer a quick question directly, via Google's Gemini
 * API free tier. Unlike Unsplash/Supabase/Dropbox, the key here is supplied
 * by the user at runtime (pasted into Settings) rather than baked in at
 * build time — see `StorageKeys.geminiApiKey` / `DeviceLocalKeys` in
 * `storage.js` for why it's stored outside the synced `settings` blob.
 *
 * Gemini's `generateContent` endpoint is one of the few LLM APIs that allows
 * being called directly from a browser (no proxy, no special "I understand
 * this is unsafe" header) — which is what makes this feature possible at all
 * in an app with no backend.
 *
 * MODEL is `gemini-flash-lite-latest` — of Google's three free-tier
 * families (Pro, Flash, Flash-Lite), Flash-Lite consistently carries the
 * highest free-tier request quota, since it's the model built for
 * high-volume, low-latency use rather than reasoning depth, which suits a
 * quick search-bar answer fine. Still an alias, not a pinned version,
 * for the same reason `gemini-flash-latest` was used before: this was
 * briefly pinned to `gemini-1.5-flash` for its own once-higher limit, but
 * Google retired the whole 1.5 family on its 2025 deprecation schedule —
 * every request to it started 404ing, which `askGemini` used to fold into
 * the same generic "check your API key" message as an actual bad key. Both
 * the pin and that misdiagnosis are fixed: an alias again (so a future
 * model retirement can't silently break this the same way), and the error
 * message below now surfaces whatever Gemini's own response body says
 * instead of guessing from the HTTP status alone.
 */

import { storage, StorageKeys } from './storage.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-flash-lite-latest';

/** @returns {Promise<string>} the stored key, or '' if none is set. */
export async function getGeminiApiKey() {
  const key = await storage.read(StorageKeys.geminiApiKey);
  return typeof key === 'string' ? key : '';
}

/**
 * Listeners for a key saved/cleared *in this same tab* (AITab and the search
 * bar are both mounted here). `storage`'s own `subscribe` only fires the
 * browser's native `storage` event, which — per spec — never fires in the
 * tab that made the write, only in others. `useSettings.updateSettings`
 * sidesteps that by updating its own React state directly; this does the
 * equivalent for a value that's read by a different component than the one
 * that writes it.
 */
const localListeners = new Set();

/** @param {string} apiKey */
export async function setGeminiApiKey(apiKey) {
  const trimmed = apiKey.trim();

  if (trimmed) {
    await storage.write(StorageKeys.geminiApiKey, trimmed);
  } else {
    await storage.remove(StorageKeys.geminiApiKey);
  }

  for (const listener of localListeners) listener(trimmed);
}

/** Lets the search bar react to a key saved/cleared in Settings without a
 *  reload — from this tab (via the notification above) or another one (via
 *  `storage`'s native cross-tab event). */
export function subscribeToGeminiApiKey(callback) {
  localListeners.add(callback);
  const unsubscribeStorage = storage.subscribe(StorageKeys.geminiApiKey, (value) => {
    callback(typeof value === 'string' ? value : '');
  });

  return () => {
    localListeners.delete(callback);
    unsubscribeStorage();
  };
}

/** @param {string} apiKey */
export function isGeminiConfigured(apiKey) {
  return Boolean(apiKey?.trim());
}

/**
 * One of 'invalid-key' | 'rate-limited' | 'network'. Lets the hook show a
 * message specific to what actually went wrong instead of one generic
 * failure string.
 */
export class GeminiError extends Error {
  constructor(reason, message) {
    super(message);
    this.name = 'GeminiError';
    this.reason = reason;
  }
}

/**
 * Turns a raw Gemini model identifier into something worth showing next to
 * an answer — e.g. `gemini-2.5-flash` -> "Gemini 2.5 Flash",
 * `gemini-flash-latest` -> "Gemini Flash". Drops a `models/` prefix (present
 * on some response shapes) and a trailing `latest`/numeric build suffix,
 * which is noise rather than something a user benefits from seeing.
 *
 * @param {string} [rawModel] the API's own `modelVersion`, when present
 * @returns {string}
 */
export function formatModelName(rawModel) {
  const name = (rawModel || MODEL).replace(/^models\//, '');

  return name
    .split('-')
    .filter((part) => part !== 'latest' && !/^\d{3,}$/.test(part))
    .map((part) => (part === 'gemini' ? 'Gemini' : /^\d/.test(part) ? part : part[0].toUpperCase() + part.slice(1)))
    .join(' ');
}

/**
 * Asks Gemini a single question and returns its answer.
 *
 * Throws a `GeminiError` on failure (bad/rejected key, free-tier rate limit,
 * network failure, or an unexpected response shape) — unlike
 * `getBackgroundPhoto`, there's no silent fallback that makes sense for a
 * question the user explicitly asked, so the hook calling this is expected
 * to catch it and show `error.message`.
 *
 * @param {string} prompt
 * @param {string} apiKey
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ text: string, model: string }>}
 */
export async function askGemini(prompt, apiKey, { signal } = {}) {
  const trimmedKey = apiKey?.trim();
  if (!trimmedKey) {
    throw new GeminiError('invalid-key', 'No Gemini API key is configured.');
  }

  let response;
  try {
    response = await fetch(`${API_BASE}/${MODEL}:generateContent?key=${trimmedKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error; // let the caller's abort handling see this
    throw new GeminiError('network', 'Could not reach Gemini — check your connection.');
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new GeminiError('rate-limited', 'Gemini free-tier rate limit reached — try again in a bit.');
    }

    // Gemini's error responses are JSON bodies shaped like
    // `{ error: { code, message, status } }` — surfacing that `message`
    // directly is what tells a 404 ("model not found", e.g. a retired
    // model — see this file's header) apart from a genuinely bad key
    // (400/403, "API key not valid" or "permission denied"), rather than
    // both landing on the same guessed-at "check your API key" text.
    const detail = await response
      .json()
      .then((body) => body?.error?.message)
      .catch(() => null);

    throw new GeminiError(
      'invalid-key',
      detail
        ? `Gemini rejected the request: ${detail}`
        : `Gemini rejected the request (${response.status}) — check your API key in Settings.`,
    );
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (typeof text !== 'string' || !text.trim()) {
    throw new GeminiError('network', 'Gemini returned an empty response.');
  }

  return { text: text.trim(), model: formatModelName(data?.modelVersion) };
}
