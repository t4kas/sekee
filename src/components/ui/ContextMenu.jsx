/**
 * ContextMenu
 * ---------------------------------------------------------------------------
 * A right-click menu anchored at the click point rather than a trigger
 * element. React Aria's `MenuTrigger` expects a real trigger it can measure
 * and position against; a right-click has no such element — just a point —
 * so this gives it an invisible 0-size anchor moved to the click coordinates
 * on each open instead. `Popover`'s `triggerRef` is what makes that work: it
 * overrides the trigger `MenuTrigger` would otherwise infer from its own
 * child.
 *
 * Fully controlled (`isOpen`/`onOpenChange`) rather than opening itself,
 * since opening is driven by a `contextmenu` event the caller owns (on a
 * bookmark tile, a group tab, ...), not a press on the anchor itself.
 */

import { useRef } from 'react';
import { Menu, MenuTrigger, Popover } from 'react-aria-components';
import styles from './ContextMenu.module.css';

/**
 * @param {object} props
 * @param {number} props.x
 * @param {number} props.y
 * @param {boolean} props.isOpen
 * @param {(isOpen: boolean) => void} props.onOpenChange
 * @param {(key: string) => void} props.onAction
 * @param {React.ReactNode} props.children  `<MenuItem>`s
 */
export function ContextMenu({ x, y, isOpen, onOpenChange, onAction, children }) {
  const anchorRef = useRef(null);

  return (
    <MenuTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      {/* Not a real interactive control — `Popover`'s `triggerRef` below is
          what actually positions the menu, this just marks where. */}
      <span ref={anchorRef} className={styles.anchor} style={{ left: x, top: y }} />

      <Popover triggerRef={anchorRef} placement="bottom start" className={styles.popover}>
        <Menu className={styles.menu} onAction={onAction}>
          {children}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
