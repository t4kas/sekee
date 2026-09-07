/**
 * Supabase storage adapter
 * ---------------------------------------------------------------------------
 * The signed-in counterpart to `createLocalStorageAdapter` in `storage.js` —
 * same four-method contract, backed by one Postgres table instead of
 * `localStorage`.
 *
 * TABLE SHAPE: `user_data` has one row per `(user_id, key)` pair, with a
 * `value jsonb` column holding the whole blob for that key — the entire
 * bookmarks array, or the entire settings object. That's a deliberate match
 * for the adapter's own shape (one blob per key) rather than a normalised
 * `bookmarks` table with one row per bookmark: it's what lets
 * `bookmarksService.js`/`settingsService.js` stay completely unaware of
 * which adapter is live. See README.md for the table + Row Level Security
 * setup.
 *
 * SYNC MODEL: `subscribe` is a no-op here — changes made on another
 * device/tab show up the next time this app loads, not live. That's a
 * deliberate scope cut (no Realtime channels to open, track and clean up)
 * for what's meant to stay a small, personal app.
 *
 * ERROR HANDLING: `read`/`remove` degrade like the localStorage adapter does
 * (log a warning, return a harmless default) — a transient network blip
 * shouldn't crash the new-tab page. `write` is different: it lets errors
 * propagate, because `useBookmarks`'s `runMutation` already catches and
 * displays them next to the form, and silently losing a save would be worse
 * than showing an error.
 *
 * WHAT DOESN'T SYNC: `DeviceLocalKeys` (see `storage.js`) — the Unsplash
 * photo pool and the two weather caches. They're caches with their own TTLs,
 * not user data worth carrying between devices, so this adapter passes them
 * straight through to a plain localStorage adapter and signing in never
 * touches them.
 */

import { supabase } from './supabaseClient.js';
import { createLocalStorageAdapter, DeviceLocalKeys } from './storage.js';

const TABLE = 'user_data';

/** @param {string} userId */
export function createSupabaseAdapter(userId) {
  const localOnly = createLocalStorageAdapter();

  return {
    /** Marks this as an account-backed adapter — see `getRemoteAdapter()`. */
    isRemote: true,

    async read(key) {
      if (DeviceLocalKeys.has(key)) return localOnly.read(key);
      try {
        const { data, error } = await supabase
          .from(TABLE)
          .select('value')
          .eq('user_id', userId)
          .eq('key', key)
          .maybeSingle();

        if (error) throw error;
        return data?.value ?? null;
      } catch (error) {
        console.warn(`[supabaseAdapter] could not read "${key}"`, error);
        return null;
      }
    },

    async write(key, value) {
      if (DeviceLocalKeys.has(key)) return localOnly.write(key, value);

      const { error } = await supabase
        .from(TABLE)
        .upsert({ user_id: userId, key, value, updated_at: new Date().toISOString() });

      if (error) throw error;
    },

    async remove(key) {
      if (DeviceLocalKeys.has(key)) return localOnly.remove(key);

      try {
        const { error } = await supabase.from(TABLE).delete().eq('user_id', userId).eq('key', key);
        if (error) throw error;
      } catch (error) {
        console.warn(`[supabaseAdapter] could not remove "${key}"`, error);
      }
    },

    /** No-op for synced keys: see the "sync model" note above. Device-local
     *  keys still use localStorage's own cross-tab `storage` event. */
    subscribe(key, callback) {
      if (DeviceLocalKeys.has(key)) return localOnly.subscribe(key, callback);
      return () => {};
    },
  };
}
