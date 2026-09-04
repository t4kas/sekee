/**
 * GroupTabs
 * ---------------------------------------------------------------------------
 * The switcher above the bookmark grid — one tab per group, a "+" to add
 * one, and, once there isn't room for all of them, a "More" dropdown
 * holding whatever didn't fit.
 *
 * HAND-ROLLED RATHER THAN REACT ARIA'S `Tabs`: `Tabs`/`TabList` (used in
 * `SettingsModal.jsx`) assumes every item renders as a visible `<Tab>` —
 * there's no built-in way to measure available width and move the overflow
 * into a menu. Plain buttons with manual `role="tablist"`/`role="tab"` get
 * the same baseline semantics without fighting that assumption.
 *
 * OVERFLOW MEASUREMENT: a hidden clone of every tab (`.measureRow`, same
 * class so widths match exactly) is what gets measured, not the visible
 * tabs themselves — the visible list's own length changes as `visibleCount`
 * changes, which would make measuring *it* a moving target. A
 * `ResizeObserver` on the container re-runs the calculation whenever the
 * window (or the modal, or whatever's hosting this) resizes.
 *
 * RENAME/ADD: an inline `<input>` swapped in for the tab's label, not a
 * dialog — Enter submits, Escape or losing focus cancels (deliberately
 * cancels rather than also submitting on blur, which would fire a second,
 * duplicate submit when Enter's own submit unmounts the input and the
 * browser synthesises a blur for the just-removed focused element).
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button as AriaButton, Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';
import { ChevronDownIcon, EditIcon, PlusIcon, TrashIcon } from '../ui/icons.jsx';
import { ContextMenu } from '../ui/ContextMenu.jsx';
import contextMenuStyles from '../ui/ContextMenu.module.css';
import styles from './GroupTabs.module.css';

const GAP_PX = 4; // must match .tabs's `gap` in GroupTabs.module.css
const MORE_BUTTON_WIDTH_PX = 84; // rough budget reserved once overflow exists

/**
 * @param {object} props
 * @param {{id: string, name: string}[]} props.groups
 * @param {string|null} props.activeGroupId
 * @param {(id: string) => void} props.onSelect
 * @param {(name: string) => Promise<void>} props.onCreateGroup
 * @param {(id: string, name: string) => Promise<void>} props.onRenameGroup
 * @param {(id: string) => Promise<void>} props.onDeleteGroup
 */
