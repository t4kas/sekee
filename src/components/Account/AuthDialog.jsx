/**
 * AuthDialog
 * ---------------------------------------------------------------------------
 * The sign-in / sign-up modal. One component serves both jobs — `mode`
 * toggles which copy and which action is used — the same "one component,
 * two modes" shape `BookmarkDialog` uses for add vs. edit.
 *
 * Rendered once, at the top of `App.jsx`, alongside `BookmarkDialog`/
 * `ConfirmDialog` — not owned by `AccountControl`, because it now has two
 * unrelated trigger points (the account button, and favoriting a photo
 * while signed out). `App.jsx` owns the single `useAuth()` call for the
 * whole app and passes `signIn`/`signUp` down as props, rather than this
 * dialog calling `useAuth()` itself — see `useAuth.js`'s header comment for
 * why a second call site used to cause double session loads and racing
 * migrations.
 *
 * Reuses `BookmarkDialog.module.css` for the overlay/modal/dialog/heading/
 * form/footer chrome rather than redefining it, the same way `ConfirmDialog`
 * does — every modal in this app should look identical.
 */

import { useEffect, useState } from 'react';
import { Button as AriaButton, Dialog, Form, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from '../ui/Button.jsx';
import { TextField } from '../ui/TextField.jsx';
import dialogStyles from '../BookmarkDialog/BookmarkDialog.module.css';
import styles from './AuthDialog.module.css';

/**
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {(credentials: {email: string, password: string}) => Promise<object>} props.signIn
 * @param {(credentials: {email: string, password: string}) => Promise<{needsEmailConfirmation: boolean}>} props.signUp
 */
export function AuthDialog({ isOpen, onClose, signIn, signUp }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const isSignUp = mode === 'signup';

  // Reset to a clean form every time the dialog opens, so reopening it after
  // a previous attempt doesn't show stale input or errors.
  useEffect(() => {
    if (!isOpen) return;
    setMode('signin');
    setEmail('');
    setPassword('');
    setErrorMessage('');
    setSuccessMessage('');
  }, [isOpen]);

  function toggleMode() {
    setMode(isSignUp ? 'signin' : 'signup');
    setErrorMessage('');
    setSuccessMessage('');
  }

  async function handleSubmit(event) {
    // React Aria's Form still fires a normal submit event, so we stop the
    // browser's default page reload.
    event.preventDefault();
    setErrorMessage('');
    setIsSaving(true);

    try {
      if (isSignUp) {
        const { needsEmailConfirmation } = await signUp({ email, password });
        if (needsEmailConfirmation) {
          // Not actually signed in yet — Supabase is waiting on the
          // confirmation link, so keep the dialog open and say so instead
          // of closing as though sign-up finished.
          setSuccessMessage('Check your email to confirm your account, then sign in.');
        } else {
          onClose();
        }
      } else {
        await signIn({ email, password });
        onClose();
      }
    } catch (error) {
      // Supabase's own messages ("Invalid login credentials", "User already
      // registered") are readable enough to show directly, same as the
      // bookmark URL validation errors are shown directly today.
      setErrorMessage(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ModalOverlay
      className={dialogStyles.overlay}
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      isDismissable
    >
      <Modal className={dialogStyles.modal}>
        <Dialog className={dialogStyles.dialog}>
          <Heading slot="title" className={dialogStyles.heading}>
            {isSignUp ? 'Create account' : 'Sign in'}
          </Heading>

          {successMessage ? (
            <p className={styles.success}>{successMessage}</p>
          ) : (
            <Form className={dialogStyles.form} onSubmit={handleSubmit}>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(value) => {
                  setEmail(value);
                  if (errorMessage) setErrorMessage('');
                }}
                isRequired
                autoFocus
              />

              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(value) => {
                  setPassword(value);
                  if (errorMessage) setErrorMessage('');
                }}
                isRequired
                errorMessage={errorMessage}
              />

              <div className={dialogStyles.footer}>
                <Button variant="ghost" onPress={onClose}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" isDisabled={isSaving}>
                  {isSaving ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
                </Button>
              </div>
            </Form>
          )}

          {/* React Aria's own Button, not the styled wrapper — this is a
              text-link-styled toggle, not a bordered button, so it owns its
              styling outright rather than fighting the wrapper's variants. */}
          <AriaButton className={styles.toggle} onPress={toggleMode}>
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </AriaButton>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
