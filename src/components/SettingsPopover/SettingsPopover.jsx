/**
 * SettingsPopover
 * ---------------------------------------------------------------------------
 * The gear button in the top-right corner and the panel it opens: search
 * engine, background category, and a button to pull a fresh photo.
 *
 * `DialogTrigger` is the piece doing the work here — it pairs a trigger button
 * with an overlay, handles the open/closed state, positions the popover
 * against the button (flipping it if it would run off-screen), moves focus in
 * and back out again, and closes on Escape or an outside click.
 *
 * It's a `Dialog` inside the `Popover` rather than bare content because the
 * panel holds interactive controls: that gives it the right role and makes
 * focus behave the way people expect.
 */

import { Button as AriaButton, Dialog, DialogTrigger, Popover } from 'react-aria-components';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';
import { RefreshIcon, SettingsIcon } from '../ui/icons.jsx';
import { SEARCH_ENGINES } from '../../services/searchEngines.js';
import { BACKGROUND_CATEGORIES } from '../../services/backgroundCategories.js';
import { isUnsplashConfigured } from '../../services/unsplashService.js';
import styles from './SettingsPopover.module.css';

/**
 * @param {object} props
 * @param {{engineId: string, categoryId: string}} props.settings
 * @param {(changes: object) => void} props.onSettingsChange
 * @param {() => void} props.onNewPhoto  discards the cached photos and reloads
 */
export function SettingsPopover({ settings, onSettingsChange, onNewPhoto }) {
  return (
    <DialogTrigger>
      {/* React Aria's own Button, not our wrapper, so DialogTrigger can pass
          it the props that link it to the popover. */}
      <AriaButton className={styles.trigger} aria-label="Settings">
        <SettingsIcon size={19} />
      </AriaButton>

      {/* `bottom end` = below the button, right edges aligned. */}
      <Popover className={styles.popover} placement="bottom end" offset={8}>
        <Dialog className={styles.dialog} aria-label="Settings">
          <Select
            label="Search engine"
            items={SEARCH_ENGINES}
            selectedKey={settings.engineId}
            onSelectionChange={(engineId) => onSettingsChange({ engineId })}
          />

          <Select
            label="Background"
            items={BACKGROUND_CATEGORIES}
            selectedKey={settings.categoryId}
            onSelectionChange={(categoryId) => onSettingsChange({ categoryId })}
          />

          <Button className={styles.newPhoto} onPress={onNewPhoto}>
            <RefreshIcon size={16} />
            New photo
          </Button>

          {/* Only shown when there's no API key, so it reads as a hint the
              first time you run the app rather than permanent clutter. */}
          {!isUnsplashConfigured && (
            <p className={styles.hint}>
              Using the bundled gradients. Add an Unsplash key to{' '}
              <code>.env.local</code> for photo backgrounds — see the README.
            </p>
          )}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
