/**
 * WeatherWidget
 * ---------------------------------------------------------------------------
 * Current conditions for the location set in Settings, shown as a single
 * glass pill above the search bar — a sibling of `SearchBar`'s `.bar`, not a
 * card. Clicking it expands into a wider card with today's high/low and the
 * hourly temperature for the surrounding 6 hours each way, then collapses
 * back to the plain pill on a second click.
 *
 * Renders nothing at all while `weatherLocation` is unset, so an install
 * that hasn't configured it looks exactly like the app did before this
 * widget existed — no placeholder, no nag. The loading/error states are
 * likewise never expandable — there's nothing to show — so only the "ready"
 * pill is a real `<button>`.
 *
 * PILL -> CARD SHAPE CHANGE: `.widget`'s `grid-template-rows` goes from
 * `auto 0fr` to `auto 1fr` on expand, the same CSS-only accordion trick
 * `SearchBar`'s suggestions dropdown uses — no JS height measurement needed.
 * Its border-radius softens from a full pill to a rounded rect at the same
 * time, matching how `SearchBar`'s own `.frame` morphs when its dropdown
 * opens, for the same reason: a tall rectangle looks wrong fully pill-shaped.
 */

import { useState } from 'react';
import { useWeather } from '../../hooks/useWeather.js';
import { celsiusToFahrenheit, formatHourLabel, getWeatherCondition } from '../../services/weatherService.js';
import { ChevronDownIcon } from '../ui/icons.jsx';
import { WEATHER_ICONS } from './weatherIcons.jsx';
import styles from './WeatherWidget.module.css';

/** @param {{ location: string, units: 'celsius' | 'fahrenheit' }} props */
export function WeatherWidget({ location, units }) {
  const { weather, status } = useWeather(location);
  const [isExpanded, setIsExpanded] = useState(false);

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

  const condition = getWeatherCondition(weather.weatherCode, weather.isDay);
  const Icon = WEATHER_ICONS[condition.icon];
  const toDisplay = (celsius) =>
    Math.round(units === 'fahrenheit' ? celsiusToFahrenheit(celsius) : celsius);
  const unitLabel = units === 'fahrenheit' ? '°F' : '°C';

  return (
    <div className={styles.widget} data-expanded={isExpanded || undefined}>
      <button
        type="button"
        className={`${styles.pill} ${styles.pillButton}`}
        data-state="ready"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((expanded) => !expanded)}
      >
        <Icon size={22} className={styles.icon} />
        <span className={styles.temperature}>
          {toDisplay(weather.temperatureC)}
          {unitLabel}
        </span>
        <span className={styles.divider} aria-hidden="true">
          ·
        </span>
        <span className={styles.condition}>{condition.label}</span>
        <span className={styles.location}>{weather.locationName}</span>
        <ChevronDownIcon size={16} className={styles.chevron} />
      </button>

      {/* Always rendered (even with nothing to show) so `.widget`'s grid
          track has something to animate between 0fr and 1fr — see
          SearchBar.jsx's `.suggestionsRow` for the same reasoning. */}
      <div className={styles.detailsRow}>
        <div className={styles.details}>
          {weather.daily && (
            <div className={styles.daySummary}>
              <span className={styles.dayLabel}>Today</span>
              <span className={styles.dayRange}>
                H: {toDisplay(weather.daily.maxC)}
                {unitLabel} · L: {toDisplay(weather.daily.minC)}
                {unitLabel}
              </span>
            </div>
          )}

          {weather.hourly.past.length > 0 && (
            <HourlyRow label="Past 6 hours" entries={weather.hourly.past} toDisplay={toDisplay} />
          )}

          {weather.hourly.next.length > 0 && (
            <HourlyRow label="Next 6 hours" entries={weather.hourly.next} toDisplay={toDisplay} />
          )}
        </div>
      </div>
    </div>
  );
}

/** One row of the expanded card: a label plus up to 6 hour chips.
 *  @param {{ label: string, entries: {time: string, temperatureC: number, weatherCode: number, isDay: boolean}[], toDisplay: (c: number) => number }} props */
function HourlyRow({ label, entries, toDisplay }) {
  return (
    <div className={styles.hourlySection}>
      <span className={styles.hourlyLabel}>{label}</span>
      <div className={styles.hourlyList}>
        {entries.map((entry) => {
          const condition = getWeatherCondition(entry.weatherCode, entry.isDay);
          const HourIcon = WEATHER_ICONS[condition.icon];
          return (
            <div key={entry.time} className={styles.hourlyItem}>
              <span className={styles.hourlyTime}>{formatHourLabel(entry.time)}</span>
              <HourIcon size={20} className={styles.hourlyIcon} />
              <span className={styles.hourlyTemp}>{toDisplay(entry.temperatureC)}°</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
