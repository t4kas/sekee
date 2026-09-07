/**
 * SyncTab
 * ---------------------------------------------------------------------------
 * Where the user picks a destination for their data, and the one place the
 * choice `useSync` makes is actually visible.
 *
 * THE PICKER IS AN OVERRIDE, NOT A LIST OF EQUALS, because that's what
 * `useSync`'s precedence really is: connecting your own cloud storage wins
 * over everything, and with nothing connected you fall through to your
 * account if you have one and to this device if you don't. So the first
 * option is that fallback — labelled for whichever it currently resolves to —
 * and the rest are the bring-your-own-cloud providers. Choosing the first one
 * disconnects; choosing a provider connects. Nothing is offered that isn't
 * configured, so an app built without a Dropbox key never mentions Dropbox.
 *
 * A `Select` rather than a list of rows with their own Connect buttons: it
 * keeps this to one control with one meaning, and it avoids putting an
 * interactive element inside a collection row, which React Aria makes
 * fiddlier than it looks (see CLAUDE.md).
 *
 * There's still no live sync — changes made on another device show up on the
 * next load, or when "Sync now" re-runs each hook's load effect. It calls the
 * `refresh()` this tab is handed rather than talking to any provider itself.
 *
 * The "What syncs" card at the bottom is a React Aria `Disclosure` —
 * collapsed by default so it doesn't compete with the picker above,
 * expandable for anyone who wants the specifics. Shown whatever the
 * destination, since it's also useful as a preview of what connecting would
 * do.
 */

import { useState } from 'react';
import { Button as AriaButton, Disclosure, DisclosurePanel, Heading } from 'react-aria-components';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';
import {
  BookmarkIcon,
  ChevronDownIcon,
  CloudIcon,
  HeartIcon,
  RefreshIcon,
  SlidersIcon,
} from '../ui/icons.jsx';
import { byoProviders } from '../../services/syncService.js';
import styles from './SettingsModal.module.css';

/**
 * @param {object} props
 * @param {object|null} props.user
 * @param {object} props.sync the `useSync` result — see App.jsx
 * @param {() => void} props.refreshBookmarks
 * @param {() => void} props.refreshSettings
 */
export function SyncTab({ user, sync, refreshBookmarks, refreshSettings }) {
  const [isSyncing, setIsSyncing] = useState(false);
  // Not persisted — this is "since you opened this tab," not a durable
  // record, so it resets to nothing the next time Settings is opened.
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const available = byoProviders.filter((provider) => provider.isConfigured);
  const isByo = sync.providerId !== 'local' && sync.providerId !== 'supabase';
  const connected = available.find((provider) => provider.id === sync.providerId);

  const items = [
    { id: 'default', name: user ? 'Your account' : 'This device only' },
    ...available.map((provider) => ({ id: provider.id, name: provider.label })),
  ];

  async function handleDestinationChange(nextId) {
    try {
      if (nextId === 'default') await sync.disconnect();
      else await sync.connect(nextId);
      // Whatever was on screen came from the old destination.
      refreshBookmarks();
      refreshSettings();
    } catch {
      // `useSync` already put this in `sync.error`, which is rendered below;
      // catching here just stops a cancelled popup logging as an unhandled
      // rejection.
    }
  }

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

  function statusText() {
    if (isByo) {
      const where = connected?.label ?? 'your cloud storage';
      return sync.accountLabel ? `Synced to ${where} (${sync.accountLabel}).` : `Synced to ${where}.`;
    }
    if (sync.providerId === 'supabase') return 'Synced to your account.';
    return 'Stored on this device only.';
  }

  return (
    <div className={styles.section}>
      {/* Only worth a picker when there's more than one destination to pick.
          Without any provider keys configured this is the app as it was. */}
      {available.length > 0 && (
        <Select
          label="Where your data is stored"
          items={items}
          selectedKey={isByo ? sync.providerId : 'default'}
          onSelectionChange={handleDestinationChange}
        />
      )}

      <p className={styles.statusRow}>
        <CloudIcon size={16} />
        {sync.isConnecting ? 'Connecting…' : statusText()}
      </p>

      {sync.error && <p className={styles.hintError}>{sync.error.message}</p>}

      {/* A failed write-behind flush. The edit is safe on this device and
          will be retried, and saying so is better than a silent divergence
          between what's on screen and what's in the cloud. */}
      {sync.syncError && (
        <p className={styles.hintError}>
          Couldn’t reach your storage — changes are saved on this device and will be sent again.
        </p>
      )}

      {sync.providerId !== 'local' && (
        <Button className={styles.fullWidthButton} onPress={handleSyncNow} isDisabled={isSyncing}>
          <RefreshIcon size={16} />
          {isSyncing ? 'Syncing…' : 'Sync now'}
        </Button>
      )}

      {sync.providerId !== 'local' && lastSyncedAt && (
        <p className={styles.hint}>Last synced {lastSyncedAt.toLocaleTimeString()}.</p>
      )}

      {isByo && (
        <p className={styles.hint}>
          Your data lives in your own {connected?.label ?? 'cloud storage'} account, in a folder
          only this app can use. Removing the app from that account removes the folder with it.
        </p>
      )}

      <Disclosure className={styles.card}>
        <Heading className={styles.cardHeading}>
          <AriaButton slot="trigger" className={styles.cardTrigger}>
            What syncs
            <ChevronDownIcon size={16} className={styles.cardChevron} />
          </AriaButton>
        </Heading>
        <DisclosurePanel className={styles.cardPanel}>
          <p>
            With a destination connected, these are read from and written to it instead of just
            this device:
          </p>
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
