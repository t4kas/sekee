/**
 * AITab
 * ---------------------------------------------------------------------------
 * Where the user pastes their own free Google Gemini API key to enable
 * "Ask AI" in the search bar. Unlike the other tabs, this key isn't part of
 * `settings`/`onSettingsChange` — it's read and written straight through
 * `geminiService.js`'s local getters/setters, because it's stored outside
 * the synced settings blob by default (see `storage.js`'s `DeviceLocalKeys`).
 *
 * The "Save in my account" switch is the opt-in exception: `syncAiApiKey`
 * itself is a normal, non-sensitive synced setting (just a boolean), but
 * flipping it drives `geminiService.js`'s separate `pullSyncedApiKey`/
 * `setSyncedApiKey` — see that file's header for why the two paths are kept
 * apart rather than merged into one.
 *
 * Always shown, unlike the Files tab's `files.available.length > 0` gate —
 * this tab is how the feature gets configured in the first place, so there's
 * nothing to gate it behind.
 */

import { useEffect, useState } from 'react';
import {
  getGeminiApiKey,
  pullSyncedApiKey,
  setGeminiApiKey,
  setSyncedApiKey,
} from '../../services/geminiService.js';
import { TextField } from '../ui/TextField.jsx';
import { Switch } from '../ui/Switch.jsx';
import styles from './SettingsModal.module.css';

/**
 * @param {object} props
 * @param {object|null} props.user
 * @param {{ syncAiApiKey: boolean }} props.settings
 * @param {(changes: object) => void} props.onSettingsChange
 */
export function AITab({ user, settings, onSettingsChange }) {
  const [apiKey, setApiKeyValue] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      // Only meaningful when signed in with the setting already on — e.g. a
      // second device, or after clearing this one's site data — and it's a
      // genuine no-op otherwise (see `pullSyncedApiKey`'s own guards).
      if (user && settings.syncAiApiKey) await pullSyncedApiKey();

      const key = await getGeminiApiKey();
      if (isMounted) {
        setApiKeyValue(key);
        setIsLoaded(true);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
    // Deliberately only on mount/sign-in-change, not every `settings` change
    // — this is the one-time "pick up a key saved elsewhere" check, not a
    // live subscription (the field below already reacts to local edits).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function handleChange(value) {
    setApiKeyValue(value);
    setGeminiApiKey(value);
    if (settings.syncAiApiKey) setSyncedApiKey(value);
  }

  function handleSyncToggle(syncAiApiKey) {
    onSettingsChange({ syncAiApiKey });
    // Push (or scrub) the account copy right away rather than waiting for
    // the next edit — flipping the switch is itself the action a user
    // expects to take effect immediately, on or off.
    setSyncedApiKey(syncAiApiKey ? apiKey : '');
  }

  return (
    <div className={styles.section}>
      <TextField
        label="Gemini API key"
        type="password"
        placeholder="Paste your free API key"
        value={isLoaded ? apiKey : ''}
        onChange={handleChange}
        description="Get a free key at aistudio.google.com/apikey."
      />

      <Switch
        label="Save in my account"
        description={
          user
            ? 'Also stores the key in your account (plaintext) so it carries over to your other signed-in devices. Off by default.'
            : 'Sign in to save the key to your account instead of just this device.'
        }
        isSelected={Boolean(user) && settings.syncAiApiKey}
        onChange={handleSyncToggle}
        isDisabled={!user}
      />

      <p className={styles.hint}>
        Once a key is set, a Search / Ask AI toggle appears on the search
        bar. You can also ask a question anytime by typing{' '}
        <code>/ai your question</code>.
      </p>
    </div>
  );
}
