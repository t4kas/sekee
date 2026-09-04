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
 *     mode, since the display order there is derived, not stored. `items`
 *     always stays `bookmarks`, unreordered, for the whole drag — the "other
 *     tiles slide aside to preview the drop" effect is a `transform` painted
 *     directly onto the still-in-place tiles by `useDragPreview`, not an
 *     actual reorder of the collection. This is deliberate, not incidental:
 *     an earlier version *did* feed a live-reordered array back in as
 *     `items`, and it glitched — moving tiles changes their
 *     `getBoundingClientRect()`, and React Aria's default drop-target
 *     delegate re-measures on every pointer move, so a preview-caused shift
 *     could move the tile the cursor was already sitting over, retriggering
 *     another reorder, in a feedback loop that looked like flickering.
 *     `useDragPreview` avoids this by hit-testing against a single snapshot
 *     of tile positions taken at drag start (`dropTargetDelegate`) rather
 *     than the live DOM — its answer depends only on the raw cursor
 *     position, never on anything this component itself has drawn — and
 *     applies the visual "make room" effect with a transform computed from
 *     that same frozen snapshot, imperatively (no React state, no re-render)
 *     so nothing during the drag can retrigger anything else.
 *
 *     Actually committing the new order happens only at the real drop, via
 *     `onReorder` — `reorderedIds` is the one function both the preview and
 *     the real handler call, so they can never disagree about where a tile
 *     would land. `useReorderAnimation` then FLIP-animates the tiles into
 *     their new grid cells once `bookmarks` itself (asynchronously, see
 *     `bookmarksService.js`) catches up to that persisted order.
 *
 *     Two further defaults fight the fluid feel this relies on, so both are
 *     overridden:
 *
 *     - React Aria inserts a real `<DropIndicator>` element into the DOM
 *       between whichever two items you're currently hovering between. In a
 *       `layout="stack"` list that's a harmless extra row; in this
 *       `auto-fill` CSS grid it's an extra grid item, which shifts every
 *       tile after it into the next column for as long as you hover there —
 *       the grid visibly reflows mid-drag, on top of (and fighting) the
 *       preview above. `.dropIndicator`'s `position: absolute` (see
 *       BookmarkGrid.module.css) takes it out of grid flow entirely per the
 *       CSS Grid spec's placement rules — the preview reorder is already the
 *       "drop here" signal, so nothing else needs to draw one.
 *     - Without a `renderDragPreview`, the browser's native drag image is a
 *       literal snapshot of the tile — and snapshotting a `backdrop-filter`
 *       element mid-frame is unreliable, occasionally rendering as a solid
 *       black or fully transparent rectangle. `renderDragPreview` swaps in a
 *       plain, filter-free copy instead.
 */

import { DropIndicator, GridList, GridListItem, MenuItem, useDragAndDrop } from 'react-aria-components';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button.jsx';
import { ContextMenu } from '../ui/ContextMenu.jsx';
import { EditIcon, PlusIcon, TrashIcon } from '../ui/icons.jsx';
import { Favicon } from './Favicon.jsx';
import contextMenuStyles from '../ui/ContextMenu.module.css';
import styles from './BookmarkGrid.module.css';

/**
 * The id order that results from dropping `draggedIds` at `target` within
 * `bookmarks`'s current order. Shared by the preview and the real drop
 * handler so they can never compute two different answers. Returns `null`
 * if `target` doesn't resolve to a real position (e.g. it's one of the
 * dragged ids itself — hovering a tile over its own original spot).
 * @param {Array} bookmarks
 * @param {string[]} draggedIds
 * @param {{key: string, dropPosition: 'before' | 'after'}} target
 */
function reorderedIds(bookmarks, draggedIds, target) {
  const remaining = bookmarks.map((bookmark) => bookmark.id).filter((id) => !draggedIds.includes(id));
  const targetIndex = remaining.indexOf(String(target.key));
  if (targetIndex === -1) return null;
  const insertAt = target.dropPosition === 'before' ? targetIndex : targetIndex + 1;
  remaining.splice(insertAt, 0, ...draggedIds);
  return remaining;
}

