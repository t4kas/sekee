/**
 * CustomBackgrounds
 * ---------------------------------------------------------------------------
 * The Personalisation tab's "Uploads" sub-tab: pick an image from this
 * device, and manage the ones already uploaded. Sits beside `FavoritesGrid`
 * and works the same way — a grid of thumbnails, click to select, a remove
 * button per tile — with two differences that come from where the images
 * live (the user's own Drive or Dropbox, see `customBackgroundService.js`):
 *
 *  1. THE THUMBNAIL URLS ARE BORROWED. They're resolved by
 *     `useCustomBackgroundThumbnails` while this component is mounted and
 *     released when it isn't, which is why the grid renders an empty tile
 *     (on the record's own name) until its URL lands, rather than assuming
 *     every image has a `src` to begin with.
 *  2. THERE'S A PROVIDER TO CONNECT FIRST. With no storage linked there's
 *     nowhere to put an upload, so the tab says so and points at the Files
 *     tab instead of showing a button that can only fail.
 *
 * Selecting a tile writes BOTH `categoryId: 'custom'` and
 * `customBackgroundId` — picking a wallpaper should show that wallpaper,
 * not silently arm a choice that only takes effect once you also change the
 * Background dropdown. Clicking the selected one again clears the pin back
 * to "shuffle among all of them", which is the only way to reach that state.
 */

import { useRef, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Button } from '../ui/Button.jsx';
import { Tooltip } from '../ui/Tooltip.jsx';
import { TrashIcon, UploadIcon } from '../ui/icons.jsx';
import { useCustomBackgroundThumbnails } from '../../hooks/useCustomBackgrounds.js';
import { ACCEPTED_IMAGE_TYPES } from '../../services/customBackgroundService.js';
import { DEFAULT_CATEGORY_ID } from '../../services/backgroundCategories.js';
import styles from './CustomBackgrounds.module.css';

/**
 * @param {object} props
 * @param {{categoryId: string, customBackgroundId: string|null}} props.settings
 * @param {(changes: object) => void} props.onSettingsChange
 * @param {object} props.custom the `useCustomBackgrounds` result — see App.jsx
 * @param {string|null} props.connectedProviderId the linked provider, or null
 * @param {string|null} props.storageLabel e.g. "Dropbox", for the hint text
 */
export function CustomBackgrounds({
  settings,
  onSettingsChange,
  custom,
  connectedProviderId,
  storageLabel,
}) {
  const fileInputRef = useRef(null);
  const [uploadError, setUploadError] = useState(null);
  const thumbnails = useCustomBackgroundThumbnails(custom.backgrounds);

  const isShowingUploads = settings.categoryId === 'custom';

  async function handleFileSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // lets picking the same file twice re-fire onChange
    if (!file) return;

    setUploadError(null);
    try {
      const added = await custom.upload(file);
      // Show it straight away — see the header comment.
      onSettingsChange({ categoryId: 'custom', customBackgroundId: added.id });
    } catch (error) {
      setUploadError(error);
    }
  }

  function handleSelect(id) {
    onSettingsChange({
      categoryId: 'custom',
      customBackgroundId: isShowingUploads && settings.customBackgroundId === id ? null : id,
    });
  }

  async function handleRemove(background) {
    setUploadError(null);
    try {
      const remaining = await custom.remove(background.id);

      // Don't leave the settings pointing at a record that's gone — and with
      // nothing left at all, come off the sentinel entirely, so the next load
      // isn't a category photo pretending to be an upload.
      //
      // One call, not two: `saveSettings` reads-modifies-writes, so two
      // overlapping changes can lose the first one (see settingsService.js).
      const changes = {};
      if (settings.customBackgroundId === background.id) changes.customBackgroundId = null;
      if (remaining.length === 0 && isShowingUploads) changes.categoryId = DEFAULT_CATEGORY_ID;
      if (Object.keys(changes).length > 0) onSettingsChange(changes);
    } catch (error) {
      setUploadError(error);
    }
  }

  if (!connectedProviderId) {
    return (
      <p className={styles.empty}>
        Uploading a background needs somewhere to put it. Connect Google Drive or Dropbox on the
        Files tab — the image goes into your own account, on your own storage.
      </p>
    );
  }

  return (
    <>
      <Button
        className={styles.uploadButton}
        onPress={() => fileInputRef.current?.click()}
        isDisabled={custom.isUploading}
      >
        <UploadIcon size={16} />
        {custom.isUploading ? 'Uploading…' : 'Upload an image'}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        className={styles.hiddenFileInput}
        onChange={handleFileSelected}
      />

      {uploadError && <p className={styles.error}>{uploadError.message}</p>}

      {custom.backgrounds.length === 0 ? (
        <p className={styles.empty}>
          No uploads yet. Anything you add goes into your {storageLabel ?? 'linked storage'} — this
          app never keeps a copy.
        </p>
      ) : (
        <>
          <div className={styles.grid}>
            {custom.backgrounds.map((background) => {
              const isSelected = isShowingUploads && settings.customBackgroundId === background.id;
              const url = thumbnails[background.id];

              return (
                <div key={background.id} className={styles.tile}>
                  <button
                    type="button"
                    className={[styles.thumb, isSelected && styles.selected].filter(Boolean).join(' ')}
                    onClick={() => handleSelect(background.id)}
                    aria-pressed={isSelected}
                    title={background.name}
                  >
                    {url ? (
                      <img src={url} alt={background.name} className={styles.image} />
                    ) : (
                      /* Either still resolving, or stored somewhere this
                         device can't reach — the name is all there is. The
                         second case is worth saying out loud, since the
                         records sync between devices but the images don't:
                         they're in whichever account they were uploaded to. */
                      <span className={styles.placeholder}>
                        {background.name}
                        {background.providerId !== connectedProviderId && (
                          <span className={styles.placeholderNote}>
                            not in {storageLabel ?? 'this storage'}
                          </span>
                        )}
                      </span>
                    )}
                  </button>

                  <Tooltip label="Delete">
                    <AriaButton
                      className={styles.remove}
                      aria-label={`Delete ${background.name}`}
                      onPress={() => handleRemove(background)}
                    >
                      <TrashIcon size={14} />
                    </AriaButton>
                  </Tooltip>
                </div>
              );
            })}
          </div>

          <p className={styles.hint}>
            {isShowingUploads && !settings.customBackgroundId
              ? 'Shuffling between your uploads. Click one to always show it.'
              : 'Click the selected image again to shuffle between all of them instead.'}
          </p>
        </>
      )}
    </>
  );
}
