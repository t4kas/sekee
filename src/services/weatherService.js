/**
 * Weather service
 * ---------------------------------------------------------------------------
 * Fetches current conditions for a user-typed location string (e.g.
 * "Boston"). Two Open-Meteo calls back one merged, never-throw entry point:
 *
 *   1. Geocoding  (place name -> coordinates + display name + timezone)
 *   2. Forecast   (coordinates -> current temperature/condition)
 *
 * Open-Meteo needs no API key and allows direct browser calls (CORS-enabled),
 * which is why it was chosen for this — there's no backend to proxy a keyed
 * request through (see CLAUDE.md's "no backend" note), and the app should
 * work for every user without any setup, the same way it runs fine unkeyed
 * for backgrounds (see unsplashService.js) except this needs no key at all.
 *
 * CACHING, two independent caches, mirroring unsplashService's
 * `{ fetchedAt, ... }` shape:
 *   - geocoding results: a place's coordinates don't change, so these are
 *     cached for a week, keyed by the (lowercased, trimmed) typed query.
 *   - forecasts: cached for 15 minutes, keyed by rounded lat/lon, so opening
 *     several tabs in a row doesn't refetch "current conditions" every time
 *     while still staying honest about what "current" means.
 *
 * NEVER THROWS, at the public `getCurrentWeather` boundary: any failure
 * (network, timeout, bad/unknown location, malformed response) resolves to
 * `null`. The one exception is the caller's own `signal` aborting — that
 * rethrows, so `useWeather`'s effect cleanup can tell "the location changed
 * again" apart from "the request truly failed" and ignore it, the same
 * distinction `linkPreviewService.js` makes.
 */

import { storage, StorageKeys } from './storage.js';

const GEOCODE_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

const GEOCODE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
const FORECAST_TTL_MS = 15 * 60 * 1000; // 15 minutes

/** Bounds how long a request can hang before giving up on it. */
const TIMEOUT_MS = 5000;

/** WMO weather codes Open-Meteo returns, bucketed into the small icon set
 *  `WeatherWidget/weatherIcons.jsx` draws. Not every code needs a distinct
 *  icon — day/night variants are deliberately collapsed into one bucket to
 *  keep this an "at a glance" widget, not a full weather app. */
const CONDITIONS_BY_CODE = {
  0: { label: 'Clear sky', icon: 'clear' },
  1: { label: 'Mainly clear', icon: 'clear' },
  2: { label: 'Partly cloudy', icon: 'cloudy' },
  3: { label: 'Overcast', icon: 'overcast' },
  45: { label: 'Fog', icon: 'fog' },
  48: { label: 'Fog', icon: 'fog' },
  51: { label: 'Light drizzle', icon: 'drizzle' },
  53: { label: 'Drizzle', icon: 'drizzle' },
  55: { label: 'Dense drizzle', icon: 'drizzle' },
  56: { label: 'Freezing drizzle', icon: 'drizzle' },
  57: { label: 'Freezing drizzle', icon: 'drizzle' },
  61: { label: 'Light rain', icon: 'rain' },
  63: { label: 'Rain', icon: 'rain' },
  65: { label: 'Heavy rain', icon: 'rain' },
  66: { label: 'Freezing rain', icon: 'rain' },
  67: { label: 'Freezing rain', icon: 'rain' },
  71: { label: 'Light snow', icon: 'snow' },
  73: { label: 'Snow', icon: 'snow' },
  75: { label: 'Heavy snow', icon: 'snow' },
  77: { label: 'Snow grains', icon: 'snow' },
  80: { label: 'Rain showers', icon: 'rain' },
  81: { label: 'Rain showers', icon: 'rain' },
  82: { label: 'Violent rain showers', icon: 'rain' },
  85: { label: 'Snow showers', icon: 'snow' },
  86: { label: 'Snow showers', icon: 'snow' },
  95: { label: 'Thunderstorm', icon: 'thunderstorm' },
  96: { label: 'Thunderstorm with hail', icon: 'thunderstorm' },
  99: { label: 'Thunderstorm with hail', icon: 'thunderstorm' },
};

/** @param {number} weatherCode a WMO weather code from the forecast API
 *  @returns {{ label: string, icon: string }} */
export function getWeatherCondition(weatherCode) {
  return CONDITIONS_BY_CODE[weatherCode] ?? { label: 'Unknown', icon: 'cloudy' };
}

/** @param {number} celsius */
export function celsiusToFahrenheit(celsius) {
  return (celsius * 9) / 5 + 32;
}

function isFresh(entry, ttlMs) {
  return Boolean(entry) && Date.now() - entry.fetchedAt < ttlMs;
}

async function readCache(key) {
  const cache = await storage.read(key);
  return cache && typeof cache === 'object' ? cache : {};
}

/** Combines the caller's own abort signal (if any) with a hard timeout, the
 *  same composition `linkPreviewService.js` uses. */
