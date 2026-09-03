/**
 * SearchBar
 * ---------------------------------------------------------------------------
 * The centred search field. Submitting navigates the tab to the configured
 * search engine's results page.
 *
 * Why React Aria's `SearchField` rather than a plain <input type="search">:
 * it gives us Escape-to-clear, a properly announced role, and it calls
 * `onSubmit` on Enter without needing a wrapping <form>. That last part
 * matters — a <form> here would fight with the field's own Enter handling.
 *
 * The submit button deliberately sits OUTSIDE the `SearchField`. Inside one,
 * React Aria treats a `Button` as the field's *clear* button, which is not
 * what we want.
 */

import { useState } from 'react';
import { Input, Label, SearchField } from 'react-aria-components';
import { Button } from '../ui/Button.jsx';
import { SearchIcon } from '../ui/icons.jsx';
import { buildSearchUrl, getEngine } from '../../services/searchEngines.js';
import styles from './SearchBar.module.css';

/** @param {{ engineId: string }} props */
export function SearchBar({ engineId }) {
  const [query, setQuery] = useState('');
  const engine = getEngine(engineId);

  /** Sends the query to the chosen engine, replacing this page. */
  function submitSearch() {
    const trimmed = query.trim();
    if (!trimmed) return; // don't navigate on an empty search

    // `assign` rather than `open`: this is a homepage, so searching should
    // navigate this tab rather than spawn a second one.
    window.location.assign(buildSearchUrl(engineId, trimmed));
  }

  return (
    <div className={styles.wrapper}>
      <SearchField
        className={styles.field}
        value={query}
        onChange={setQuery}
        onSubmit={submitSearch}
      >
        {/* Announced to screen readers, invisible on screen — the magnifier
            icon and placeholder already make the purpose obvious visually. */}
        <Label className="visually-hidden">Search the web</Label>

        <SearchIcon size={20} />

        <Input
          className={styles.input}
          placeholder={`Search with ${engine.name}`}
          /* Focused on load so you can start typing the moment a tab opens
             — the whole point of a new-tab page. */
          autoFocus
          /* Browsers try to be helpful with search inputs; for a homepage
             these all get in the way. */
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
        />
      </SearchField>

      <Button variant="primary" onPress={submitSearch} isDisabled={!query.trim()}>
        Search
      </Button>
    </div>
  );
}
