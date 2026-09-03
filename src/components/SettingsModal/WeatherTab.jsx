/**
 * WeatherTab
 * ---------------------------------------------------------------------------
 * The two controls `WeatherWidget` reads, relocated from the old
 * `SettingsPopover.jsx` unchanged.
 */

import { Select } from '../ui/Select.jsx';
import { TextField } from '../ui/TextField.jsx';
import styles from './SettingsModal.module.css';

const WEATHER_UNITS = [
  { id: 'celsius', name: 'Celsius (°C)' },
  { id: 'fahrenheit', name: 'Fahrenheit (°F)' },
];

/**
 * @param {object} props
 * @param {{weatherLocation: string, weatherUnits: string}} props.settings
 * @param {(changes: object) => void} props.onSettingsChange
 */
export function WeatherTab({ settings, onSettingsChange }) {
  return (
    <div className={styles.section}>
      <TextField
        label="Weather location"
        placeholder="e.g. Boston"
        value={settings.weatherLocation}
        onChange={(weatherLocation) => onSettingsChange({ weatherLocation })}
      />

      <Select
        label="Temperature units"
        items={WEATHER_UNITS}
        selectedKey={settings.weatherUnits}
        onSelectionChange={(weatherUnits) => onSettingsChange({ weatherUnits })}
      />
    </div>
  );
}
