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
 *
 * URL SUGGESTIONS RENDER AS CARDS: a suggestion that's itself a URL (Google
 * suggests bare domains like "github.com" navigationally, not just search
 * queries) renders as a small favicon/title/description card instead of a
 * line of text — see `LinkSuggestion` below. `submitSearch` detects the same
 * thing for whatever's actually submitted, so picking or typing a URL
 * navigates straight to it instead of searching for the literal string.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, Input, Label, SearchField } from 'react-aria-components';
import { EngineLogo } from './EngineLogo.jsx';
import { SearchIcon } from '../ui/icons.jsx';
import SearchGlow from '../ui/SearchGlow.jsx';
import { buildSearchUrl, getEngine } from '../../services/searchEngines.js';
import { tryNormaliseUrl } from '../../services/bookmarksService.js';
import { getFaviconUrl } from '../../services/favicons.js';
import { useSearchSuggestions } from '../../hooks/useSearchSuggestions.js';
import { useLinkPreview } from '../../hooks/useLinkPreview.js';
import { useReorderFlip } from '../../hooks/useReorderFlip.js';
import styles from './SearchBar.module.css';

// This app's accent (tokens.css's `--accent: #7cc0ff`) plus two related
// blues, so `SearchGlow`'s ring reads as *this app's* color rather than an
// arbitrary rainbow.
const GLOW_COLORS = ['#7cc0ff', '#93c5fd', '#38bdf8'];

/**
 * Moves a suggestion that the query has become word-for-word to the front of
 * the list. Google returns its own ordering and doesn't necessarily lead with
 * the exact match — typing all of "defrag racing" can still leave "defrag
 * racing" fifth, below four rows the query no longer really resembles.
 *
 * The reorder is derived per render rather than folded into the stored batch,
 * which is what makes it feel immediate: suggestions are debounced, so the
 * batch on screen when you finish a word is the one fetched for its
 * second-to-last keystroke. Promoting on the *typed* text instead means the
 * row rises the moment the word is complete, and the batch that arrives
 * ~150ms later simply confirms it rather than moving anything again.
 *
 * Returns the original array when there's nothing to do, so an unchanged list
 * stays referentially stable.
 */
function promoteExactMatch(suggestions, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return suggestions;

  const match = suggestions.findIndex((suggestion) => suggestion.toLowerCase() === needle);
  if (match <= 0) return suggestions; // absent, or already leading

  return [
    suggestions[match],
    ...suggestions.slice(0, match),
    ...suggestions.slice(match + 1),
  ];
}

