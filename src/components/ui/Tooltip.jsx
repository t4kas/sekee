/**
 * Tooltip
 * ---------------------------------------------------------------------------
 * Wraps a single icon-only trigger — the small text label a sighted mouse
 * user doesn't otherwise get, for buttons whose icon alone doesn't say what
 * pressing them does (a plain "+", a pencil, a heart). Buttons that already
 * carry visible text ("Add bookmark", "New photo", ...) don't need one; the
 * `aria-label` already required for those icon-only buttons anyway becomes
 * this tooltip's content, one string doing both jobs.
 *
 * `delay={400}` (React Aria's default is 1500ms) — short enough that
 * hovering across a row of these icon buttons actually shows each label
 * before the pointer moves on, without popping up as instantly as a native
 * `title` would.
 *
 * COMPOSITION: like `TooltipTrigger`/`DialogTrigger` (see CLAUDE.md), a
 * `TooltipTrigger` wrapping a `MenuTrigger`/`DialogTrigger` trigger works;
 * the reverse doesn't (both hand the child props via context, and the inner
 * one wins). Not a concern for any of this app's current tooltips — none of
 * them wrap a menu/dialog trigger — but worth remembering before adding one
 * that does.
 */

import { Tooltip as AriaTooltip, TooltipTrigger } from 'react-aria-components';
import styles from './Tooltip.module.css';

/**
 * @param {object} props
 * @param {string} props.label
 * @param {'top' | 'bottom' | 'left' | 'right'} [props.placement]
 * @param {React.ReactNode} props.children  the single trigger element
 */
export function Tooltip({ label, placement = 'bottom', children }) {
  return (
    <TooltipTrigger delay={400}>
      {children}
      <AriaTooltip className={styles.tooltip} placement={placement} offset={6}>
        {label}
      </AriaTooltip>
    </TooltipTrigger>
  );
}
