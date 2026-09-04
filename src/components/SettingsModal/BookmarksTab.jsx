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
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';
import { Tooltip } from '../ui/Tooltip.jsx';
import { CheckIcon, ChevronDownIcon, CloseIcon, DownloadIcon, EditIcon, PlusIcon, UploadIcon } from '../ui/icons.jsx';
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
 * @param {() => void} props.onExportBookmarks
 * @param {(file: File) => Promise<{imported: number, skipped: number, groupsCreated: number}>} props.onImportBookmarks
 */
export function BookmarksTab({
  settings,
  onSettingsChange,
  groups,
  onCreateGroup,
  onRenameGroup,
  onReorderGroups,
  onExportBookmarks,
  onImportBookmarks,
}) {
  // 'new' while adding a group, a group id while renaming one, else null —
  // see the file header comment.
  const [editingId, setEditingId] = useState(null);
  const [draftName, setDraftName] = useState('');

  const fileInputRef = useRef(null);
  const [isImporting, setIsImporting] = useState(false);
  // { kind: 'success', text } | { kind: 'error', text } | null
  const [importStatus, setImportStatus] = useState(null);

  async function handleFileSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // lets picking the same file twice re-fire onChange
    if (!file) return;

    setIsImporting(true);
    setImportStatus(null);
    try {
      const { imported, skipped, groupsCreated } = await onImportBookmarks(file);
      const parts = [`Imported ${imported} bookmark${imported === 1 ? '' : 's'}`];
      if (groupsCreated > 0) parts.push(`${groupsCreated} new group${groupsCreated === 1 ? '' : 's'}`);
      if (skipped > 0) parts.push(`${skipped} skipped`);
      setImportStatus({ kind: 'success', text: `${parts.join(', ')}.` });
    } catch {
      // Malformed/non-bookmark file, or the browser rejected reading it —
      // `onImportBookmarks` itself already skips individual bad entries
      // (bad URLs) rather than throwing, so getting here means the file as
      // a whole couldn't be read.
      setImportStatus({ kind: 'error', text: "Couldn't read that file — is it a browser bookmark export?" });
    } finally {
      setIsImporting(false);
    }
  }

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
                  <Tooltip label="Rename">
                    <AriaButton
                      className={styles.reorderButton}
                      aria-label={`Rename ${group.name}`}
                      onPress={() => startRename(group)}
                    >
                      <EditIcon size={14} />
                    </AriaButton>
                  </Tooltip>
                  <Tooltip label="Move up">
                    <AriaButton
                      className={styles.reorderButton}
                      isDisabled={index === 0}
                      aria-label={`Move ${group.name} up`}
                      onPress={() => onReorderGroups(moveGroup(groups, group.id, -1))}
                    >
                      <ChevronDownIcon size={14} className={styles.reorderIconUp} />
                    </AriaButton>
                  </Tooltip>
                  <Tooltip label="Move down">
                    <AriaButton
                      className={styles.reorderButton}
                      isDisabled={index === groups.length - 1}
                      aria-label={`Move ${group.name} down`}
                      onPress={() => onReorderGroups(moveGroup(groups, group.id, 1))}
                    >
                      <ChevronDownIcon size={14} />
                    </AriaButton>
                  </Tooltip>
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

      <div>
        <p className={styles.groupOrderLabel}>Import &amp; export</p>
        <div className={styles.importExportRow}>
          <Button onPress={onExportBookmarks}>
            <DownloadIcon size={16} />
            Export bookmarks
          </Button>
          <Button onPress={() => fileInputRef.current?.click()} isDisabled={isImporting}>
            <UploadIcon size={16} />
            {isImporting ? 'Importing…' : 'Import bookmarks'}
          </Button>
        </div>
        {/* Netscape Bookmark File — the one format every major browser both
            exports to and imports from, see bookmarkImportExport.js. */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".html,.htm,text/html"
          className={styles.hiddenFileInput}
          onChange={handleFileSelected}
        />
        <p className={styles.hint}>
          Export downloads an HTML file any browser can import. Import reads one the same way —
          folders become groups.
        </p>
        {importStatus && (
          <p className={importStatus.kind === 'error' ? styles.hintError : styles.hint}>{importStatus.text}</p>
        )}
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
        <Tooltip label="Confirm">
          <AriaButton
            className={styles.reorderButton}
            aria-label="Confirm"
            onMouseDown={(event) => event.preventDefault()}
            onPress={onSubmit}
          >
            <CheckIcon size={14} />
          </AriaButton>
        </Tooltip>
        <Tooltip label="Cancel">
          <AriaButton
            className={styles.reorderButton}
            aria-label="Cancel"
            onMouseDown={(event) => event.preventDefault()}
            onPress={onCancel}
          >
            <CloseIcon size={14} />
          </AriaButton>
        </Tooltip>
      </div>
    </div>
  );
}
