/**
 * SearchBar
 * ---------------------------------------------------------------------------
 * The centred search field. Submitting navigates the tab to the configured
 * search engine's results page.
 *
 * Left to right: the current engine's logo, the input, and a magnifier button
 * that submits.
 *
 * Why React Aria's `SearchField` rather than a plain <input type="search">:
 * it gives us Escape-to-clear, a properly announced role, and it calls
 * `onSubmit` on Enter without needing a wrapping <form>. That last part
 * matters — a <form> here would fight with the field's own Enter handling.
 *
 * IMPORTANT STRUCTURAL DETAIL: the submit button is a SIBLING of
 * `SearchField`, not a child of it. React Aria treats a `Button` placed
 * inside a `SearchField` as that field's *clear* button, so nesting it would
 * wipe the query instead of searching. The pill you see is the wrapping
 * `.bar` div; the SearchField itself is just the input in the middle.
 */

import { useState } from 'react';
import { Button, Input, Label, SearchField } from 'react-aria-components';
import { EngineLogo } from './EngineLogo.jsx';
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
    <div className={styles.bar}>
      <span className={styles.logo}>
        <EngineLogo engine={engine} size={18} />
      </span>

      <SearchField
        className={styles.field}
        value={query}
        onChange={setQuery}
        onSubmit={submitSearch}
      >
        {/* Announced to screen readers, invisible on screen — the logo and
            placeholder already make the purpose obvious visually. */}
        <Label className="visually-hidden">Search the web</Label>

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

      {/* React Aria's own Button rather than our styled wrapper, so this
          file owns the styling outright — mixing the two would leave two
          equal-specificity rules fighting over the size and shape. */}
      <Button
        className={styles.submit}
        onPress={submitSearch}
        isDisabled={!query.trim()}
        aria-label={`Search with ${engine.name}`}
      >
        <SearchIcon size={19} />
      </Button>
    </div>
  );
}
