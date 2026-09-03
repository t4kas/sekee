/**
 * PreferencesTab
 * ---------------------------------------------------------------------------
 * General app behaviour that isn't specific to any other tab. Just search
 * engine today — background/favorites moved out to `PersonalisationTab.jsx`.
 */

import { Select } from '../ui/Select.jsx';
import { SEARCH_ENGINES } from '../../services/searchEngines.js';
import styles from './SettingsModal.module.css';

/**
 * @param {object} props
 * @param {{engineId: string}} props.settings
 * @param {(changes: object) => void} props.onSettingsChange
 */
export function PreferencesTab({ settings, onSettingsChange }) {
  return (
    <div className={styles.section}>
      <Select
        label="Search engine"
        items={SEARCH_ENGINES}
        selectedKey={settings.engineId}
        onSelectionChange={(engineId) => onSettingsChange({ engineId })}
      />
    </div>
  );
}
