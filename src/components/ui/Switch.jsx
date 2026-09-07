/**
 * Switch
 * ---------------------------------------------------------------------------
 * A labelled on/off toggle built on React Aria's `Switch` — same reasoning
 * as `TextField.jsx`: it wires the label to the control and exposes
 * `data-selected`/`data-focus-visible`/`data-disabled` for free, so the
 * styling here only has to draw a track and a thumb.
 */

import { Switch as AriaSwitch } from 'react-aria-components';
import styles from './Switch.module.css';

/**
 * @param {object} props
 * @param {boolean} props.isSelected
 * @param {(isSelected: boolean) => void} props.onChange
 * @param {string} props.label
 * @param {string} [props.description] helper text under the label
 * @param {boolean} [props.isDisabled]
 */
export function Switch({ label, description, ...props }) {
  return (
    <AriaSwitch className={styles.field} {...props}>
      <div className={styles.track}>
        <div className={styles.thumb} />
      </div>
      <div className={styles.text}>
        <span className={styles.label}>{label}</span>
        {description && <span className={styles.description}>{description}</span>}
      </div>
    </AriaSwitch>
  );
}
