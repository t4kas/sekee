/**
 * Switch
 * ---------------------------------------------------------------------------
 * A thin styled wrapper around React Aria's `Switch`, for an on/off
 * preference that takes effect immediately rather than needing a form
 * submit — see `AITab.jsx`'s "Save to account" toggle for the first use.
 *
 * Same shape as `Button.jsx`: React Aria handles the accessible checkbox
 * input and exposes `data-selected`/`data-focus-visible`/`data-disabled` on
 * the root label, and `Switch.module.css` styles the track/thumb from those
 * instead of a real checked/:focus.
 */

import { Switch as AriaSwitch } from 'react-aria-components';
import styles from './Switch.module.css';

/**
 * @param {object} props
 * @param {import('react').ReactNode} [props.children] the visible label
 * @param {...any} props rest is forwarded to React Aria's Switch
 *                       (isSelected, onChange, isDisabled, ...)
 */
export function Switch({ children, ...props }) {
  return (
    <AriaSwitch {...props} className={styles.switch}>
      <div className={styles.track}>
        <div className={styles.thumb} />
      </div>
      {children && <span className={styles.label}>{children}</span>}
    </AriaSwitch>
  );
}
