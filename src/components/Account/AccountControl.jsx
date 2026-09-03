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
 *   Signed out: pressing it opens `AuthDialog` — there's nothing to show a
 *   menu of yet, so it's a plain button with its own `isOpen` state, same as
 *   `BookmarkGrid`'s "add" tile opening `BookmarkDialog`.
 *
 *   Signed in: pressing it opens a `MenuTrigger` dropdown (email + sign out).
 *   These are two different `AriaButton`s sharing the `styles.avatar` look,
 *   not one button whose behaviour is conditional — that's what lets each
 *   just use the React Aria piece built for what it does, rather than one
 *   component juggling both a dialog's and a menu's open state at once.
 */

import { useState } from 'react';
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
import { useAuth } from '../../hooks/useAuth.js';
import { AuthDialog } from './AuthDialog.jsx';
import styles from './AccountControl.module.css';

/** The letter shown in the avatar for a signed-in user. */
function initialFor(email) {
  return email?.charAt(0).toUpperCase() || '?';
}

export function AccountControl() {
  const { user, signOut } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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
    <>
      <AriaButton className={styles.avatar} aria-label="Sign in" onPress={() => setIsDialogOpen(true)}>
        <UserIcon size={18} />
      </AriaButton>

      <AuthDialog isOpen={isDialogOpen} onClose={() => setIsDialogOpen(false)} />
    </>
  );
}
