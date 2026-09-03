/**
 * Auth service
 * ---------------------------------------------------------------------------
 * Thin wrapper around Supabase's auth calls. Every function checks
 * `isSupabaseConfigured` first and throws a message the UI can show directly
 * if it isn't — the account button shouldn't even render when unconfigured
 * (see `AccountControl.jsx`), but these guards keep this file safe to call
 * on its own too.
 *
 * UNLIKE `unsplashService.js`, these functions THROW on failure rather than
 * degrading silently. A background photo failing over to a gradient is
 * invisible and fine; a sign-in failing silently would just look broken. So
 * errors here are meant to be caught by the calling form and shown next to
 * the field, the same way `bookmarksService.normaliseUrl` throws for
 * `BookmarkDialog` to catch.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient.js';

function assertConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error('Accounts aren’t configured for this app yet.');
  }
}

/**
 * @param {{ email: string, password: string }} credentials
 * @returns {Promise<{ user: object|null, needsEmailConfirmation: boolean }>}
 */
export async function signUp({ email, password }) {
  assertConfigured();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // Without this, Supabase falls back to the project's dashboard-wide
    // "Site URL" setting (which defaults to localhost:3000) for the link in
    // the confirmation email — wrong for every visitor except whoever set
    // up the project. Using the origin actually being signed up from
    // instead makes the confirmation link correct on localhost during dev,
    // on the production domain, and on any preview URL, with nothing to
    // keep in sync in the dashboard. It still needs to be added to
    // Authentication -> URL Configuration -> Redirect URLs in the Supabase
    // dashboard (see README.md), or Supabase rejects it as untrusted.
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;

  // Supabase returns a user with no session when email confirmation is
  // required — that's how we tell the form to show "check your email"
  // instead of treating this as a completed sign-in.
  return { user: data.user, needsEmailConfirmation: !data.session };
}

/**
 * @param {{ email: string, password: string }} credentials
 * @returns {Promise<object>} the signed-in user
 */
export async function signIn({ email, password }) {
  assertConfigured();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signOut() {
  assertConfigured();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** @returns {Promise<object|null>} the current user, or null if signed out. */
export async function getSession() {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

/**
 * Calls `callback(user)` whenever auth state changes (sign-in, sign-out,
 * token refresh). `user` is null when signed out.
 * @param {(user: object|null) => void} callback
 * @returns {() => void} unsubscribe
 */
export function onAuthStateChange(callback) {
  if (!isSupabaseConfigured) return () => {};

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });

  return () => data.subscription.unsubscribe();
}
