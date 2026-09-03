/**
 * AccountTab
 * ---------------------------------------------------------------------------
 * A consolidated view of the same sign-in state `AccountControl` (the header
 * avatar button) already shows in its dropdown — this tab doesn't duplicate
 * that logic, just presents it inline instead of in a menu. Signing in here
 * opens the same shared `AuthDialog`, nested on top of the Settings modal
 * (see `SettingsModal.jsx`).
 */

import { Button } from '../ui/Button.jsx';
import { isSupabaseConfigured } from '../../services/supabaseClient.js';
import styles from './SettingsModal.module.css';

/**
 * @param {object} props
 * @param {object|null} props.user
 * @param {() => Promise<void>} props.signOut
 * @param {() => void} props.onRequestSignIn
 */
export function AccountTab({ user, signOut, onRequestSignIn }) {
  if (user) {
    return (
      <div className={styles.section}>
        <p className={styles.statusRow}>Signed in as {user.email}</p>
        <Button variant="ghost" onPress={signOut}>
          Sign out
        </Button>
      </div>
    );
  }

  // Matches `AccountControl.jsx`'s own rule: the sign-in button shouldn't
  // even render when there's nothing behind it to sign in to.
  if (!isSupabaseConfigured) {
    return (
      <div className={styles.section}>
        <p className={styles.hint}>
          Accounts aren’t configured for this app yet — see the README for how to add a Supabase
          project. Everything works fine without one, stored only on this device.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <p className={styles.hint}>
        Sign in to sync your bookmarks and settings across devices — everything works fine
        without an account too, stored only on this one.
      </p>
      <Button variant="primary" onPress={onRequestSignIn}>
        Sign in
      </Button>
    </div>
  );
}
