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
 *
 * `isNonModal`: by default `Popover` renders a full-viewport `underlay` div
 * to catch outside clicks and close itself — which also swallows every other
 * pointer event on the page while open. Right-clicking a second tile while
 * this menu is still open would hit that underlay instead of the tile, so
 * the tile's own `contextmenu` handler (and its `preventDefault`) would
 * never run, and the browser's native menu would flash up before ours
 * replaced it. Non-modal drops the underlay — but React Aria also treats
 * `isNonModal` as "don't dismiss on outside interaction either" (see
 * `usePopover`'s `isDismissable: !isNonModal`), so outside-click-to-close is
 * reimplemented by hand below via a `pointerdown` listener.
 */

import { useEffect, useRef } from 'react';
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
  const popoverRef = useRef(null);

  // Outside-click-to-close, reimplemented by hand — see the file header
  // comment on why `isNonModal` leaves React Aria's own version disabled.
  // `pointerdown` (not `click`) so this fires before a right-click's own
  // `contextmenu` event on another tile, matching how the disabled built-in
  // behavior would have timed it.
  useEffect(() => {
    if (!isOpen) return undefined;

    function handlePointerDown(event) {
      if (!popoverRef.current?.contains(event.target)) onOpenChange(false);
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [isOpen, onOpenChange]);

  return (
    <MenuTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      {/* Not a real interactive control — `Popover`'s `triggerRef` below is
          what actually positions the menu, this just marks where. */}
      <span ref={anchorRef} className={styles.anchor} style={{ left: x, top: y }} />

      <Popover
        isNonModal
        ref={popoverRef}
        triggerRef={anchorRef}
        placement="bottom start"
        className={styles.popover}
      >
        <Menu className={styles.menu} onAction={onAction}>
          {children}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
