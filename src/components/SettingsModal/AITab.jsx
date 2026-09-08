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
 * uses. Signed-in users can additionally push a copy to their account with
 * "Save to account" — a separate opt-in write via
 * `geminiService.js`'s `saveGeminiApiKeyToAccount` (see that file's header
 * for why this is deliberately not the same path as the synced `settings`
 * blob). On mount, if this device has no key of its own but the account
 * does, that account copy is pulled down and saved locally too, so the key
 * only needs to be pasted once across devices.
 */

import { useEffect, useState } from 'react';
import {
  getGeminiApiKey,
  setGeminiApiKey,
  getGeminiApiKeyFromAccount,
  saveGeminiApiKeyToAccount,
  removeGeminiApiKeyFromAccount,
} from '../../services/geminiService.js';
import { TextField } from '../ui/TextField.jsx';
import { Button } from '../ui/Button.jsx';
import styles from './SettingsModal.module.css';

/**
 * @param {object} props
 * @param {object|null} props.user
 */
export function AITab({ user }) {
  const [apiKey, setApiKeyValue] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  // The key currently saved to the account, or '' if none/signed out —
  // drives whether the button reads "Save"/"Update"/"Saved" and whether
  // "Remove from account" is shown at all.
  const [accountKey, setAccountKey] = useState('');
  const [saveState, setSaveState] = useState('idle'); // idle | saving | error

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

      setAccountKey(remoteKey);
      setIsLoaded(true);
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [user]);

  function handleChange(value) {
    setApiKeyValue(value);
    setGeminiApiKey(value);
    setSaveState('idle');
  }

  async function handleSaveToAccount() {
    setSaveState('saving');
    try {
      await saveGeminiApiKeyToAccount(apiKey);
      setAccountKey(apiKey.trim());
      setSaveState('idle');
    } catch (error) {
      console.warn('[AITab] could not save API key to account', error);
      setSaveState('error');
    }
  }

  async function handleRemoveFromAccount() {
    setSaveState('saving');
    try {
      await removeGeminiApiKeyFromAccount();
      setAccountKey('');
      setSaveState('idle');
    } catch (error) {
      console.warn('[AITab] could not remove API key from account', error);
      setSaveState('error');
    }
  }

  const trimmedKey = apiKey.trim();
  const isSavedToAccount = isLoaded && trimmedKey.length > 0 && trimmedKey === accountKey;

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
          <Button
            className={styles.fullWidthButton}
            onPress={handleSaveToAccount}
            isDisabled={!trimmedKey || isSavedToAccount || saveState === 'saving'}
          >
            {isSavedToAccount ? 'Saved to account' : 'Save to account'}
          </Button>

          {accountKey && (
            <p className={styles.hint}>
              Synced to your account, so it carries over on other signed-in devices.{' '}
              <Button variant="ghost" onPress={handleRemoveFromAccount} isDisabled={saveState === 'saving'}>
                Remove from account
              </Button>
            </p>
          )}

          {saveState === 'error' && (
            <p className={styles.hintError}>Could not reach your account — try again in a moment.</p>
          )}
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
