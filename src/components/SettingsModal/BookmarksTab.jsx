/**
 * BookmarksTab
 * ---------------------------------------------------------------------------
 * Three things that don't fit as a right-click on the bookmark grid itself:
 * the global sort mode, group tab order, and — since GroupTabs.jsx's own
 * inline add/rename lives in a narrow, crowded tab strip — a roomier place
 * to create or rename a group.
 *
 * Sort mode is one setting for every group (see `settingsService.js`'s
 * `bookmarkSortMode` comment) — 'custom' respects each bookmark's own
 * `order` (drag-and-drop in `BookmarkGrid.jsx`), 'recent' derives the order
 * from `lastOpenedAt` instead, which is why there's nothing to manually
 * reorder in that mode.
 *
 * Group order uses up/down buttons rather than drag-and-drop — this is a
 * short, vertical settings list, not a second drag surface to build and
 * keep in sync with the tab strip's own (Settings-only, per the brief)
 * reordering.
 *
 * ADD/RENAME: `editingId` mirrors GroupTabs.jsx's own pattern ('new' while
 * adding, a group id while renaming, else null) — a separate, parallel piece
 * of state, not shared with the tab strip, since they're different pieces of
 * UI that happen to edit the same data; nothing keeps two rename forms open
 * at once anyway, since committing one calls the same `onRenameGroup`.
 */

import { useEffect, useRef, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Select } from '../ui/Select.jsx';
import { CheckIcon, ChevronDownIcon, CloseIcon, EditIcon, PlusIcon } from '../ui/icons.jsx';
import styles from './SettingsModal.module.css';

const SORT_MODES = [
  { id: 'custom', name: 'Custom order (drag and drop)' },
  { id: 'recent', name: 'Most recently opened' },
];

/** Swaps `id` one position toward `direction` (-1 up, 1 down) in `groups`
 *  (already in display order) and returns the resulting id order. */
function moveGroup(groups, id, direction) {
  const ids = groups.map((group) => group.id);
  const index = ids.indexOf(id);
  const swapWith = index + direction;
  if (swapWith < 0 || swapWith >= ids.length) return ids;

  [ids[index], ids[swapWith]] = [ids[swapWith], ids[index]];
  return ids;
}

/**
 * @param {object} props
 * @param {{bookmarkSortMode: string}} props.settings
 * @param {(changes: object) => void} props.onSettingsChange
 * @param {{id: string, name: string}[]} props.groups  already in display order
 * @param {(name: string) => Promise<void>} props.onCreateGroup
 * @param {(id: string, name: string) => Promise<void>} props.onRenameGroup
 * @param {(orderedIds: string[]) => void} props.onReorderGroups
 */
export function BookmarksTab({ settings, onSettingsChange, groups, onCreateGroup, onRenameGroup, onReorderGroups }) {
  // 'new' while adding a group, a group id while renaming one, else null —
  // see the file header comment.
  const [editingId, setEditingId] = useState(null);
  const [draftName, setDraftName] = useState('');

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
    <div className={styles.section}>
      <Select
        label="Sort bookmarks by"
        items={SORT_MODES}
        selectedKey={settings.bookmarkSortMode}
        onSelectionChange={(bookmarkSortMode) => onSettingsChange({ bookmarkSortMode })}
      />

      <div>
        <p className={styles.groupOrderLabel}>Groups</p>
        <div className={styles.groupOrderList}>
          {groups.map((group, index) =>
            editingId === group.id ? (
              <GroupNameRow
                key={group.id}
                value={draftName}
                onChange={setDraftName}
                onSubmit={submitEditing}
                onCancel={cancelEditing}
              />
            ) : (
              <div key={group.id} className={styles.groupOrderRow}>
                <span className={styles.groupOrderName}>{group.name}</span>
                <div className={styles.groupOrderButtons}>
                  <AriaButton
                    className={styles.reorderButton}
                    aria-label={`Rename ${group.name}`}
                    onPress={() => startRename(group)}
                  >
                    <EditIcon size={14} />
                  </AriaButton>
                  <AriaButton
                    className={styles.reorderButton}
                    isDisabled={index === 0}
                    aria-label={`Move ${group.name} up`}
                    onPress={() => onReorderGroups(moveGroup(groups, group.id, -1))}
                  >
                    <ChevronDownIcon size={14} className={styles.reorderIconUp} />
                  </AriaButton>
                  <AriaButton
                    className={styles.reorderButton}
                    isDisabled={index === groups.length - 1}
                    aria-label={`Move ${group.name} down`}
                    onPress={() => onReorderGroups(moveGroup(groups, group.id, 1))}
                  >
                    <ChevronDownIcon size={14} />
                  </AriaButton>
                </div>
              </div>
            ),
          )}

          {editingId === 'new' ? (
            <GroupNameRow
              value={draftName}
              onChange={setDraftName}
              onSubmit={submitEditing}
              onCancel={cancelEditing}
              placeholder="Group name"
            />
          ) : (
            <AriaButton className={styles.addGroupRow} onPress={startAdding}>
              <PlusIcon size={14} />
              Add group
            </AriaButton>
          )}
        </div>
      </div>
    </div>
  );
}

/** The `.groupOrderRow`-shaped input used for both adding and renaming —
 *  same submit/cancel semantics as GroupTabs.jsx's own `TabNameInput`
 *  (Enter submits, Escape or losing focus cancels; blur deliberately only
 *  cancels, never also submits, so Enter's own submit unmounting the input
 *  doesn't fire a second, duplicate submit via the browser's synthesised
 *  blur for the just-removed focused element). Unlike the tab strip's
 *  version, confirm/cancel also get their own icon buttons, since a mouse
 *  user filling in a full settings panel is less likely to reach for the
 *  keyboard than one who just clicked a pill inline. */
function GroupNameRow({ value, onChange, onSubmit, onCancel, placeholder }) {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className={styles.groupOrderRow}>
      <input
        ref={inputRef}
        className={styles.groupNameInput}
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
      <div className={styles.groupOrderButtons}>
        {/* `onMouseDown` + `preventDefault`, not `onPress`: a press is
            preceded by a blur of the input (losing focus to the button),
            which would already have cancelled via `onBlur` above by the
            time a press handler ran. Prevent-defaulting the mousedown stops
            that blur from happening in the first place. */}
        <AriaButton
          className={styles.reorderButton}
          aria-label="Confirm"
          onMouseDown={(event) => event.preventDefault()}
          onPress={onSubmit}
        >
          <CheckIcon size={14} />
        </AriaButton>
        <AriaButton
          className={styles.reorderButton}
          aria-label="Cancel"
          onMouseDown={(event) => event.preventDefault()}
          onPress={onCancel}
        >
          <CloseIcon size={14} />
        </AriaButton>
      </div>
    </div>
  );
}
