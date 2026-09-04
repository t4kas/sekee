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
 *     mode, since the display order there is derived, not stored.
 *
 *     What's actually rendered is `displayBookmarks`, not `bookmarks`
 *     directly: while a drag is over a valid target, it's `bookmarks` with
 *     the dragged tile(s) already spliced into that position, computed by
 *     `reorderedIds` (the exact same function the real drop handler uses, so
 *     the preview and the eventual persisted order can never disagree). This
 *     is what makes the rest of the grid visibly slide aside *before* the
 *     drop, rather than only jumping once it lands — `onDragStart`/
 *     `onDragEnd` track which id(s) are being dragged, `onDropEnter`/
 *     `onDropExit` track the current hover target, and `useReorderAnimation`
 *     (below) FLIP-animates every *other* tile — the dragged one is excluded
 *     since the browser's own drag image already tracks the cursor — whenever
 *     that computed order changes, live, not just at the final drop.
 *
 *     Two further defaults fight the fluid feel this relies on, so both are
 *     overridden:
 *
 *     - React Aria inserts a real `<DropIndicator>` element into the DOM
 *       between whichever two items you're currently hovering between. In a
 *       `layout="stack"` list that's a harmless extra row; in this
 *       `auto-fill` CSS grid it's an extra grid item, which shifts every
 *       tile after it into the next column for as long as you hover there —
 *       the grid visibly reflows mid-drag, on top of (and fighting) the live
 *       preview above. `.dropIndicator`'s `position: absolute` (see
 *       BookmarkGrid.module.css) takes it out of grid flow entirely per the
 *       CSS Grid spec's placement rules — the live preview reorder is
 *       already the "drop here" signal, so nothing else needs to draw one.
 *     - Without a `renderDragPreview`, the browser's native drag image is a
 *       literal snapshot of the tile — and snapshotting a `backdrop-filter`
 *       element mid-frame is unreliable, occasionally rendering as a solid
 *       black or fully transparent rectangle. `renderDragPreview` swaps in a
 *       plain, filter-free copy instead.
 */

import { DropIndicator, GridList, GridListItem, MenuItem, useDragAndDrop } from 'react-aria-components';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ui/Button.jsx';
import { ContextMenu } from '../ui/ContextMenu.jsx';
import { EditIcon, PlusIcon, TrashIcon } from '../ui/icons.jsx';
import { Favicon } from './Favicon.jsx';
import contextMenuStyles from '../ui/ContextMenu.module.css';
import styles from './BookmarkGrid.module.css';

/**
 * The id order that results from dropping `draggedIds` at `target` within
 * `bookmarks`'s current order. Shared by the live preview and the real drop
 * handler so they can never compute two different answers.
 * @param {Array} bookmarks
 * @param {string[]} draggedIds
 * @param {{key: string, dropPosition: 'before' | 'after'}} target
 */
function reorderedIds(bookmarks, draggedIds, target) {
  const remaining = bookmarks.map((bookmark) => bookmark.id).filter((id) => !draggedIds.includes(id));
  const targetIndex = remaining.indexOf(String(target.key));
  if (targetIndex === -1) return null; // the target itself is one of the dragged ids
  const insertAt = target.dropPosition === 'before' ? targetIndex : targetIndex + 1;
  remaining.splice(insertAt, 0, ...draggedIds);
  return remaining;
}

/**
 * FLIP-animates tiles into their new positions whenever `bookmarks`'s order
 * changes without its *set* of ids changing — covers both the live preview
 * reordering as a drag moves over new targets, and the final settle once
 * the real, persisted order (eventually) matches whatever the preview last
 * showed. `excludedIds` skips the tile(s) currently being dragged — the
 * browser's own drag image already tracks the cursor for those.
 * Returns a ref to attach to the `<GridList>` container.
 */
