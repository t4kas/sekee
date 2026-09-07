/**
 * SyncTab
 * ---------------------------------------------------------------------------
 * Surfaces what already happens implicitly (see `useSync.js`): signed in,
 * bookmarks, groups and settings read and write through your account; signed
 * out, they stay on this device.
 *
 * Connecting Google Drive or Dropbox does NOT belong here — those are file
 * stores for images and attachments, and live on their own tab. Keeping the
 * two apart is deliberate: "where my bookmarks sync" and "where my files go"
 * are separate questions, and one picker offering both would imply they trade
 * off against each other.
 *
 * There's no live sync — changes made on another device show up on the next
 * load, or when "Sync now" re-runs each hook's load effect. It calls the
 * `refresh()` this tab is handed rather than talking to Supabase directly.
 *
 * The "What syncs" card at the bottom is a React Aria `Disclosure` —
 * collapsed by default so it doesn't compete with the status above,
 * expandable for anyone who wants the specifics. Shown whether signed in or
 * out, since it's also useful as a preview of what signing in would do.
 */

import { useState } from 'react';
import { Button as AriaButton, Disclosure, DisclosurePanel, Heading } from 'react-aria-components';
import { Button } from '../ui/Button.jsx';
import {
  BookmarkIcon,
  ChevronDownIcon,
  CloudIcon,
  HeartIcon,
  RefreshIcon,
  SlidersIcon,
} from '../ui/icons.jsx';
import styles from './SettingsModal.module.css';

/**
 * @param {object} props
 * @param {object} props.sync the `useSync` result — see App.jsx
 * @param {() => void} props.refreshBookmarks
 * @param {() => void} props.refreshSettings
 */
export function SyncTab({ sync, refreshBookmarks, refreshSettings }) {
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
        {sync.isSignedIn ? 'Synced to your account.' : 'Stored on this device only.'}
      </p>

      {/* A failed write-behind flush. The edit is safe on this device and
          will be retried, and saying so is better than a silent divergence
          between what's on screen and what's in the cloud. */}
      {sync.syncError && (
        <p className={styles.hintError}>
          Couldn’t reach your account — changes are saved on this device and will be sent again.
        </p>
      )}

      {sync.isSignedIn && (
        <Button className={styles.fullWidthButton} onPress={handleSyncNow} isDisabled={isSyncing}>
          <RefreshIcon size={16} />
          {isSyncing ? 'Syncing…' : 'Sync now'}
        </Button>
      )}

      {sync.isSignedIn && lastSyncedAt && (
        <p className={styles.hint}>Last synced {lastSyncedAt.toLocaleTimeString()}.</p>
      )}

      <Disclosure className={styles.card}>
        <Heading className={styles.cardHeading}>
          <AriaButton slot="trigger" className={styles.cardTrigger}>
            What syncs
            <ChevronDownIcon size={16} className={styles.cardChevron} />
          </AriaButton>
        </Heading>
        <DisclosurePanel className={styles.cardPanel}>
          <p>Signed in, these are read from and written to your account instead of just this device:</p>
          <div className={styles.cardItemList}>
            <p className={styles.cardItem}>
              <BookmarkIcon size={16} />
              Bookmarks and groups
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
          <p>
            Cached backgrounds and weather stay on this device — they expire on their own, so
            there’s nothing worth carrying between devices.
          </p>
        </DisclosurePanel>
      </Disclosure>
    </div>
  );
}
