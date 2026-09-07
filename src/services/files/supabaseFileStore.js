/**
 * Supabase Storage file store
 * ---------------------------------------------------------------------------
 * Implements the same contract as `dropboxFileStore.js` — see its header for
 * the method list — backed by a Supabase Storage bucket.
 *
 * THIS IS THE STORE FOR ANYTHING OTHER PEOPLE SEE. It's the only one of the
 * three that can produce a permanent, publicly fetchable URL, so an avatar
 * shown next to a name belongs here and nowhere else. A URL from Dropbox
 * expires in hours; one from Drive is a `blob:` handle that only exists
 * inside the tab that made it. Neither can be handed to someone else's
 * browser.
 *
 * PATHS ARE NAMESPACED BY USER: `<userId>/<name>`. That isn't cosmetic — the
 * Row Level Security policies in README.md key off the first path segment, so
 * a file stored outside the signed-in user's own prefix is rejected by
 * Postgres rather than by this code. Callers pass a bare name; the user id is
 * prepended here so there's one place that can get it wrong.
 *
 * The bucket is PUBLIC for reads, which is what makes `getViewUrl` a plain
 * CDN link with no signing round-trip. Writes are not public — RLS still
 * requires the file to be in the writer's own prefix. Don't put anything
 * private in here: a public bucket means anyone with the URL can fetch it.
 * Private things belong in the user's own storage (the personal store).
 */

import { supabase, isSupabaseConfigured } from '../supabaseClient.js';

/** Created by the SQL in README.md's storage section. */
const BUCKET = 'user-files';

function toFileRef(entry, path) {
  return {
    path,
    name: entry.name,
    size: entry.metadata?.size ?? 0,
    modifiedAt: entry.updated_at ? Date.parse(entry.updated_at) : null,
  };
}

/**
 * @param {string} userId the signed-in user — every path is scoped to it
 */
export function createSupabaseFileStore(userId) {
  if (!isSupabaseConfigured) throw new Error('File storage isn’t configured for this app.');
  if (!userId) throw new Error('Sign in to store files.');

  const bucket = supabase.storage.from(BUCKET);
  const scoped = (path) => `${userId}/${path.replace(/^\/+/, '')}`;

  return {
    id: 'supabase',
    /** Permanent public URLs — safe to persist. */
    hasStableUrls: true,

    async upload(path, blob, { contentType } = {}) {
      const { error } = await bucket.upload(scoped(path), blob, {
        contentType: contentType || blob.type || 'application/octet-stream',
        // Callers expect "write this file", not "fail if it exists" — an
        // avatar being replaced is the normal case, not an error.
        upsert: true,
      });
      if (error) throw error;

      return { path, name: path.split('/').at(-1), size: blob.size, modifiedAt: Date.now() };
    },

    async download(path) {
      const { data, error } = await bucket.download(scoped(path));
      // A missing object is "absent", per the contract — not a failure.
      if (error) return null;
      return data;
    },

    async getViewUrl(path) {
      return bucket.getPublicUrl(scoped(path)).data.publicUrl ?? null;
    },

    /** Ordinary URLs — nothing to release. */
    releaseViewUrl() {},

    async remove(path) {
      const { error } = await bucket.remove([scoped(path)]);
      if (error) throw error;
    },

    async list(prefix = '') {
      const { data, error } = await bucket.list(scoped(prefix).replace(/\/$/, ''));
      if (error) throw error;

      const base = prefix ? `${prefix.replace(/\/$/, '')}/` : '';
      return (data ?? [])
        // Supabase lists "folders" as entries with no id; only files have one.
        .filter((entry) => entry.id)
        .map((entry) => toFileRef(entry, `${base}${entry.name}`));
    },
  };
}