function requestSignal(signal) {
  const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

function formatLocationName(location) {
  return location.admin1 ? `${location.name}, ${location.admin1}` : location.name;
}

async function fetchGeocode(query, signal) {
  const params = new URLSearchParams({ name: query, count: '1', language: 'en', format: 'json' });
  const response = await fetch(`${GEOCODE_ENDPOINT}?${params}`, { signal: requestSignal(signal) });
  if (!response.ok) throw new Error(`Geocoding responded ${response.status} ${response.statusText}`);

  const data = await response.json();
  const match = data?.results?.[0];
  if (!match) return null; // not an error — the place just wasn't found

  return {
    name: match.name,
    admin1: match.admin1 ?? null,
    latitude: match.latitude,
    longitude: match.longitude,
    timezone: match.timezone ?? 'auto',
  };
}

/**
 * Geocoding requests in flight, keyed by the (already normalised) query.
 *
 * Two things can ask for the same location at nearly the same moment: React
 * StrictMode runs effects twice in development, and both runs miss the cache
 * because neither has written it yet. Sharing one promise means one network
 * request instead of two, same reasoning as `unsplashService.js`'s
 * `inFlightPools`.
 */
const inFlightGeocode = new Map();

function fetchGeocodeOnce(key, signal) {
  if (!inFlightGeocode.has(key)) {
    const request = fetchGeocode(key, signal).finally(() => inFlightGeocode.delete(key));
    inFlightGeocode.set(key, request);
  }
  return inFlightGeocode.get(key);
}

/**
 * Resolves a typed location string to coordinates, using the week-long
 * cache. Never throws except when the caller's own `signal` aborted — any
 * other failure falls back to a stale cache entry if one exists, else
 * `null`.
 */
async function resolveLocation(query, signal) {
  const key = query.trim().toLowerCase();
  const cache = await readCache(StorageKeys.weatherGeocodeCache);
  const entry = cache[key];
  if (isFresh(entry, GEOCODE_TTL_MS)) return entry.result;

  try {
    const result = await fetchGeocodeOnce(key, signal);
    await storage.write(StorageKeys.weatherGeocodeCache, {
      ...cache,
      [key]: { fetchedAt: Date.now(), result },
    });
    return result;
  } catch (error) {
    if (signal?.aborted) throw error;
    console.warn('[weatherService] geocoding failed, falling back:', error.message);
    return entry?.result ?? null;
  }
}

async function fetchForecast(location, signal) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: location.timezone,
    current: 'temperature_2m,weather_code,is_day',
  });
  const response = await fetch(`${FORECAST_ENDPOINT}?${params}`, { signal: requestSignal(signal) });
  if (!response.ok) throw new Error(`Forecast responded ${response.status} ${response.statusText}`);

  const data = await response.json();
  const current = data?.current;
  if (!current) throw new Error('Forecast response is missing current conditions');

  return {
    temperatureC: current.temperature_2m,
    weatherCode: current.weather_code,
    isDay: current.is_day === 1,
  };
}

/** Forecast requests in flight, keyed by the rounded lat/lon — same
 *  StrictMode-double-effect reasoning as `inFlightGeocode` above. */
const inFlightForecast = new Map();

function fetchForecastOnce(key, location, signal) {
  if (!inFlightForecast.has(key)) {
    const request = fetchForecast(location, signal).finally(() => inFlightForecast.delete(key));
    inFlightForecast.set(key, request);
  }
  return inFlightForecast.get(key);
}

/** Resolves coordinates to current conditions, using the 15-minute cache.
 *  Same never-throw-except-caller-abort contract as `resolveLocation`. */
async function resolveForecast(location, signal) {
  // Rounding to 2 decimal places (~1km) means a location re-geocoded to a
  // fractionally different point still hits the same cache entry.
  const key = `${location.latitude.toFixed(2)},${location.longitude.toFixed(2)}`;
  const cache = await readCache(StorageKeys.weatherCache);
  const entry = cache[key];
  if (isFresh(entry, FORECAST_TTL_MS)) return entry.data;

  try {
    const data = await fetchForecastOnce(key, location, signal);
    await storage.write(StorageKeys.weatherCache, { ...cache, [key]: { fetchedAt: Date.now(), data } });
    return data;
  } catch (error) {
    if (signal?.aborted) throw error;
    console.warn('[weatherService] forecast fetch failed, falling back:', error.message);
    return entry?.data ?? null;
  }
}

/**
 * Resolves a typed location string to current conditions.
 *
 * Never throws, except when the caller's own `signal` aborts (see the file
 * header) — a bad/unknown location, a network failure, or a malformed
 * response all resolve to `null` instead.
 *
 * @param {string} locationQuery
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ locationName: string, temperatureC: number, weatherCode: number, isDay: boolean } | null>}
 */
export async function getCurrentWeather(locationQuery, { signal } = {}) {
  const trimmed = (locationQuery ?? '').trim();
  if (!trimmed) return null;

  const location = await resolveLocation(trimmed, signal);
  if (!location) return null;

  const conditions = await resolveForecast(location, signal);
  if (!conditions) return null;

  return { locationName: formatLocationName(location), ...conditions };
}
