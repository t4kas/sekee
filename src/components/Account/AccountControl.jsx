/**
 * AccountControl
 * ---------------------------------------------------------------------------
 * The account entry point in the header, next to `SettingsPopover`. Renders
 * nothing at all when Supabase isn't configured — "unconfigured = the
 * feature simply isn't there" is the same rule `unsplashService.js` follows,
 * just applied to a whole component instead of a fallback image.
 *
 * Signed out: an icon button that opens `AuthDialog`. Signed in: the user's
 * email plus a sign-out button — no popover needed, this is deliberately the
 * smallest UI that fits.
 */

import { useState } from 'react';
import { Button as AriaButton, Tooltip, TooltipTrigger } from 'react-aria-components';
import { LogOutIcon, UserIcon } from '../ui/icons.jsx';
import { isSupabaseConfigured } from '../../services/supabaseClient.js';
import { useAuth } from '../../hooks/useAuth.js';
import { AuthDialog } from './AuthDialog.jsx';
import styles from './AccountControl.module.css';

export function AccountControl() {
  const { user, signOut } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  if (!isSupabaseConfigured) return null;

  if (user) {
    return (
      <div className={styles.signedIn}>
        <span className={styles.email}>{user.email}</span>

        <TooltipTrigger delay={600} closeDelay={100}>
          <AriaButton className={styles.trigger} aria-label="Sign out" onPress={signOut}>
            <LogOutIcon size={18} />
          </AriaButton>
          <Tooltip className={styles.tooltip} placement="bottom" offset={8}>
            Sign out
          </Tooltip>
        </TooltipTrigger>
      </div>
    );
  }

  return (
    <>
      <TooltipTrigger delay={600} closeDelay={100}>
        <AriaButton className={styles.trigger} aria-label="Sign in" onPress={() => setIsDialogOpen(true)}>
          <UserIcon size={18} />
        </AriaButton>
        <Tooltip className={styles.tooltip} placement="bottom" offset={8}>
          Sign in
        </Tooltip>
      </TooltipTrigger>

      <AuthDialog isOpen={isDialogOpen} onClose={() => setIsDialogOpen(false)} />
    </>
  );
}
