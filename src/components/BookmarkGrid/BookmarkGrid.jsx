/**
 * BookmarkGrid
 * ---------------------------------------------------------------------------
 * The tile grid, built on React Aria's `GridList`.
 *
 * WHY GridList: it gives us two-dimensional arrow-key navigation, type-ahead
 * (start typing a title and focus jumps to it), and the correct
 * grid/row/gridcell ARIA roles — none of which we'd get from a <ul> of links.
 *
 * TWO DETAILS WORTH UNDERSTANDING:
 *
 *  1. Each tile contains a REAL <a href>, rather than putting `href` on the
 *     GridListItem itself. React Aria's item-level `href` renders a
 *     `<div data-href>` and synthesises the navigation, which costs you
 *     middle-click, "Open link in new tab" in the context menu, and the
 *     status-bar URL preview. Those are worth keeping in a bookmarks app.
 *
 *     The trade-off is that arrow keys move focus to the ROW, not into the
 *     anchor, so Enter wouldn't do anything on its own — hence the
 *     `onAction` handler on each item, which is React Aria's callback for
 *     "the user activated this row". Mouse clicks go through the anchor as
 *     normal.
 *
 *  2. The edit/delete buttons are siblings of the anchor, not nested inside
 *     it (a <button> inside an <a> is invalid HTML). React Aria puts both in
 *     the same gridcell and lets you reach the buttons with Tab once the row
 *     has focus. React Aria stops their clicks from reaching the row, so
 *     pressing Edit opens the dialog instead of opening the bookmark.
 */

import { GridList, GridListItem } from 'react-aria-components';
import { Button } from '../ui/Button.jsx';
import { EditIcon, PlusIcon, TrashIcon } from '../ui/icons.jsx';
import { Favicon } from './Favicon.jsx';
import styles from './BookmarkGrid.module.css';

/** "https://news.ycombinator.com/x" -> "news.ycombinator.com" */
function displayHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * @param {object} props
 * @param {Array} props.bookmarks
 * @param {boolean} props.isLoading
 * @param {(bookmark: object) => void} props.onEdit    opens the edit dialog
 * @param {(bookmark: object) => void} props.onDelete
 * @param {() => void} props.onAdd                      opens the add dialog
 */
export function BookmarkGrid({ bookmarks, isLoading, onEdit, onDelete, onAdd }) {
  // Render nothing at all on the first tick rather than flashing an empty
  // grid. localStorage resolves within a frame, so there's no visible gap.
  if (isLoading) return null;

  return (
    <section className={styles.section} aria-label="Bookmarks">
      <GridList
        className={styles.grid}
        aria-label="Bookmarks"
        /* `grid` (rather than the default `stack`) makes Left/Right arrows
           move between columns and Up/Down between rows. */
        layout="grid"
        /* Tiles are for opening, not selecting — so no checkboxes and no
           selection state to manage. */
        selectionMode="none"
        items={bookmarks}
        renderEmptyState={() => (
          <p className={styles.empty}>
            No bookmarks yet — add your first one to fill this space.
          </p>
        )}
      >
        {(bookmark) => (
          <GridListItem
            id={bookmark.id}
            className={styles.item}
            /* Used for type-ahead and as the row's accessible name. */
            textValue={bookmark.title}
            /* Arrow keys move focus to the ROW, not to the anchor inside
               it, so without this Enter would do nothing for keyboard users.
               `onAction` is React Aria's "this row was activated" callback.
               A mouse click on the anchor also follows the link natively —
               same destination, so the duplicate is harmless. */
            onAction={() => window.location.assign(bookmark.url)}
          >
            <a
              className={styles.link}
              href={bookmark.url}
              /* Bookmarks replace this tab, matching how a homepage's
                 shortcuts normally behave. Users who want a new tab can
                 still middle-click or Ctrl/Cmd-click. */
              rel="noreferrer"
            >
              <Favicon url={bookmark.url} title={bookmark.title} />
              <span className={styles.text}>
                <span className={styles.title}>{bookmark.title}</span>
                <span className={styles.host}>{displayHost(bookmark.url)}</span>
              </span>
            </a>

            {/* Hidden until the tile is hovered or something inside it has
                focus — see the CSS. They stay reachable by keyboard either
                way, because `visibility` is only toggled on hover/focus. */}
            <span className={styles.actions}>
              <Button
                variant="icon"
                className={styles.action}
                aria-label={`Edit ${bookmark.title}`}
                onPress={() => onEdit(bookmark)}
              >
                <EditIcon size={15} />
              </Button>
              <Button
                variant="icon"
                className={styles.action}
                aria-label={`Delete ${bookmark.title}`}
                onPress={() => onDelete(bookmark)}
              >
                <TrashIcon size={15} />
              </Button>
            </span>
          </GridListItem>
        )}
      </GridList>

      {/* Outside the GridList: it's an action, not a bookmark, and putting
          it in the collection would make arrow keys land on it. */}
      <Button className={styles.addButton} onPress={onAdd}>
        <PlusIcon size={16} />
        Add bookmark
      </Button>
    </section>
  );
}
