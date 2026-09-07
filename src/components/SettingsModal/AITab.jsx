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
 */

import { useEffect, useState } from 'react';
import { getGeminiApiKey, setGeminiApiKey } from '../../services/geminiService.js';
import { TextField } from '../ui/TextField.jsx';
import styles from './SettingsModal.module.css';

export function AITab() {
  const [apiKey, setApiKeyValue] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    getGeminiApiKey().then((key) => {
      if (isMounted) {
        setApiKeyValue(key);
        setIsLoaded(true);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  function handleChange(value) {
    setApiKeyValue(value);
    setGeminiApiKey(value);
  }

  return (
    <div className={styles.section}>
      <TextField
        label="Gemini API key"
        type="password"
        placeholder="Paste your free API key"
        value={isLoaded ? apiKey : ''}
        onChange={handleChange}
        description="Get a free key at aistudio.google.com/apikey. Stored only on this device — never synced, even when signed in."
      />
      <p className={styles.hint}>
        Once a key is set, a Search / Ask AI toggle appears on the search
        bar. You can also ask a question anytime by typing{' '}
        <code>/ai your question</code>.
      </p>
    </div>
  );
}
