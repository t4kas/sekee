/**
 * BookmarkDialog
 * ---------------------------------------------------------------------------
 * The add/edit form, shown in a modal. One component serves both jobs — if a
 * `bookmark` is passed in we're editing it, otherwise we're adding a new one.
 *
 * React Aria's modal stack does the fiddly accessibility work for us: it traps
 * focus inside the dialog, hides the rest of the page from screen readers,
 * closes on Escape, restores focus to whatever opened it, and prevents the
 * page behind from scrolling.
 *
 * The anatomy:
 *   <ModalOverlay>  the dimmed backdrop; owns open/closed state
 *     <Modal>       the positioned container (this is what we animate)
 *       <Dialog>    the labelled dialog itself
 */

import { useEffect, useState } from 'react';
import { Dialog, Form, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';
import { TextField } from '../ui/TextField.jsx';
import styles from './BookmarkDialog.module.css';

/**
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {object|null} props.bookmark  the bookmark being edited, or null to add
 * @param {{id: string, name: string}[]} props.groups
 * @param {string|null} props.defaultGroupId  preselected when adding — the currently active tab
 * @param {() => void} props.onClose
 * @param {(values: {title: string, url: string, groupId: string}) => Promise<void>} props.onSubmit
 */
export function BookmarkDialog({ isOpen, bookmark, groups, defaultGroupId, onClose, onSubmit }) {
  const isEditing = Boolean(bookmark);

  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [groupId, setGroupId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Refill the form each time the dialog opens. Without this, reopening it
  // would show whatever you typed last time.
  useEffect(() => {
    if (!isOpen) return;
    setTitle(bookmark?.title ?? '');
    setUrl(bookmark?.url ?? '');
    setGroupId(bookmark?.groupId ?? defaultGroupId ?? '');
    setErrorMessage('');
  }, [isOpen, bookmark, defaultGroupId]);

  async function handleSubmit(event) {
    // React Aria's Form still fires a normal submit event, so we stop the
    // browser's default page reload.
    event.preventDefault();
    setErrorMessage('');
    setIsSaving(true);

    try {
      await onSubmit({ title, url, groupId });
      onClose();
    } catch (error) {
      // The service throws for things like an unparseable URL. Show its
      // message on the URL field rather than dumping it to the console.
      setErrorMessage(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ModalOverlay
      className={styles.overlay}
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      /* Clicking the backdrop closes the dialog, same as Escape. */
      isDismissable
    >
      <Modal className={styles.modal}>
        <Dialog className={styles.dialog}>
          {/* React Aria automatically wires this Heading up as the dialog's
              accessible name via aria-labelledby. */}
          <Heading slot="title" className={styles.heading}>
            {isEditing ? 'Edit bookmark' : 'Add bookmark'}
          </Heading>

          <Form className={styles.form} onSubmit={handleSubmit}>
            <TextField
              label="Title"
              value={title}
              onChange={setTitle}
              description="Leave blank to use the site's domain"
              /* Autofocus the first field — for adding, the URL is the field
                 you actually care about, so focus that instead. */
              autoFocus={isEditing}
            />

            <TextField
              label="URL"
              value={url}
              /* Clearing the error as soon as the field is edited isn't just
                 politeness: React Aria's Form uses native constraint
                 validation, so while the field is marked invalid it refuses
                 to submit. Without this, fixing a bad URL and pressing the
                 button would appear to do nothing. */
              onChange={(value) => {
                setUrl(value);
                if (errorMessage) setErrorMessage('');
              }}
              isRequired
              placeholder="example.com"
              errorMessage={errorMessage}
              autoFocus={!isEditing}
            />

            <Select label="Group" items={groups} selectedKey={groupId} onSelectionChange={setGroupId} />

            <div className={styles.footer}>
              <Button variant="ghost" onPress={onClose}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" isDisabled={isSaving}>
                {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Add bookmark'}
              </Button>
            </div>
          </Form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