function useReorderAnimation(bookmarks, excludedIds) {
  const containerRef = useRef(null);
  const prevRectsById = useRef(new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ids = bookmarks.map((bookmark) => bookmark.id);
    const prevRects = prevRectsById.current;
    const sameSet = ids.length === prevRects.size && ids.every((id) => prevRects.has(id));
    const nextRects = new Map();
    const duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--duration-med'));

    for (const id of ids) {
      const node = container.querySelector(`[data-key="${CSS.escape(id)}"]`);
      if (!node) continue;

      const rect = node.getBoundingClientRect();
      nextRects.set(id, rect);
      if (!sameSet || excludedIds.has(id)) continue;

      const prevRect = prevRects.get(id);
      const dx = prevRect.left - rect.left;
      const dy = prevRect.top - rect.top;
      if (!dx && !dy) continue;

      // FLIP via the Web Animations API: play a from/to keyframe
      // immediately rather than toggling `transition`/`transform` by hand,
      // which needs a forced-reflow-then-rAF dance to get the "from" frame
      // to register before the "to" transition starts.
      if (duration > 0) {
        node.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
          { duration, easing: 'cubic-bezier(0.2, 0, 0.2, 1)' },
        );
      }
    }

    // Only replace the stored rects once tiles were actually found. React
    // Aria's `<GridList>` builds its collection in one pass and portals the
    // resulting rows into the DOM in a later one, so this effect can
    // occasionally run against a container that's mounted but still
    // childless — replacing `prevRectsById` with an empty map then would
    // permanently poison every future comparison (`sameSet` would never be
    // true again, since it checks the stored map's size against the current
    // id count). Leaving the previous, real measurement in place instead
    // means the next run — once rows do exist — compares against it.
    if (nextRects.size > 0) prevRectsById.current = nextRects;
  }, [bookmarks, excludedIds]);

  return containerRef;
}

/** "https://news.ycombinator.com/x" -> "news.ycombinator.com" */
function displayHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const NO_DRAGGED_IDS = new Set();

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

  // string[] | null — which id(s) a drag currently in progress is carrying;
  // see the file header's point 3.
  const [draggedIds, setDraggedIds] = useState(null);
  // {key: string, dropPosition: 'before' | 'after'} | null — the tile a drag
  // in progress is currently hovering over/near.
  const [hoverTarget, setHoverTarget] = useState(null);

  const draggedIdSet = useMemo(() => (draggedIds ? new Set(draggedIds) : NO_DRAGGED_IDS), [draggedIds]);

  const displayBookmarks = useMemo(() => {
    if (!draggedIds || !hoverTarget) return bookmarks;
    const ids = reorderedIds(bookmarks, draggedIds, hoverTarget);
    if (!ids) return bookmarks;
    const byId = new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }, [bookmarks, draggedIds, hoverTarget]);

  const gridRef = useReorderAnimation(displayBookmarks, draggedIdSet);

  const { dragAndDropHooks } = useDragAndDrop({
    isDisabled: sortMode !== 'custom',
    getItems: (keys) => [...keys].map((key) => ({ 'text/plain': String(key) })),
    onDragStart(event) {
      setDraggedIds([...event.keys].map(String));
    },
    // Fires once the drop has already been handed to `onReorder` below (or
    // the drag was cancelled) — not cleared any earlier, so the preview
    // keeps showing the correct final order through the moment `bookmarks`
    // itself (asynchronously, see `bookmarksService.js`) catches up to
    // match it, rather than flashing back to the pre-drag order first.
    onDragEnd() {
      setDraggedIds(null);
      setHoverTarget(null);
    },
    onDropEnter(event) {
      if (event.target.type === 'item') setHoverTarget(event.target);
    },
    onDropExit(event) {
      setHoverTarget((current) =>
        current && event.target.type === 'item' && current.key === event.target.key ? null : current,
      );
    },
    onReorder(event) {
      const ids = reorderedIds(bookmarks, [...event.keys].map(String), event.target);
      if (ids) onReorder(ids);
    },
    // See the file header's point 3: kept out of CSS grid flow so hovering
    // between tiles doesn't shift the rest of the grid over to make room
    // for it — the live reorder preview above is the actual "drop here"
    // signal now.
    renderDropIndicator: (target) => <DropIndicator target={target} className={styles.dropIndicator} />,
    // See the file header's point 3: the browser's native drag image is an
    // unreliable snapshot of a `backdrop-filter` element, so this stands in
    // a plain, filter-free copy instead.
    renderDragPreview: (items) => {
      const bookmark = bookmarks.find((candidate) => candidate.id === items[0]?.['text/plain']);
      if (!bookmark) return <div />;
      return (
        <div className={styles.dragPreview}>
          <Favicon url={bookmark.url} title={bookmark.title} />
          <span className={styles.dragPreviewTitle}>{bookmark.title}</span>
        </div>
      );
    },
  });

  // Render nothing at all on the first tick rather than flashing an empty
  // grid. localStorage resolves within a frame, so there's no visible gap.
  if (isLoading) return null;

  const contextBookmark = bookmarks.find((bookmark) => bookmark.id === contextMenu?.bookmarkId);

  return (
    <section className={styles.section} aria-label="Bookmarks">
      <GridList
        ref={gridRef}
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
        items={displayBookmarks}
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
