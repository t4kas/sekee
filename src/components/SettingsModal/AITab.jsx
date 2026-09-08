/**
 * AITab
 * ---------------------------------------------------------------------------
 * Where the user pastes their own free Google Gemini API key to enable
 * "Ask AI" in the search bar. Unlike the other tabs, this key isn't part of
 * `settings`/`onSettingsChange` — it's read and written straight through
 * `geminiService.js`'s getters/setters, because it's stored outside the
 * synced settings blob on purpose (see `storage.js`'s `DeviceLocalKeys`).
 *
 * Always shown, unlike the Files tab's `files.available.length > 0` gate —
 * this tab is how the feature gets configured in the first place, so there's
 * nothing to gate it behind.
 *
 * ACCOUNT COPY: the device-local key above is the one `askGemini` actually
 * uses. Signed-in users can additionally flip on "Save to account", a toggle
 * rather than a button because it represents a standing preference ("keep
 * this key synced") rather than a one-off action: turning it on pushes the
 * current key immediately, and while it's on, edits to the field debounce
 * (800ms, so a fast paste doesn't fire a write per keystroke) into another
 * push. Turning it off removes the account copy. Writes go through
 * `geminiService.js`'s `saveGeminiApiKeyToAccount`/`removeGeminiApiKeyFromAccount`
 * — a separate opt-in path from the synced `settings` blob (see that file's
 * header for why). On mount, if this device has no key of its own but the
 * account does, that copy is pulled down and saved locally too, so the key
 * only needs to be pasted once across devices.
 */

import { useEffect, useRef, useState } from 'react';
import {
  getGeminiApiKey,
  setGeminiApiKey,
  getGeminiApiKeyFromAccount,
  saveGeminiApiKeyToAccount,
  removeGeminiApiKeyFromAccount,
} from '../../services/geminiService.js';
import { TextField } from '../ui/TextField.jsx';
import { Switch } from '../ui/Switch.jsx';
import styles from './SettingsModal.module.css';

const AUTO_SAVE_DELAY_MS = 800;

/**
 * @param {object} props
 * @param {object|null} props.user
 */
export function AITab({ user }) {
  const [apiKey, setApiKeyValue] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSyncEnabled, setIsSyncEnabled] = useState(false);
  const [syncError, setSyncError] = useState(false);

  // Loading a fresh account copy on mount, and toggling the switch on/off,
  // both write through this same effect's debounce below — this ref is
  // what tells that effect "the field's current value already reflects the
  // account, skip the push" instead of firing a redundant write right after
  // either of those already-in-sync moments.
  const skipNextAutoSave = useRef(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const [deviceKey, remoteKey] = await Promise.all([
        getGeminiApiKey(),
        user ? getGeminiApiKeyFromAccount() : Promise.resolve(''),
      ]);
      if (!isMounted) return;

      // Nothing on this device yet, but the account has one — pull it down
      // rather than making the user paste it again on every new device.
      if (!deviceKey && remoteKey) {
        setApiKeyValue(remoteKey);
        setGeminiApiKey(remoteKey);
      } else {
        setApiKeyValue(deviceKey);
      }

      skipNextAutoSave.current = true;
      setIsSyncEnabled(Boolean(remoteKey));
      setIsLoaded(true);
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [user]);

  // Debounced auto-save: while the toggle is on, any change to the key
  // (typing, or the toggle just having been switched on) pushes the latest
  // value to the account after a short pause. Clearing the field while
  // synced turns the toggle back off and removes the account copy, since
  // there's nothing left worth keeping there.
  useEffect(() => {
    if (!isLoaded || !isSyncEnabled) return;

    if (skipNextAutoSave.current) {
      skipNextAutoSave.current = false;
      return;
    }

    const trimmedKey = apiKey.trim();
    const timer = setTimeout(async () => {
      try {
        if (trimmedKey) {
          await saveGeminiApiKeyToAccount(trimmedKey);
        } else {
          await removeGeminiApiKeyFromAccount();
          setIsSyncEnabled(false);
        }
        setSyncError(false);
      } catch (error) {
        console.warn('[AITab] could not sync API key to account', error);
        setSyncError(true);
      }
    }, AUTO_SAVE_DELAY_MS);

    return () => clearTimeout(timer);
    // Deliberately keyed on `apiKey` alone: `isSyncEnabled` toggling is
    // handled directly by `handleSyncToggle` below, which fires its own
    // (undebounced) write — re-running this effect for that same flip would
    // just duplicate it.
  }, [apiKey]);

  function handleChange(value) {
    setApiKeyValue(value);
    setGeminiApiKey(value);
  }

  async function handleSyncToggle(nextEnabled) {
    setIsSyncEnabled(nextEnabled);
    setSyncError(false);

    try {
      if (nextEnabled) {
        const trimmedKey = apiKey.trim();
        if (trimmedKey) await saveGeminiApiKeyToAccount(trimmedKey);
      } else {
        await removeGeminiApiKeyFromAccount();
      }
      // The debounce effect above would otherwise fire again for this same
      // value right after the toggle-driven write above.
      skipNextAutoSave.current = true;
    } catch (error) {
      console.warn('[AITab] could not sync API key to account', error);
      setSyncError(true);
    }
  }

  return (
    <div className={styles.section}>
      <TextField
        label="Gemini API key"
        type="password"
        placeholder="Paste your free API key"
        value={isLoaded ? apiKey : ''}
        onChange={handleChange}
        description="Get a free key at aistudio.google.com/apikey. Stored on this device, and optionally your account below."
      />

      {user && (
        <>
          <Switch isSelected={isSyncEnabled} onChange={handleSyncToggle} isDisabled={!apiKey.trim() && !isSyncEnabled}>
            Save to account
          </Switch>

          {isSyncEnabled && (
            <p className={styles.hint}>Synced to your account, so it carries over on other signed-in devices.</p>
          )}

          {syncError && <p className={styles.hintError}>Could not reach your account — try again in a moment.</p>}
        </>
      )}

      <p className={styles.hint}>
        Once a key is set, a Search / Ask AI toggle appears on the search
        bar. You can also ask a question anytime by typing{' '}
        <code>/ai your question</code>.
      </p>
    </div>
  );
}
