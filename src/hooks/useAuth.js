/**
 * useAuth
 * ---------------------------------------------------------------------------
 * The only thing components use to read or change sign-in state, and nothing
 * more. Same shape family as `useSettings`/`useBookmarks`.
 *
 * This hook used to ALSO point `storage` at the right adapter and migrate
 * local data into the cloud on sign-in. Both moved to `useSync.js` when
 * bring-your-own-cloud providers arrived: signing into this app's own
 * Supabase project is now one of several places data can live, so "which
 * backend is active" stopped being a question about authentication. Auth
 * decides who you are; `useSync` decides where your data goes.
 *
 * CALL THIS ONCE, IN `App.jsx`, AND PASS THE RESULT DOWN AS PROPS. Every call
 * to this hook runs its own session load and its own `onAuthStateChange`
 * subscription. Early on, `AccountControl` and `AuthDialog` each called it
 * separately, which meant two of everything running concurrently — and back
 * when the migration lived here, two independent migration attempts on every
 * sign-in. Components that need auth state now receive
 * `user`/`signOut`/`signIn`/`signUp` as props from `App.jsx` instead.
 */

import { useCallback, useEffect, useState } from 'react';
import * as authService from '../services/authService.js';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    authService.getSession().then((initialUser) => {
      if (isMounted) {
        setUser(initialUser);
        setIsLoading(false);
      }
    });

    const unsubscribe = authService.onAuthStateChange((nextUser) => {
      if (isMounted) setUser(nextUser);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  /** Wraps a service call so sign-up/in/out share the same error handling:
   *  clear any previous error, run it, let failures bubble to the caller
   *  (the dialog shows them next to the form). */
  const runAuthAction = useCallback(async (action) => {
    setError(null);
    try {
      return await action();
    } catch (actionError) {
      setError(actionError);
      throw actionError;
    }
  }, []);

  const signUp = useCallback(
    (credentials) => runAuthAction(() => authService.signUp(credentials)),
    [runAuthAction],
  );

  const signIn = useCallback(
    (credentials) => runAuthAction(() => authService.signIn(credentials)),
    [runAuthAction],
  );

  const signOut = useCallback(() => runAuthAction(() => authService.signOut()), [runAuthAction]);

  return { user, isLoading, error, signUp, signIn, signOut };
}
