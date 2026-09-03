/**
 * ConfirmDialog
 * ---------------------------------------------------------------------------
 * A small "are you sure?" modal, used before deleting a bookmark.
 *
 * `role="alertdialog"` is the right role for a destructive confirmation:
 * screen readers announce it more assertively than a plain dialog.
 *
 * Note it reuses BookmarkDialog's stylesheet rather than duplicating the
 * overlay/modal styles — the two dialogs should look identical.
 */

import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from '../ui/Button.jsx';
import styles from './BookmarkDialog.module.css';
import confirmStyles from './ConfirmDialog.module.css';

/**
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {string} props.title
 * @param {string} props.message
 * @param {string} [props.confirmLabel]
 * @param {() => void} props.onConfirm
 * @param {() => void} props.onClose
 */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onClose,
}) {
  return (
    <ModalOverlay
      className={styles.overlay}
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      isDismissable
    >
      <Modal className={styles.modal}>
        <Dialog className={styles.dialog} role="alertdialog">
          <Heading slot="title" className={styles.heading}>
            {title}
          </Heading>

          <p className={confirmStyles.message}>{message}</p>

          <div className={styles.footer}>
            <Button variant="ghost" onPress={onClose}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onPress={() => {
                onConfirm();
                onClose();
              }}
              /* Focus the confirm button so Enter completes the action —
                 but Escape and the backdrop still cancel. */
              autoFocus
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