/** @param {{ engineId: string }} props */
export function SearchBar({ engineId }) {
  const [typedQuery, setTypedQuery] = useState('');
  const [displayValue, setDisplayValue] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  // Drives SearchGlow's `focusActive` — the glow only ever shows while the
  // search bar is actually focused, never on a plain unfocused hover.
  const [isFocused, setIsFocused] = useState(false);
  // What's actually on screen. This lags one step behind the hook's own
  // `suggestions` on the way *down* to empty: clearing the field zeroes
  // `suggestions` the instant the debounce fires, but if the dropdown
  // followed it immediately the list would vanish blank before the closing
  // animation even started. Keeping the last non-empty batch rendered here
  // gives the CSS something to fade and blur away while `.frame` collapses
  // around it, so emptying the field reads as one smooth motion back to the
  // starting state rather than a pop followed by an empty shrink.
  const [renderedSuggestions, setRenderedSuggestions] = useState([]);

  const engine = getEngine(engineId);
  const suggestions = useSearchSuggestions(engineId, typedQuery);
  const listboxId = useId();

  // What the dropdown actually shows, and the order everything else works in
  // — the highlight index and arrow keys included, so they always mean the
  // row you can see rather than the position Google happened to return it in.
  const orderedSuggestions = useMemo(
    () => promoteExactMatch(renderedSuggestions, typedQuery),
    [renderedSuggestions, typedQuery],
  );

  // Slides rows that changed places, which is what turns the promotion above
  // into something you can follow rather than a list that has silently
  // rearranged itself between frames. `promoteExactMatch` hands back the very
  // same array when it changes nothing, so this reference check is also the
  // answer to "is a row currently promoted, and which one" — the hook narrows
  // that to the render where it actually reaches the top before running the
  // cascade the rest of the list does around it.
  const listRef = useRef(null);
  const promotedSuggestion =
    orderedSuggestions === renderedSuggestions ? null : orderedSuggestions[0];
  useReorderFlip(listRef, { emergeFrom: promotedSuggestion });

  // A fresh batch of suggestions opens the dropdown (or closes it, if the
  // batch is empty) and drops any highlight left over from the last batch.
  useEffect(() => {
    setIsOpen(suggestions.length > 0);
    setHighlightedIndex(-1);
    if (suggestions.length > 0) setRenderedSuggestions(suggestions);
  }, [suggestions]);

  /** Sends a query to the chosen engine — or, if `value` is itself a URL,
   *  navigates straight to it, the same way a browser's address bar treats
   *  a typed domain differently from a typed search term. Replaces this
   *  page either way. */
  function submitSearch(value) {
    const trimmed = value.trim();
    if (!trimmed) return; // don't navigate on an empty search

    const url = tryNormaliseUrl(trimmed);

    // `assign` rather than `open`: this is a homepage, so searching should
    // navigate this tab rather than spawn a second one.
    window.location.assign(url ?? buildSearchUrl(engineId, trimmed));
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
    setDisplayValue(index === -1 ? typedQuery : orderedSuggestions[index]);
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
    if (!isOpen || orderedSuggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      highlight(highlightedIndex < orderedSuggestions.length - 1 ? highlightedIndex + 1 : -1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      highlight(highlightedIndex <= -1 ? orderedSuggestions.length - 1 : highlightedIndex - 1);
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
      {/* `SearchGlow` (ui/SearchGlow.jsx) draws a thin ring around `.frame`
          — the box that hugs the pill and, once suggestions are open, the
          dropdown too — which lights up near the pointer while `isFocused`.
          See that file's header for why it's a bespoke SVG component rather
          than the vendored CSS one it started as, and why it takes no shape
          props: it reads `.frame`'s own size and corner radii, so the ring
          keeps hugging it through the open/close transition rather than
          needing to be told the shape twice. */}
      <SearchGlow className={styles.glowWrap} focusActive={isFocused} colors={GLOW_COLORS}>
        {/* Faint focus frame around the pill and, once it grows to include the
            dropdown row below, around the suggestions too. Sizing comes from
            normal layout (no JS measurement) — `data-open` just switches the
            suggestions row's grid track between 0fr and 1fr, which animates
            smoothly without knowing the list's height up front. */}
        <div className={styles.frame} data-open={isOpen || undefined}>
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
                onFocus={() => setIsFocused(true)}
                onBlur={() => {
                  setIsOpen(false);
                  setIsFocused(false);
                }}
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

          {/* Always mounted — both so `.frame`'s grid track has something to
              animate between 0fr and 1fr, and so a suggestion that persists
              across an update keeps its DOM node (see the key below) instead
              of being torn down and popped back onto screen. */}
          <div className={styles.suggestionsRow}>
            <ul className={styles.suggestions} id={listboxId} role="listbox" ref={listRef}>
              {orderedSuggestions.map((suggestion, index) => {
                const url = tryNormaliseUrl(suggestion);

                return (
                  <li
                    // Keyed on the suggestion's own text rather than its batch
                    // or index. A word that carries over between two fetches
                    // (typing "hel" -> "hell" often keeps "hello" in both
                    // lists) then keeps the same DOM node and just slides to
                    // its new position instead of being torn down and
                    // re-blurred-in — that's what makes consecutive batches
                    // read as one smooth update rather than a hard cut. Only
                    // genuinely new suggestions mount fresh and play the
                    // entrance animation. `data-flip-key` is the same value
                    // again, for `useReorderFlip` above: React needs it to
                    // keep the node, the hook needs it to recognise the node
                    // it kept.
                    key={suggestion}
                    data-flip-key={suggestion}
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={index === highlightedIndex}
                    className={styles.suggestion}
                    // Loosens the plain row's single-line truncation so a
                    // multi-line card can lay out its title and description.
                    data-variant={url ? 'link' : undefined}
                    style={{ animationDelay: `${index * 20}ms` }}
                    data-highlighted={index === highlightedIndex || undefined}
                    // Stops the input from ever losing focus to this click, so
                    // there's no blur race with `onClick` selecting the suggestion.
                    onMouseDown={(event) => event.preventDefault()}
                    // `onMouseMove` rather than `onMouseEnter`: a row that
                    // appears directly under an already-still cursor (typing
                    // doesn't move the mouse) can end up "entered" the instant
                    // it renders, silently overwriting what's typed with a
                    // suggestion before the user has touched the mouse at all.
                    // `mousemove` only ever fires from genuine pointer motion,
                    // so hovering can't hijack the field until the user
                    // actually moves the mouse over the dropdown.
                    onMouseMove={() => highlight(index)}
                    onClick={() => selectSuggestion(suggestion)}
                  >
                    {url ? (
                      <LinkSuggestion url={url} fallbackLabel={suggestion} />
                    ) : (
                      <MatchedSuggestion text={suggestion} query={typedQuery} />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </SearchGlow>
    </div>
  );
}

/**
 * Renders `text` with the prefix that matches what the user actually typed
 * bolded — the part they can trust because they typed it themselves — and
 * the rest (the suggested completion) in the regular weight. Falls back to
 * plain text when `text` doesn't start with `query` (case-insensitively),
 * e.g. Google occasionally suggests a corrected spelling.
 * @param {{ text: string, query: string }} props
 */
function MatchedSuggestion({ text, query }) {
  const trimmedQuery = query.trim();
  const isPrefixMatch =
    trimmedQuery.length > 0 && text.toLowerCase().startsWith(trimmedQuery.toLowerCase());

  if (!isPrefixMatch) return text;

  return (
    <>
      <strong className={styles.suggestionMatch}>{text.slice(0, trimmedQuery.length)}</strong>
      {text.slice(trimmedQuery.length)}
    </>
  );
}

/**
 * A URL-shaped suggestion — a bare domain like "github.com", not a search
 * phrase — renders as a small link-preview card instead of a line of text:
 * favicon, page title and meta description, the same information a
 * browser's own address bar shows for a matching history entry.
 *
 * `useLinkPreview` never throws and resolves to `null` on any failure, so
 * the card always has something to show even with no network: the bare
 * hostname (`fallbackLabel`, the original suggestion text) in place of a
 * fetched title, and no description line.
 * @param {{ url: string, fallbackLabel: string }} props
 */
function LinkSuggestion({ url, fallbackLabel }) {
  const preview = useLinkPreview(url);
  const hostname = new URL(url).hostname.replace(/^www\./, '');

  return (
    <div className={styles.linkCard}>
      <LinkFavicon url={url} />
      <div className={styles.linkText}>
        <span className={styles.linkTitle}>{preview?.title || fallbackLabel}</span>
        {preview?.description && (
          <span className={styles.linkDescription}>{preview.description}</span>
        )}
        <span className={styles.linkUrl}>{hostname}</span>
      </div>
    </div>
  );
}

/** The card's icon, with the same graceful fallback as a bookmark tile's
 *  (see `BookmarkGrid/Favicon.jsx`): favicon services fail regularly, and a
 *  broken-image glyph in the middle of a dropdown row would be worse than no
 *  icon at all. Kept local rather than reusing that component because its
 *  CSS module hard-codes bookmark-tile sizing (32px) — this row needs a
 *  smaller icon to fit a single text line. */
function LinkFavicon({ url }) {
  const src = getFaviconUrl(url, 64);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    setHasFailed(false);
  }, [src]);

  if (!src || hasFailed) return <span className={styles.linkFaviconFallback} aria-hidden="true" />;

  return (
    <img
      className={styles.linkFavicon}
      src={src}
      // Decorative — the title text beside it already names the site.
      alt=""
      width={20}
      height={20}
      loading="lazy"
      onError={() => setHasFailed(true)}
    />
  );
}
