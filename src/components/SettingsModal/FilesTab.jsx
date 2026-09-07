/**
 * FilesTab
 * ---------------------------------------------------------------------------
 * Links the user's own cloud storage — Google Drive or Dropbox — for images
 * and attachments.
 *
 * SEPARATE FROM THE SYNC TAB ON PURPOSE. "Where do my bookmarks sync" and
 * "where do my files go" are different questions with different answers, and
 * one control offering both would suggest they trade off against each other.
 * They don't: you can be signed in with no storage linked, or link storage
 * without an account.
 *
 * The picker is a `Select` rather than a row per provider with its own
 * Connect button — one control with one meaning, and it keeps interactive
 * elements out of collection rows, which React Aria makes fiddlier than it
 * looks (see CLAUDE.md).
 *
 * WHEN THE BUILD HAS NO PROVIDER KEYS, this says so rather than disappearing.
 * The tab used to hide itself in that case, on the theory that an app which
 * can't reach any storage shouldn't mention it. That was wrong in the way
 * that matters: `VITE_*` keys are inlined at BUILD time, so a deployment
 * built without them looks exactly like a build where the feature doesn't
 * exist, with nothing anywhere to tell the two apart. A settings screen's job
 * is to say what the state is, and "not configured" is a state.
 */

import { Button as AriaButton, Disclosure, DisclosurePanel, Heading } from 'react-aria-components';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';
import { ChevronDownIcon, FolderIcon } from '../ui/icons.jsx';
import styles from './SettingsModal.module.css';

/**
 * @param {object} props
 * @param {object} props.files the `useFileProvider` result — see App.jsx
 */
export function FilesTab({ files }) {
  const connected = files.available.find((provider) => provider.id === files.providerId);
  const isConfigured = files.available.length > 0;

  const items = [
    { id: 'none', name: 'Not connected' },
    ...files.available.map((provider) => ({ id: provider.id, name: provider.label })),
  ];

  async function handleChange(nextId) {
    try {
      if (nextId === 'none') await files.disconnect();
      else await files.connect(nextId);
    } catch {
      // `useFileProvider` already put this in `files.error`, which is rendered
      // below; catching here only stops a cancelled popup logging as an
      // unhandled rejection.
    }
  }

  return (
    <div className={styles.section}>
      {/* A picker whose only option is "Not connected" is worse than none, so
          the unconfigured build gets the explanation below instead. */}
      {isConfigured && (
        <Select
          label="Store my files in"
          items={items}
          selectedKey={files.providerId ?? 'none'}
          onSelectionChange={handleChange}
        />
      )}

      <p className={styles.statusRow}>
        <FolderIcon size={16} />
        {!isConfigured
          ? 'No storage providers are set up for this build.'
          : files.isConnecting
            ? 'Connecting…'
            : connected
              ? `Connected to ${connected.label}${files.accountLabel ? ` (${files.accountLabel})` : ''}.`
              : 'No storage connected.'}
      </p>

      {/* Aimed at whoever deployed this, which for a self-hosted new-tab page
          is usually the person reading it. Phrased as configuration rather
          than an error, since nothing is broken. */}
      {!isConfigured && (
        <p className={styles.hint}>
          Google Drive and Dropbox each need a key set before they can be
          offered — <code>VITE_GOOGLE_CLIENT_ID</code> and{' '}
          <code>VITE_DROPBOX_APP_KEY</code>. They’re read when the app is built, so a
          deployment needs them set wherever it builds, not just in a local{' '}
          <code>.env.local</code>. See <code>.env.example</code> for how to get them.
        </p>
      )}

      {files.error && <p className={styles.hintError}>{files.error.message}</p>}

      {connected && (
        <p className={styles.hint}>
          Files go in a folder in your own {connected.label} account, under your own storage
          quota. Removing this app from that account removes the folder with it.
        </p>
      )}

      {files.available.length > 0 && !connected && (
        <Button className={styles.fullWidthButton} onPress={() => handleChange(files.available[0].id)}>
          Connect {files.available[0].label}
        </Button>
      )}

      <Disclosure className={styles.card}>
        <Heading className={styles.cardHeading}>
          <AriaButton slot="trigger" className={styles.cardTrigger}>
            What this is for
            <ChevronDownIcon size={16} className={styles.cardChevron} />
          </AriaButton>
        </Heading>
        <DisclosurePanel className={styles.cardPanel}>
          <p>
            Connecting storage gives the app somewhere to keep images and attachments that
            belong to you — in your own account, on your own quota, and still there if you stop
            using this app.
          </p>
          <p>
            It doesn’t change where your bookmarks and settings go. Those sync to your account
            when you’re signed in, and stay on this device otherwise — see the Sync tab.
          </p>
        </DisclosurePanel>
      </Disclosure>
    </div>
  );
}
