/**
 * SyncTab
 * ---------------------------------------------------------------------------
 * Surfaces what already happens implicitly (see `useAuth.js`): signed in,
 * every read/write goes through Supabase instead of localStorage; signed
 * out, it's localStorage as always. There's no live sync — changes made on
 * another device only show up here on the next load, which is why "Sync
 * now" exists: a way to pull those changes down without reloading the whole
 * tab. It calls the `refresh()` this tab is handed, which just re-runs each
 * hook's normal load effect (see `useBookmarks.js`/`useSettings.js`) — the
 * button doesn't talk to Supabase directly.
 *
 * The "What syncs" card at the bottom is a React Aria `Disclosure` —
 * collapsed by default so it doesn't compete with the status/button above,
 * expandable for anyone who wants the specifics. Shown whether signed in or
 * out, since it's also useful as a preview of what signing in would do.
 */

import { useState } from 'react';
import { Button as AriaButton, Disclosure, DisclosurePanel, Heading } from 'react-aria-components';
import { Button } from '../ui/Button.jsx';
import { BookmarkIcon, ChevronDownIcon, CloudIcon, HeartIcon, RefreshIcon, SlidersIcon } from '../ui/icons.jsx';
import styles from './SettingsModal.module.css';

/**
 * @param {object} props
 * @param {object|null} props.user
 * @param {() => void} props.refreshBookmarks
 * @param {() => void} props.refreshSettings
 */
export function SyncTab({ user, refreshBookmarks, refreshSettings }) {
  const [isSyncing, setIsSyncing] = useState(false);
  // Not persisted — this is "since you opened this tab," not a durable
  // record, so it resets to nothing the next time Settings is opened.
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  async function handleSyncNow() {
    setIsSyncing(true);
    try {
      // Both hooks' `refresh()` just bump a counter and return immediately
      // (the actual re-fetch happens in their own effects), so this
      // `Promise.all` is mostly for symmetry — but await anyway in case
      // either becomes a real async call later.
      await Promise.all([refreshBookmarks(), refreshSettings()]);
      setLastSyncedAt(new Date());
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className={styles.section}>
      <p className={styles.statusRow}>
        <CloudIcon size={16} />
        {user ? 'Synced to your account.' : 'Stored on this device only.'}
      </p>

      {user && (
        <Button className={styles.fullWidthButton} onPress={handleSyncNow} isDisabled={isSyncing}>
          <RefreshIcon size={16} />
          {isSyncing ? 'Syncing…' : 'Sync now'}
        </Button>
      )}

      {user && lastSyncedAt && <p className={styles.hint}>Last synced {lastSyncedAt.toLocaleTimeString()}.</p>}

      <Disclosure className={styles.card}>
        <Heading className={styles.cardHeading}>
          <AriaButton slot="trigger" className={styles.cardTrigger}>
            What syncs to your account
            <ChevronDownIcon size={16} className={styles.cardChevron} />
          </AriaButton>
        </Heading>
        <DisclosurePanel className={styles.cardPanel}>
          <p>
            Signed in, these are read from and written to your account instead of just this
            device:
          </p>
          <div className={styles.cardItemList}>
            <p className={styles.cardItem}>
              <BookmarkIcon size={16} />
              Bookmarks
            </p>
            <p className={styles.cardItem}>
              <SlidersIcon size={16} />
              Settings — search engine, background choice, weather location and units
            </p>
            <p className={styles.cardItem}>
              <HeartIcon size={16} />
              Favorited photos
            </p>
          </div>
        </DisclosurePanel>
      </Disclosure>
    </div>
  );
}
