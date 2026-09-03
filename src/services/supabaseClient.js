/**
 * Supabase client
 * ---------------------------------------------------------------------------
 * The only file that knows Supabase's URL and anon key. Everything else that
 * needs to talk to Supabase (auth, the sync adapter) imports `supabase` from
 * here, and checks `isSupabaseConfigured` first — same "optional `VITE_...`
 * key, degrade if unset" pattern `unsplashService.js` uses for its API key.
 *
 * The anon key is safe to ship in the client bundle by design: it identifies
 * the project, not a privileged user. What actually protects each user's
 * rows is Postgres Row Level Security on the `user_data` table (see
 * README.md for the setup SQL) — the anon key alone grants no access beyond
 * what those policies allow.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '';

/** True when both env vars are set, i.e. accounts/sync are available at all. */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** `null` when unconfigured, so a caller that forgets to check
 *  `isSupabaseConfigured` fails loudly instead of silently hitting a
 *  made-up project. */
export const supabase = isSupabaseConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
