/**
 * BookmarksTab
 * ---------------------------------------------------------------------------
 * Two things that don't fit as a right-click on the bookmark grid itself:
 * the global sort mode, and group tab order.
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
 */

import { Button as AriaButton } from 'react-aria-components';
import { Select } from '../ui/Select.jsx';
import { ChevronDownIcon } from '../ui/icons.jsx';
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
 * @param {(orderedIds: string[]) => void} props.onReorderGroups
 */
export function BookmarksTab({ settings, onSettingsChange, groups, onReorderGroups }) {
  return (
    <div className={styles.section}>
      <Select
        label="Sort bookmarks by"
        items={SORT_MODES}
        selectedKey={settings.bookmarkSortMode}
        onSelectionChange={(bookmarkSortMode) => onSettingsChange({ bookmarkSortMode })}
      />

      <div>
        <p className={styles.groupOrderLabel}>Group tab order</p>
        <div className={styles.groupOrderList}>
          {groups.map((group, index) => (
            <div key={group.id} className={styles.groupOrderRow}>
              <span className={styles.groupOrderName}>{group.name}</span>
              <div className={styles.groupOrderButtons}>
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
          ))}
        </div>
      </div>
    </div>
  );
}
