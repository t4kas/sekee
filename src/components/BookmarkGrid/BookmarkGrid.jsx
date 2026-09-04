/**
 * BookmarkGrid
 * ---------------------------------------------------------------------------
 * The tile grid, built on React Aria's `GridList`.
 *
 * WHY GridList: it gives us two-dimensional arrow-key navigation, type-ahead
 * (start typing a title and focus jumps to it), the correct grid/row/gridcell
 * ARIA roles, and — via `dragAndDropHooks` — drag-and-drop reordering, all
 * none of which we'd get from a <ul> of links.
 *
 * THREE DETAILS WORTH UNDERSTANDING:
 *
 *  1. Each tile contains a REAL <a href>, rather than putting `href` on the
 *     GridListItem itself. React Aria's item-level `href` renders a
 *     `<div data-href>` and synthesises the navigation, which costs you
 *     middle-click, "Open link in new tab" in the context menu, and the
 *     status-bar URL preview. Those are worth keeping in a bookmarks app —
 *     which is also why editing/deleting moved to an actual right-click
 *     menu instead of the on-hover buttons this used to have: overlaying
 *     buttons on top of the tile ate into that same click target.
 *
 *     The trade-off is that arrow keys move focus to the ROW, not into the
 *     anchor, so Enter wouldn't do anything on its own — hence `onAction` on
 *     each item, React Aria's callback for "the user activated this row".
 *     Mouse clicks go through the anchor as normal; `onAction` fires for
 *     those too, which is why `onOpen` (recording "last opened") lives there
 *     rather than on the anchor's own click — one call site covers both.
 *
 *  2. RIGHT-CLICK MENU: native `onContextMenu` on the anchor, `preventDefault`
 *     to suppress the browser's own menu, and a single `ContextMenu`
 *     (rendered once, outside the list) anchored at the click point — see
 *     `ui/ContextMenu.jsx`. One shared instance rather than one per tile
 *     because only one can ever be open at a time.
 *
 *  3. DRAG-AND-DROP: only enabled in `'custom'` sort mode (`isDisabled` in
 *     `useDragAndDrop`) — there's nothing to manually order in `'recent'`
 *     mode, since the display order there is derived, not stored. Dropping
 *     computes the new id order and hands it to `onReorder`, which is
 *     `useBookmarks.js`'s `reorderBookmarks` — persisted the same way any
 *     other edit is, no separate "save layout" step.
 */

import { GridList, GridListItem, MenuItem, useDragAndDrop } from 'react-aria-components';
import { useState } from 'react';
import { Button } from '../ui/Button.jsx';
import { ContextMenu } from '../ui/ContextMenu.jsx';
import { EditIcon, PlusIcon, TrashIcon } from '../ui/icons.jsx';
import { Favicon } from './Favicon.jsx';
import contextMenuStyles from '../ui/ContextMenu.module.css';
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
 * @param {Array} props.bookmarks     already filtered to the active group and sorted for display
 * @param {boolean} props.isLoading
 * @param {'custom' | 'recent'} props.sortMode
 * @param {(bookmark: object) => void} props.onEdit    opens the edit dialog
 * @param {(bookmark: object) => void} props.onDelete
 * @param {() => void} props.onAdd                      opens the add dialog
 * @param {(id: string) => void} props.onOpen           records "last opened" for sort mode
 * @param {(orderedIds: string[]) => void} props.onReorder
 */
