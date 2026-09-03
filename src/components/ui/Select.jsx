/**
 * Select
 * ---------------------------------------------------------------------------
 * A styled dropdown built from React Aria's `Select` pieces.
 *
 * The anatomy is worth knowing, because every React Aria collection component
 * follows the same pattern:
 *
 *   <Select>                 owns the selected value and open/closed state
 *     <Label>                the visible label, wired up automatically
 *     <Button>               what you click; shows the current value
 *       <SelectValue>        renders the selected item's text
 *     <Popover>              the floating layer (positioning handled for us)
 *       <ListBox>            the list, with full keyboard navigation
 *         <ListBoxItem>      one option
 *
 * React Aria handles arrow-key navigation, type-ahead, Escape to close,
 * focus restoration and the ARIA attributes. We only supply the looks.
 */

import {
  Select as AriaSelect,
  Button,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  SelectValue,
} from 'react-aria-components';
import { ChevronDownIcon } from './icons.jsx';
import styles from './Select.module.css';

/**
 * @param {object} props
 * @param {string} props.label       visible label text
 * @param {Array<{id: string, name: string}>} props.items  the options
 * @param {string} props.selectedKey id of the currently selected item
 * @param {(key: string) => void} props.onSelectionChange
 */
export function Select({ label, items, selectedKey, onSelectionChange }) {
  return (
    <AriaSelect
      className={styles.select}
      selectedKey={selectedKey}
      // React Aria calls this with the item's `id`. It can be a number for
      // numeric keys, so we normalise to a string for our string-keyed data.
      onSelectionChange={(key) => onSelectionChange(String(key))}
    >
      <Label className={styles.label}>{label}</Label>

      <Button className={styles.trigger}>
        <SelectValue className={styles.value} />
        <ChevronDownIcon size={16} />
      </Button>

      {/* Rendered in a portal and positioned relative to the trigger. */}
      <Popover className={styles.popover} offset={6}>
        <ListBox className={styles.listbox} items={items}>
          {(item) => (
            <ListBoxItem id={item.id} className={styles.option} textValue={item.name}>
              {item.name}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </AriaSelect>
  );
}
