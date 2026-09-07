/**
 * File storage service
 * ---------------------------------------------------------------------------
 * The one place features ask for a file store, and the one place that decides
 * which of the two it gets. Everything above this line works in terms of a
 * SCOPE, not a provider.
 *
 * THE TWO SCOPES, and why the split exists at all:
 *
 *   'shared'    Supabase Storage. For anything another person's browser has
 *               to fetch — avatars above all. It's the only store that can
 *               produce a permanent public URL, so it's the only correct
 *               answer for that job. Costs count against your Supabase quota.
 *
 *   'personal'  The user's own linked Dropbox or Google Drive. For their own
 *               files: wallpapers, attachments, anything they'd want to still
 *               have if this app disappeared. Costs nothing at any scale,
 *               because it's their storage and their quota.
 *
 * Picking by scope rather than by provider is what keeps a feature from
 * accidentally putting an avatar somewhere it can never be served from. If
 * you find yourself wanting to override the routing at a call site, the
 * question to answer first is "who needs to fetch this?" — that's the whole
 * decision.
 *
 * URL LIFETIME IS NOT UNIFORM, and callers do have to care. `getViewUrl`
 * returns a permanent CDN link from the shared store, a link that expires in
 * hours from Dropbox, and a tab-lifetime `blob:` handle from Drive. Two rules
 * follow, and `store.hasStableUrls` is how you check:
 *   - Never persist a URL from the personal store. Persist the PATH and
 *     resolve it again when you need it.
 *   - Always pass a URL back to `releaseViewUrl` when you're done with it.
 *     It's a no-op for the stores that don't need it, which is exactly why
 *     callers can do it unconditionally.
 *
 * The personal store is registered by `useFileProvider.js` when a provider is
 * linked, the same way `setActiveAdapter` registers the storage adapter — so
 * services stay unaware of React and of which provider won.
 */

import { createSupabaseFileStore } from './files/supabaseFileStore.js';

export const FileScopes = {
  /** Fetchable by other people. Supabase Storage. */
  shared: 'shared',
  /** The user's own cloud storage. */
  personal: 'personal',
};

/** Set by `useFileProvider` on link/unlink; null when nothing is linked. */
let personalStore = null;

/** @param {object|null} store a file store, or null to clear */
export function setPersonalStore(store) {
  personalStore = store;
}

/** @returns {object|null} the linked store, or null if the user has none. */
export function getPersonalStore() {
  return personalStore;
}

/**
 * @param {string} userId the signed-in user
 * @returns {object} the shared store. Throws if signed out — a shared file
 *   has to belong to somebody, and there's no anonymous prefix to put it in.
 */
export function getSharedStore(userId) {
  return createSupabaseFileStore(userId);
}

/**
 * Resolves a scope to a store.
 *
 * @param {'shared' | 'personal'} scope
 * @param {object} [options]
 * @param {string} [options.userId] required for `shared`
 * @returns {object} a file store
 */
export function getStore(scope, { userId } = {}) {
  if (scope === FileScopes.shared) return getSharedStore(userId);

  if (scope === FileScopes.personal) {
    if (!personalStore) {
      throw new Error('Connect Google Drive or Dropbox in Settings → Files to store this.');
    }
    return personalStore;
  }

  throw new Error(`Unknown file scope "${scope}".`);
}
