/**
 * Storage adapter
 * ---------------------------------------------------------------------------
 * The single place in the app that knows which backend is actually storing
 * data right now.
 *
 * WHY THIS EXISTS
 * Every function here is `async`, even though localStorage is synchronous.
 * That's on purpose: it means the services built on top of this file already
 * `await` their reads and writes, so swapping in a real backend is a matter
 * of writing a new adapter with the same four methods.
 *
 * THE CONTRACT an adapter must fulfil:
 *   read(key)         -> Promise<any | null>   parsed value, or null if absent
 *   write(key, value) -> Promise<void>         value must be JSON-serialisable
 *   remove(key)       -> Promise<void>
 *   subscribe(key, cb)-> () => void            call cb when the value changes
 *                                              elsewhere; returns an
 *                                              unsubscribe function
 *
 * An adapter that stores data somewhere other than this device also sets
 * `isRemote: true` on itself. That's what `getRemoteAdapter()` below reads,
 * and it's how `favoritesService.js` asks "is there an account behind this
 * right now?" without naming any particular provider.
 *
 * SWITCHING ADAPTERS AT RUNTIME
 * `storage` itself never changes identity — it's a small object that
 * delegates every call to whichever adapter is "active" right now. That's
 * what lets `useAuth.js` call `setActiveAdapter(createSupabaseAdapter(user.id))`
 * on sign-in and `setActiveAdapter(createLocalStorageAdapter())` on sign-out,
 * without `bookmarksService.js`, `settingsService.js`, or any hook ever
 * knowing which one is live. `setActiveAdapter` also re-points every active
 * `subscribe()` listener at the new adapter and immediately re-delivers a
 * fresh read, so `useBookmarks`/`useSettings` (which only load once on
 * mount, then rely on `subscribe` for updates) pick up the new source right
 * away instead of showing stale data until the next edit.
 */

/** Every key we write is prefixed, so we never collide with anything else
 *  stored on the same origin. */
const PREFIX = 'sekee:';

/**
 * Adapter backed by the browser's localStorage.
 *
 * Note the try/catch around every access: localStorage throws in private
 * browsing modes and when the quota is full. A new-tab page should never
 * show the user a crash screen over a failed preference write, so we log
 * and degrade instead.
 */
export function createLocalStorageAdapter() {
  return {
    async read(key) {
      try {
        const raw = window.localStorage.getItem(PREFIX + key);
        // `getItem` returns null for a missing key — distinct from the
        // string "null", which would be a value we genuinely stored.
        return raw === null ? null : JSON.parse(raw);
      } catch (error) {
        console.warn(`[storage] could not read "${key}"`, error);
        return null;
      }
    },

    async write(key, value) {
      try {
        window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
      } catch (error) {
        console.warn(`[storage] could not write "${key}"`, error);
      }
    },

    async remove(key) {
      try {
        window.localStorage.removeItem(PREFIX + key);
      } catch (error) {
        console.warn(`[storage] could not remove "${key}"`, error);
      }
    },

    /**
     * The browser fires a `storage` event in OTHER tabs when localStorage
     * changes — so if you have two copies of this page open, editing a
     * bookmark in one updates the other.
     */
    subscribe(key, callback) {
      const handler = (event) => {
        if (event.key !== PREFIX + key) return;
        try {
          callback(event.newValue === null ? null : JSON.parse(event.newValue));
        } catch (error) {
          console.warn(`[storage] could not parse update for "${key}"`, error);
        }
      };

      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    },
  };
}

/** The adapter currently backing `storage`. Starts on localStorage so the
 *  app works before auth state is even known. */
let activeAdapter = createLocalStorageAdapter();

/** Every live `storage.subscribe()` call, so `setActiveAdapter` can move
 *  them over to the new adapter and re-deliver a fresh read. */
const activeSubscriptions = new Set();

