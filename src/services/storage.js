/**
 * Storage adapter
 * ---------------------------------------------------------------------------
 * The single place in the app that knows about `localStorage`.
 *
 * WHY THIS EXISTS
 * Every function here is `async`, even though localStorage is synchronous.
 * That's on purpose: it means the services built on top of this file already
 * `await` their reads and writes, so swapping in a real backend later (e.g.
 * Supabase) is a matter of writing a new adapter with the same four methods
 * and changing the one line at the bottom of this file. No component or hook
 * has to change.
 *
 * THE CONTRACT an adapter must fulfil:
 *   read(key)         -> Promise<any | null>   parsed value, or null if absent
 *   write(key, value) -> Promise<void>         value must be JSON-serialisable
 *   remove(key)       -> Promise<void>
 *   subscribe(key, cb)-> () => void            call cb when the value changes
 *                                              in ANOTHER tab; returns an
 *                                              unsubscribe function
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
     * bookmark in one updates the other. A Supabase adapter would implement
     * this with a realtime subscription instead.
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

/**
 * The adapter the rest of the app uses.
 *
 * TO MOVE TO A BACKEND: write `createSupabaseAdapter()` in its own file with
 * the same four methods, then change this one line.
 */
export const storage = createLocalStorageAdapter();

/** Keys we store, gathered in one place so they're easy to audit. */
export const StorageKeys = {
  bookmarks: 'bookmarks',
  settings: 'settings',
  photoCache: 'photo-cache',
};