/**
 * FLIP-animates tiles into their new positions whenever `bookmarks`'s order
 * changes without its *set* of ids changing — i.e. the real, persisted
 * reorder landing once a drop's `onReorder` call round-trips through
 * storage. Attach `containerRef` to the `<GridList>`.
 */
function useReorderAnimation(bookmarks, containerRef) {
  const prevRectsById = useRef(new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ids = bookmarks.map((bookmark) => bookmark.id);

    // Measures the current rows and, if any real order change is found,
    // FLIP-animates them into place — factored out because it sometimes has
    // to run a frame late (see the retry below).
    function measureAndAnimate() {
      const prevRects = prevRectsById.current;
      const sameSet = ids.length === prevRects.size && ids.every((id) => prevRects.has(id));
      const nextRects = new Map();
      const duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--duration-med'));

      for (const id of ids) {
        const node = container.querySelector(`[data-key="${CSS.escape(id)}"]`);
        if (!node) continue;

        const rect = node.getBoundingClientRect();
        nextRects.set(id, rect);
        if (!sameSet) continue;

        const prevRect = prevRects.get(id);
        const dx = prevRect.left - rect.left;
        const dy = prevRect.top - rect.top;
        if (!dx && !dy) continue;

        // FLIP via the Web Animations API: play a from/to keyframe
        // immediately rather than toggling `transition`/`transform` by
        // hand, which needs a forced-reflow-then-rAF dance to get the
        // "from" frame to register before the "to" transition starts.
        if (duration > 0) {
          node.animate(
            [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
            { duration, easing: 'cubic-bezier(0.2, 0, 0.2, 1)' },
          );
        }
      }

      prevRectsById.current = nextRects;
      return nextRects.size;
    }

    if (measureAndAnimate() > 0 || ids.length === 0) return undefined;

    // React Aria's `<GridList>` can take more than one render past this
    // component's own commit to actually portal real `<GridListItem>` rows
    // into the DOM — its collection is built from `items` in one pass and
    // rendered from that built collection in a separate one, and that
    // catch-up render doesn't touch `bookmarks`, so it wouldn't re-trigger
    // this effect on its own (a single `requestAnimationFrame` retry isn't
    // reliably enough either — the catch-up isn't tied to a fixed number of
    // frames). A `MutationObserver` sidesteps needing to know how many
    // passes it takes: it fires exactly when the DOM actually changes,
    // however long that takes, and disconnects itself once it has. Skipping
    // this rows-not-here-yet render entirely (rather than recording an
    // empty snapshot) matters because an empty snapshot would permanently
    // disable the animation — `sameSet` would never find a match again.
    const observer = new MutationObserver(() => {
      if (container.querySelector('[data-key]')) {
        observer.disconnect();
        measureAndAnimate();
      }
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [bookmarks, containerRef]);
}

/**
 * Everything about the "other tiles slide aside" preview — see the file
 * header's point 3 for why it's built this way. Nothing here touches React
 * state: it's all direct DOM/ref mutation, imperatively driven by the drag
 * callbacks in `BookmarkGrid`, so the preview can never itself be the cause
 * of a re-render (and thus never the cause of a feedback loop).
 */
function useDragPreview(containerRef) {
  // Map<id, DOMRect> — every tile's position, snapshotted once at drag
  // start. Both the delegate and the preview transform read only this, never
  // the live DOM, for as long as the drag lasts.
  const rectsRef = useRef(new Map());
  const draggedIdsRef = useRef([]);
  const hoverTargetRef = useRef(null);

  const captureStart = useCallback(
    (keys) => {
      draggedIdsRef.current = [...keys].map(String);
      hoverTargetRef.current = null;

      const rects = new Map();
      const container = containerRef.current;
      if (container) {
        for (const node of container.querySelectorAll('[data-key]')) {
          rects.set(node.dataset.key, node.getBoundingClientRect());
        }
      }
      rectsRef.current = rects;
    },
    [containerRef],
  );

  const paint = useCallback(
    (bookmarks) => {
      const container = containerRef.current;
      const rects = rectsRef.current;
      if (!container) return;

      const draggedIds = draggedIdsRef.current;
      const target = hoverTargetRef.current;
      const originalIds = bookmarks.map((bookmark) => bookmark.id);
      const previewIds = target ? reorderedIds(bookmarks, draggedIds, target) : null;

      for (const id of originalIds) {
        const node = container.querySelector(`[data-key="${CSS.escape(id)}"]`);
        if (!node || draggedIds.includes(id)) continue;

        let dx = 0;
        let dy = 0;
        if (previewIds) {
          const previewIndex = previewIds.indexOf(id);
          // The tile currently occupying the grid slot this one is
          // previewing into — its frozen rect *is* that slot's position,
          // since slot positions don't move even though the tiles filling
          // them conceptually do.
          const slotOwnerId = originalIds[previewIndex];
          const ownRect = rects.get(id);
          const slotRect = rects.get(slotOwnerId);
          if (ownRect && slotRect) {
            dx = slotRect.left - ownRect.left;
            dy = slotRect.top - ownRect.top;
          }
        }

        node.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : '';
      }
    },
    [containerRef],
  );

  const clear = useCallback(() => {
    draggedIdsRef.current = [];
    hoverTargetRef.current = null;
    const container = containerRef.current;
    if (!container) return;
    for (const node of container.querySelectorAll('[data-key]')) node.style.transform = '';
  }, [containerRef]);

  const setHoverTarget = useCallback(
    (target, bookmarks) => {
      hoverTargetRef.current = target;
      paint(bookmarks);
    },
    [paint],
  );

  // See the file header's point 3: this is what keeps hit-testing stable
  // regardless of the transform-based preview — it depends only on the
  // snapshot taken at drag start and the raw cursor position, never on the
  // live (transformed) DOM.
  const dropTargetDelegateRef = useRef({
    getDropTargetFromPoint(x, y, isValidDropTarget) {
      const container = containerRef.current;
      const rects = rectsRef.current;
      if (!container || rects.size === 0) return { type: 'root' };

      const containerRect = container.getBoundingClientRect();
      const pointX = x + containerRect.left;
      const pointY = y + containerRect.top;

      let closestId = null;
      let closestRect = null;
      let closestDistance = Infinity;
      for (const [id, rect] of rects) {
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const distance = (pointX - centerX) ** 2 + (pointY - centerY) ** 2;
        if (distance < closestDistance) {
          closestDistance = distance;
          closestId = id;
          closestRect = rect;
        }
      }
      if (!closestId) return { type: 'root' };

      const dropPosition = pointX < closestRect.left + closestRect.width / 2 ? 'before' : 'after';
      const target = { type: 'item', key: closestId, dropPosition };
      return isValidDropTarget(target) ? target : { type: 'root' };
    },
  });

  return { captureStart, setHoverTarget, clear, draggedIdsRef, dropTargetDelegate: dropTargetDelegateRef.current };
}

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

  const gridRef = useRef(null);
  useReorderAnimation(bookmarks, gridRef);
  const { captureStart, setHoverTarget, clear, draggedIdsRef, dropTargetDelegate } = useDragPreview(gridRef);

  const { dragAndDropHooks } = useDragAndDrop({
    isDisabled: sortMode !== 'custom',
    getItems: (keys) => [...keys].map((key) => ({ 'text/plain': String(key) })),
    dropTargetDelegate,
    onDragStart(event) {
      captureStart(event.keys);
    },
    onDragEnd() {
      clear();
    },
    onDropEnter(event) {
      if (event.target.type === 'item') setHoverTarget(event.target, bookmarks);
    },
    onDropExit(event) {
      if (event.target.type === 'item' && draggedIdsRef.current.length > 0) {
        setHoverTarget(null, bookmarks);
      }
    },
    onReorder(event) {
      const ids = reorderedIds(bookmarks, [...event.keys].map(String), event.target);
      if (ids) onReorder(ids);
    },
    // See the file header's point 3: kept out of CSS grid flow so hovering
    // between tiles doesn't shift the rest of the grid over to make room
    // for it — the preview reorder above is already the "drop here" signal.
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
