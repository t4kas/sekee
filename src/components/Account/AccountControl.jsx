/**
 * AccountControl
 * ---------------------------------------------------------------------------
 * The account entry point in the header, next to `SettingsPopover`. Renders
 * nothing at all when Supabase isn't configured — "unconfigured = the
 * feature simply isn't there" is the same rule `unsplashService.js` follows,
 * just applied to a whole component instead of a fallback image.
 *
 * One avatar-shaped trigger, two different things behind it depending on
 * whether anyone's signed in:
 *
 *   Signed out: pressing it calls `onRequestSignIn` — the actual dialog is
 *   rendered once, at the top of `App.jsx`, since favoriting a background
 *   photo while signed out needs to open that same dialog from a completely
 *   different part of the tree. See `useAuth.js`'s header comment for why
 *   this component doesn't call `useAuth()` itself.
 *
 *   Signed in: pressing it opens a `MenuTrigger` dropdown (email + sign out).
 */

import {
  Button as AriaButton,
  Header,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Separator,
} from 'react-aria-components';
import { UserIcon } from '../ui/icons.jsx';
import { isSupabaseConfigured } from '../../services/supabaseClient.js';
import styles from './AccountControl.module.css';

/** The letter shown in the avatar for a signed-in user. */
function initialFor(email) {
  return email?.charAt(0).toUpperCase() || '?';
}

/**
 * @param {object} props
 * @param {object|null} props.user
 * @param {() => Promise<void>} props.signOut
 * @param {() => void} props.onRequestSignIn  opens the shared AuthDialog
 */
export function AccountControl({ user, signOut, onRequestSignIn }) {
  if (!isSupabaseConfigured) return null;

  if (user) {
    return (
      <MenuTrigger>
        <AriaButton className={styles.avatar} aria-label="Account">
          {initialFor(user.email)}
        </AriaButton>

        <Popover className={styles.popover} placement="bottom end" offset={8}>
          <Menu className={styles.menu} onAction={(key) => key === 'sign-out' && signOut()}>
            <Header className={styles.menuHeader}>
              <span className={styles.menuHeaderLabel}>Signed in as</span>
              <span className={styles.menuHeaderEmail}>{user.email}</span>
            </Header>

            <Separator className={styles.separator} />

            <MenuItem id="sign-out" className={styles.menuItem}>
              Sign out
            </MenuItem>
          </Menu>
        </Popover>
      </MenuTrigger>
    );
  }

  return (
    <AriaButton className={styles.avatar} aria-label="Sign in" onPress={onRequestSignIn}>
      <UserIcon size={18} />
    </AriaButton>
  );
}