export function GroupTabs({ groups, activeGroupId, onSelect, onCreateGroup, onRenameGroup, onDeleteGroup }) {
  const containerRef = useRef(null);
  const measureRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(groups.length);
  // 'new' while adding a group, a group id while renaming one, else null.
  const [editingId, setEditingId] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [contextMenu, setContextMenu] = useState(null); // { groupId, x, y } | null

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    function recalculate() {
      const containerWidth = container.clientWidth;
      const widths = Array.from(measure.children).map((el) => el.getBoundingClientRect().width);
      const totalWidth = widths.reduce((sum, width) => sum + width, 0) + GAP_PX * Math.max(widths.length - 1, 0);

      // Everything fits — no "More" button needed, so no budget to reserve.
      if (totalWidth <= containerWidth) {
        setVisibleCount(widths.length);
        return;
      }

      const budget = containerWidth - MORE_BUTTON_WIDTH_PX;
      let used = 0;
      let count = 0;
      for (let index = 0; index < widths.length; index++) {
        const next = used + widths[index] + (count > 0 ? GAP_PX : 0);
        if (next > budget) break;
        used = next;
        count++;
      }
      // Always show at least one tab, even if it alone doesn't fit — an
      // empty tab strip would be worse than one that slightly overflows.
      setVisibleCount(Math.max(count, 1));
    }

    recalculate();
    const observer = new ResizeObserver(recalculate);
    observer.observe(container);
    return () => observer.disconnect();
  }, [groups]);

  const visibleGroups = groups.slice(0, visibleCount);
  const overflowGroups = groups.slice(visibleCount);
  const contextGroup = groups.find((group) => group.id === contextMenu?.groupId);

  function startRename(group) {
    setEditingId(group.id);
    setDraftName(group.name);
  }

  function startAdding() {
    setEditingId('new');
    setDraftName('');
  }

  function cancelEditing() {
    setEditingId(null);
    setDraftName('');
  }

  async function submitEditing() {
    const name = draftName.trim();
    const id = editingId;
    setEditingId(null);
    if (!name) return;

    if (id === 'new') await onCreateGroup(name);
    else await onRenameGroup(id, name);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.tabs} ref={containerRef} role="tablist" aria-label="Bookmark groups">
        {visibleGroups.map((group) =>
          editingId === group.id ? (
            <TabNameInput key={group.id} value={draftName} onChange={setDraftName} onSubmit={submitEditing} onCancel={cancelEditing} />
          ) : (
            <button
              key={group.id}
              type="button"
              role="tab"
              aria-selected={group.id === activeGroupId}
              className={styles.tab}
              data-selected={group.id === activeGroupId || undefined}
              onClick={() => onSelect(group.id)}
              /* Capture phase — see BookmarkGrid.jsx's identical comment: a
                 second right-click while a menu is already open must not let
                 the browser's native menu flash up before ours replaces it. */
              onContextMenuCapture={(event) => {
                event.preventDefault();
                setContextMenu({ groupId: group.id, x: event.clientX, y: event.clientY });
              }}
            >
              {group.name}
            </button>
          ),
        )}

        {overflowGroups.length > 0 && (
          <MenuTrigger>
            <AriaButton className={styles.overflowTrigger}>
              More
              <ChevronDownIcon size={14} />
            </AriaButton>
            <Popover className={contextMenuStyles.popover} placement="bottom start">
              <Menu
                className={contextMenuStyles.menu}
                onAction={(key) => onSelect(String(key))}
                items={overflowGroups}
              >
                {(group) => (
                  <MenuItem id={group.id} className={contextMenuStyles.menuItem} textValue={group.name}>
                    {group.name}
                  </MenuItem>
                )}
              </Menu>
            </Popover>
          </MenuTrigger>
        )}

        {editingId === 'new' ? (
          <TabNameInput
            value={draftName}
            onChange={setDraftName}
            onSubmit={submitEditing}
            onCancel={cancelEditing}
            placeholder="Group name"
          />
        ) : (
          <AriaButton className={styles.addTab} aria-label="Add group" onPress={startAdding}>
            <PlusIcon size={14} />
          </AriaButton>
        )}
      </div>

      {/* Invisible clones used only to measure natural widths — see the
          file header comment on why the visible list can't measure itself. */}
      <div className={styles.measureRow} ref={measureRef} aria-hidden="true">
        {groups.map((group) => (
          <span key={group.id} className={styles.tab}>
            {group.name}
          </span>
        ))}
      </div>

      <ContextMenu
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        isOpen={Boolean(contextMenu)}
        onOpenChange={(isOpen) => !isOpen && setContextMenu(null)}
        onAction={(key) => {
          if (contextGroup) {
            if (key === 'rename') startRename(contextGroup);
            else if (key === 'delete') onDeleteGroup(contextGroup.id);
          }
          setContextMenu(null);
        }}
      >
        <MenuItem id="rename" className={contextMenuStyles.menuItem} textValue="Rename">
          <EditIcon size={15} />
          Rename
        </MenuItem>
        {/* Deleting the only remaining group would leave nowhere for
            bookmarks to live — see bookmarkGroupsService.js's deleteGroup. */}
        {groups.length > 1 && (
          <MenuItem
            id="delete"
            className={`${contextMenuStyles.menuItem} ${contextMenuStyles.menuItemDanger}`}
            textValue="Delete"
          >
            <TrashIcon size={15} />
            Delete
          </MenuItem>
        )}
      </ContextMenu>
    </div>
  );
}

function TabNameInput({ value, onChange, onSubmit, onCancel, placeholder }) {
  const inputRef = useRef(null);

  // Not a plain `autoFocus`: this input is almost always mounted right as a
  // right-click context menu is closing (Rename), and React Aria's own
  // menu-close focus restoration — sending focus back to the trigger — runs
  // afterward and wins the race against a same-tick `autoFocus`. Waiting a
  // frame lets that restoration finish first, so this focus call is the one
  // that sticks.
  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <input
      ref={inputRef}
      className={styles.tabInput}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onSubmit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
      onBlur={onCancel}
    />
  );
}