export function BookmarkGrid({ bookmarks, isLoading, sortMode, onEdit, onDelete, onAdd, onOpen, onReorder }) {
  // { bookmarkId, x, y } | null — see the file header's point 2.
  const [contextMenu, setContextMenu] = useState(null);

  const { dragAndDropHooks } = useDragAndDrop({
    isDisabled: sortMode !== 'custom',
    getItems: (keys) => [...keys].map((key) => ({ 'text/plain': String(key) })),
    onReorder(event) {
      const draggedIds = [...event.keys].map(String);
      const remaining = bookmarks.map((bookmark) => bookmark.id).filter((id) => !draggedIds.includes(id));

      const targetIndex = remaining.indexOf(String(event.target.key));
      const insertAt = event.target.dropPosition === 'before' ? targetIndex : targetIndex + 1;
      remaining.splice(insertAt, 0, ...draggedIds);

      onReorder(remaining);
    },
  });

  // Render nothing at all on the first tick rather than flashing an empty
  // grid. localStorage resolves within a frame, so there's no visible gap.
  if (isLoading) return null;

  const contextBookmark = bookmarks.find((bookmark) => bookmark.id === contextMenu?.bookmarkId);

  return (
    <section className={styles.section} aria-label="Bookmarks">
      <GridList
        className={styles.grid}
        aria-label="Bookmarks"
        // Purely presentational — lets the CSS show a grab cursor only when
        // dragging would actually do something (see `.item` in
        // BookmarkGrid.module.css). `dragAndDropHooks`'s own `isDisabled`
        // above is what actually turns dragging off.
        data-sort-mode={sortMode}
        /* `grid` (rather than the default `stack`) makes Left/Right arrows
           move between columns and Up/Down between rows. */
        layout="grid"
        /* Tiles are for opening, not selecting — so no checkboxes and no
           selection state to manage. */
        selectionMode="none"
        items={bookmarks}
        dragAndDropHooks={dragAndDropHooks}
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
               same destination, so the duplicate navigation is harmless,
               and it's why `onOpen` lives here rather than on the anchor. */
            onAction={() => {
              onOpen(bookmark.id);
              window.location.assign(bookmark.url);
            }}
          >
            <a
              className={styles.link}
              href={bookmark.url}
              /* Bookmarks replace this tab, matching how a homepage's
                 shortcuts normally behave. Users who want a new tab can
                 still middle-click or Ctrl/Cmd-click. */
              rel="noreferrer"
              /* Capture phase, not bubble: while a menu from an earlier
                 right-click is still open, React Aria's own outside-interaction
                 handling can intercept the bubble-phase event before it
                 reaches here, so `preventDefault` never runs and the browser's
                 native menu flashes up before ours replaces it. Capturing it
                 on the way down guarantees `preventDefault` always fires. */
              onContextMenuCapture={(event) => {
                event.preventDefault();
                setContextMenu({ bookmarkId: bookmark.id, x: event.clientX, y: event.clientY });
              }}
            >
              <Favicon url={bookmark.url} title={bookmark.title} />
              <span className={styles.text}>
                <span className={styles.title}>{bookmark.title}</span>
                <span className={styles.host}>{displayHost(bookmark.url)}</span>
              </span>
            </a>
          </GridListItem>
        )}
      </GridList>

      <ContextMenu
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        isOpen={Boolean(contextMenu)}
        onOpenChange={(isOpen) => !isOpen && setContextMenu(null)}
        onAction={(key) => {
          if (contextBookmark) {
            if (key === 'edit') onEdit(contextBookmark);
            else if (key === 'delete') onDelete(contextBookmark);
          }
          setContextMenu(null);
        }}
      >
        <MenuItem id="edit" className={contextMenuStyles.menuItem} textValue="Edit">
          <EditIcon size={15} />
          Edit
        </MenuItem>
        <MenuItem
          id="delete"
          className={`${contextMenuStyles.menuItem} ${contextMenuStyles.menuItemDanger}`}
          textValue="Delete"
        >
          <TrashIcon size={15} />
          Delete
        </MenuItem>
      </ContextMenu>

      {/* Outside the GridList: it's an action, not a bookmark, and putting
          it in the collection would make arrow keys land on it. */}
      <Button className={styles.addButton} onPress={onAdd}>
        <PlusIcon size={16} />
        Add bookmark
      </Button>
    </section>
  );
}
