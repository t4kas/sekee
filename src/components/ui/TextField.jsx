/**
 * TextField
 * ---------------------------------------------------------------------------
 * A labelled text input built on React Aria's `TextField`.
 *
 * The win over a hand-rolled <label> + <input> is that React Aria wires the
 * label, description and error message to the input with the right `id`s and
 * `aria-describedby`/`aria-invalid` attributes, so screen readers announce
 * validation errors properly without us thinking about it.
 */

import {
  FieldError,
  Input,
  Label,
  Text,
  TextField as AriaTextField,
} from 'react-aria-components';
import styles from './TextField.module.css';

/**
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.description] helper text under the input
 * @param {string} [props.errorMessage] shown instead of the description when set
 * @param {...any} props rest is forwarded to React Aria's TextField
 *                       (value, onChange, isRequired, autoFocus, ...)
 */
export function TextField({ label, description, errorMessage, ...props }) {
  return (
    <AriaTextField
      {...props}
      className={styles.field}
      // Passing `isInvalid` explicitly (rather than relying on the browser's
      // own validation) lets us show errors thrown by the bookmarks service,
      // e.g. "that doesn't look like a valid URL".
      isInvalid={Boolean(errorMessage)}
    >
      <Label className={styles.label}>{label}</Label>
      <Input className={styles.input} />

      {description && !errorMessage && (
        <Text slot="description" className={styles.description}>
          {description}
        </Text>
      )}

      {/* FieldError only renders when the field is invalid. */}
      <FieldError className={styles.error}>{errorMessage}</FieldError>
    </AriaTextField>
  );
}
