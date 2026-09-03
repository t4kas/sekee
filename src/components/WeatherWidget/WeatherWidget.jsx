/**
 * WeatherWidget
 * ---------------------------------------------------------------------------
 * Current conditions for the location set in Settings, shown as a single
 * glass pill above the search bar — a sibling of `SearchBar`'s `.bar`, not a
 * card. Deliberately minimal: temperature, condition, and place name, no
 * forecast.
 *
 * Renders nothing at all while `weatherLocation` is unset, so an install
 * that hasn't configured it looks exactly like the app did before this
 * widget existed — no placeholder, no nag.
 */

import { useWeather } from '../../hooks/useWeather.js';
import { celsiusToFahrenheit, getWeatherCondition } from '../../services/weatherService.js';
import { WEATHER_ICONS } from './weatherIcons.jsx';
import styles from './WeatherWidget.module.css';

/** @param {{ location: string, units: 'celsius' | 'fahrenheit' }} props */
export function WeatherWidget({ location, units }) {
  const { weather, status } = useWeather(location);

  if (status === 'idle') return null;

  if (status === 'loading') {
    return (
      <div className={styles.pill} data-state="loading">
        Loading weather…
      </div>
    );
  }

  if (status === 'error' || !weather) {
    return (
      <div className={styles.pill} data-state="error">
        Couldn't find weather for "{location.trim()}"
      </div>
    );
  }

  const condition = getWeatherCondition(weather.weatherCode);
  const Icon = WEATHER_ICONS[condition.icon];
  const temperature = Math.round(
    units === 'fahrenheit' ? celsiusToFahrenheit(weather.temperatureC) : weather.temperatureC,
  );
  const unitLabel = units === 'fahrenheit' ? '°F' : '°C';

  return (
    <div className={styles.pill} data-state="ready">
      <Icon size={22} className={styles.icon} />
      <span className={styles.temperature}>
        {temperature}
        {unitLabel}
      </span>
      <span className={styles.divider} aria-hidden="true">
        ·
      </span>
      <span className={styles.condition}>{condition.label}</span>
      <span className={styles.location}>{weather.locationName}</span>
    </div>
  );
}