/**
 * Points `storage` at a different adapter — called by `useAuth.js` when
 * auth state changes. Re-subscribes every listener currently registered via
 * `storage.subscribe()` against the new adapter, and immediately re-delivers
 * a fresh `read()` to each of them, so components update right away instead
 * of waiting for their next edit.
 *
 * Returns a promise that resolves once every re-delivered read has reached
 * its callback — `useSync.js` awaits this before telling the rest of the app
 * the switch is complete, so a caller that waits on it never observes a
 * render where the adapter has changed but `useBookmarks`/`useSettings`
 * still hold the outgoing adapter's data.
 *
 * @param {ReturnType<typeof createLocalStorageAdapter>} adapter
 * @returns {Promise<void>}
 */
export function setActiveAdapter(adapter) {
  activeAdapter = adapter;

  const redelivered = [];
  for (const entry of activeSubscriptions) {
    entry.unsubscribeFromAdapter();
    entry.unsubscribeFromAdapter = activeAdapter.subscribe(entry.key, entry.callback);
    redelivered.push(activeAdapter.read(entry.key).then(entry.callback));
  }
  return Promise.all(redelivered).then(() => {});
}

/**
 * The object the rest of the app imports. Its identity never changes — only
 * which adapter it delegates to (see `setActiveAdapter` above).
 */
export const storage = {
  read: (key) => activeAdapter.read(key),
  write: (key, value) => activeAdapter.write(key, value),
  remove: (key) => activeAdapter.remove(key),

  subscribe(key, callback) {
    const entry = { key, callback, unsubscribeFromAdapter: activeAdapter.subscribe(key, callback) };
    activeSubscriptions.add(entry);

    return () => {
      entry.unsubscribeFromAdapter();
      activeSubscriptions.delete(entry);
    };
  },
};

/**
 * Returns the active adapter only when it's a remote one, else `null`.
 *
 * The one supported way to ask "is this app currently backed by an account
 * rather than just this browser?". `favoritesService.js` uses it to keep
 * "signed out means no favorites" true by construction (see its header)
 * without importing any specific provider's adapter.
 */
export function getRemoteAdapter() {
  return activeAdapter.isRemote ? activeAdapter : null;
}

/** Keys we store, gathered in one place so they're easy to audit. */
export const StorageKeys = {
  bookmarks: 'bookmarks',
  bookmarkGroups: 'bookmark-groups',
  settings: 'settings',
  photoCache: 'photo-cache',
  favorites: 'favorites',
  customBackgrounds: 'custom-backgrounds',
  weatherGeocodeCache: 'weather-geocode-cache',
  weatherCache: 'weather-cache',
  geminiApiKey: 'gemini-api-key',
  // A user-triggered COPY of the key above, not a sync target: written only
  // when the user presses "Save to account" in AITab, read only through
  // `getRemoteAdapter()` directly (see `geminiService.js`'s
  // `saveGeminiApiKeyToAccount`/`getGeminiApiKeyFromAccount`) rather than
  // through `storage`. Keeping it out of `DeviceLocalKeys` is what lets it
  // reach `user_data`; keeping it out of the synced `settings` blob is what
  // keeps a plaintext credential from riding along with every ordinary
  // preference change.
  geminiApiKeyRemote: 'gemini-api-key-remote',
};

/**
 * Keys that stay on this device even when a remote adapter is active.
 *
 * The three caches carry their own TTLs and are rebuilt from a network call
 * whenever they're missing — carrying them between devices buys nothing and
 * costs a write to somebody's cloud storage every time a 15-minute forecast
 * expires. The weather ones matter most for the bring-your-own-cloud
 * providers, where every write is an API request against a much tighter
 * quota than Postgres's, but there's no reason to sync them anywhere.
 *
 * `geminiApiKey` is here for a different reason: it's a credential, not a
 * cache, and `settingsService.js`'s synced `settings` blob is exactly what
 * gets replicated to Postgres when signed in — a Gemini key has no business
 * sitting in that blob in plaintext. Same posture as the Dropbox refresh
 * token in `dropboxClient.js`: it stays wherever the browser that owns it is.
 *
 * Every remote adapter passes these straight through to a private
 * localStorage adapter instead of writing them to its backend.
 */
export const DeviceLocalKeys = new Set([
  StorageKeys.photoCache,
  StorageKeys.weatherGeocodeCache,
  StorageKeys.weatherCache,
  StorageKeys.geminiApiKey,
]);
