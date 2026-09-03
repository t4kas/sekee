/**
 * SearchBar
 * ---------------------------------------------------------------------------
 * The centred search field. Submitting navigates the tab to the configured
 * search engine's results page. Engines with `suggest: true` (currently just
 * Google) also get a live autofill dropdown while typing, modelled on
 * Google's own search box.
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
 *
 * AUTOFILL, TWO PIECES OF STATE: `typedQuery` is what the user actually
 * typed — it's what suggestions are fetched for, and what Escape or arrowing
 * past either end of the list restores. `displayValue` is what the field
 * shows, which is `typedQuery` most of the time but becomes a suggestion's
 * text while that suggestion is arrow-key-highlighted, so Enter can submit it
 * without any special-casing — it's just whatever the field currently shows,
 * exactly like Google's own box.
 */

import { useEffect, useId, useState } from 'react';
import { Button, Input, Label, SearchField } from 'react-aria-components';
import { EngineLogo } from './EngineLogo.jsx';
import { SearchIcon } from '../ui/icons.jsx';
import { buildSearchUrl, getEngine } from '../../services/searchEngines.js';
import { useSearchSuggestions } from '../../hooks/useSearchSuggestions.js';
import styles from './SearchBar.module.css';

/** @param {{ engineId: string }} props */
export function SearchBar({ engineId }) {
  const [typedQuery, setTypedQuery] = useState('');
  const [displayValue, setDisplayValue] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);

  const engine = getEngine(engineId);
  const suggestions = useSearchSuggestions(engineId, typedQuery);
  const listboxId = useId();

  // A fresh batch of suggestions opens the dropdown (or closes it, if the
  // batch is empty) and drops any highlight left over from the last batch.
  useEffect(() => {
    setIsOpen(suggestions.length > 0);
    setHighlightedIndex(-1);
  }, [suggestions]);

  /** Sends a query to the chosen engine, replacing this page. */
  function submitSearch(value) {
    const trimmed = value.trim();
    if (!trimmed) return; // don't navigate on an empty search

    // `assign` rather than `open`: this is a homepage, so searching should
    // navigate this tab rather than spawn a second one.
    window.location.assign(buildSearchUrl(engineId, trimmed));
  }

  function handleChange(value) {
    setTypedQuery(value);
    setDisplayValue(value);
    setHighlightedIndex(-1);
  }

  /** Moves the highlight and fills the field with that suggestion's text
   *  (`-1` means "no highlight", i.e. back to what was actually typed). */
  function highlight(index) {
    setHighlightedIndex(index);
    setDisplayValue(index === -1 ? typedQuery : suggestions[index]);
  }

  function selectSuggestion(suggestion) {
    setIsOpen(false);
    submitSearch(suggestion);
  }

  /**
   * Arrow-key navigation and the dropdown's own Escape handling, wired up as
   * a CAPTURE-phase listener so it runs before `SearchField`'s own Enter/
   * Escape shortcuts (those are attached as an ordinary bubble-phase
   * `onKeyDown`). That matters for Escape: `stopPropagation` here stops the
   * event before it reaches the field's built-in handler, so the first
   * Escape just closes the dropdown instead of also clearing the field —
   * without it, both would fire on the same keypress. A second Escape, with
   * the dropdown already closed, falls through and clears the field as
   * normal.
   */
  function handleInputKeyDownCapture(event) {
    if (!isOpen || suggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      highlight(highlightedIndex < suggestions.length - 1 ? highlightedIndex + 1 : -1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      highlight(highlightedIndex <= -1 ? suggestions.length - 1 : highlightedIndex - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
      setDisplayValue(typedQuery);
      setHighlightedIndex(-1);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.bar}>
        <span className={styles.logo}>
          <EngineLogo engine={engine} size={18} />
        </span>

        <SearchField
          className={styles.field}
          value={displayValue}
          onChange={handleChange}
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
            onKeyDownCapture={handleInputKeyDownCapture}
            onBlur={() => setIsOpen(false)}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-activedescendant={
              highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined
            }
          />
        </SearchField>

        {/* React Aria's own Button rather than our styled wrapper, so this
            file owns the styling outright — mixing the two would leave two
            equal-specificity rules fighting over the size and shape. */}
        <Button
          className={styles.submit}
          onPress={() => submitSearch(displayValue)}
          isDisabled={!displayValue.trim()}
          aria-label={`Search with ${engine.name}`}
        >
          <SearchIcon size={19} />
        </Button>
      </div>

      {isOpen && (
        <ul className={styles.suggestions} id={listboxId} role="listbox">
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === highlightedIndex}
              className={styles.suggestion}
              data-highlighted={index === highlightedIndex || undefined}
              // Stops the input from ever losing focus to this click, so
              // there's no blur race with `onClick` selecting the suggestion.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => highlight(index)}
              onClick={() => selectSuggestion(suggestion)}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
