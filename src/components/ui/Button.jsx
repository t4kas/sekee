/**
 * Button
 * ---------------------------------------------------------------------------
 * A thin styled wrapper around React Aria's `Button`.
 *
 * React Aria gives us the accessibility and interaction behaviour (proper
 * focus handling, keyboard activation, press states that work with touch and
 * mouse alike) and ships no styling at all. So all we add here is a class
 * name and a `variant`.
 *
 * React Aria sets data attributes on the DOM node as its state changes —
 * `data-hovered`, `data-pressed`, `data-focus-visible`, `data-disabled` —
 * and `Button.module.css` styles against those instead of CSS pseudo-classes.
 * That's what makes a keyboard-only focus ring possible.
 */

import { Button as AriaButton } from 'react-aria-components';
import styles from './Button.module.css';

/**
 * @param {object} props
 * @param {'default'|'primary'|'ghost'|'icon'|'danger'} [props.variant]
 */
export function Button({ variant = 'default', className, ...props }) {
  return (
    <AriaButton
      {...props}
      className={[styles.button, styles[variant], className].filter(Boolean).join(' ')}
    />
  );
}
