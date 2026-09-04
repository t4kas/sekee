/**
 * SettingsModal
 * ---------------------------------------------------------------------------
 * The gear button in the header opens this: a big modal with a sidebar of
 * category tabs on the left and that tab's controls on the right — replaces
 * the old small `SettingsPopover`. Built for exactly the tabs it has today
 * (Account, Preferences, Personalisation, Bookmarks, Sync, Weather); adding
 * another later is a one-line addition to the `<Tab>`/`<TabPanel>` pairs
 * below, not a redesign.
 *
 * Reuses `BookmarkDialog.module.css`'s `.overlay` for the dimmed/blurred
 * backdrop — every modal in this app shares that — but defines its own
 * wider `.modal`/`.dialog` here, since the shared ones cap at 420px with no
 * internal structure.
 *
 * TABS: React Aria's `Tabs`/`TabList`/`Tab`/`TabPanel` rather than hand-rolled
 * buttons + conditional rendering — it gives roving-tabindex keyboard nav
 * (arrow keys between tabs) and `data-selected` styling for free. Active tab
 * is a plain `useState`, intentionally not reset when the modal closes — if
 * you were last looking at Weather, reopening Settings back on Weather is
 * more useful than always snapping back to Account.
 *
 * NESTED MODAL: the Account tab's "Sign in" button opens `AuthDialog` on top
 * of this already-open modal — the exact same stacked-modal pattern
 * `FavoritesGallery` already used from the old `SettingsPopover`. React Aria
 * handles the focus trap and Escape-closes-the-top-one behaviour natively.
 */

import { useState } from 'react';
import {
  Button as AriaButton,
  Dialog,
  Heading,
  Modal,
  ModalOverlay,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from 'react-aria-components';
import { BookmarkIcon, CameraIcon, CloseIcon, CloudIcon, SlidersIcon, SunIcon, UserIcon } from '../ui/icons.jsx';
import { AuthDialog } from '../Account/AuthDialog.jsx';
import { AccountTab } from './AccountTab.jsx';
import { PreferencesTab } from './PreferencesTab.jsx';
import { PersonalisationTab } from './PersonalisationTab.jsx';
import { BookmarksTab } from './BookmarksTab.jsx';
import { SyncTab } from './SyncTab.jsx';
import { WeatherTab } from './WeatherTab.jsx';
import dialogStyles from '../BookmarkDialog/BookmarkDialog.module.css';
import styles from './SettingsModal.module.css';

/**
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {object} props.settings
 * @param {(changes: object) => void} props.onSettingsChange
 * @param {() => void} props.onNewPhoto
 * @param {object|null} props.user
 * @param {Photo[]} props.favorites
 * @param {(photoId: string) => void} props.removeFavorite
 * @param {(credentials: {email: string, password: string}) => Promise<object>} props.signIn
 * @param {(credentials: {email: string, password: string}) => Promise<{needsEmailConfirmation: boolean}>} props.signUp
 * @param {() => Promise<void>} props.signOut
 * @param {() => void} props.refreshBookmarks
 * @param {() => void} props.refreshSettings
 * @param {{id: string, name: string}[]} props.groups
 * @param {(orderedIds: string[]) => void} props.onReorderGroups
 */
export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  onNewPhoto,
  user,
  favorites,
  removeFavorite,
  signIn,
  signUp,
  signOut,
  refreshBookmarks,
  refreshSettings,
  groups,
  onReorderGroups,
}) {
  const [activeTab, setActiveTab] = useState('account');
  // Separate from `isOpen` above, same reason `App.jsx` keeps its own
  // AuthDialog state separate from the bookmark dialog's: this has its own
  // trigger (the Account tab's "Sign in" button) unrelated to anything else.
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);

  return (
    <>
      <ModalOverlay
        className={dialogStyles.overlay}
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        isDismissable
      >
        <Modal className={styles.modal}>
          <Dialog className={styles.dialog} aria-label="Settings">
            <div className={styles.header}>
              <Heading slot="title" className={styles.heading}>
                Settings
              </Heading>
              <AriaButton className={styles.closeButton} aria-label="Close" onPress={onClose}>
                <CloseIcon size={18} />
              </AriaButton>
            </div>

            <Tabs className={styles.body} selectedKey={activeTab} onSelectionChange={setActiveTab}>
              <TabList className={styles.sidebar} aria-label="Settings sections">
                <Tab id="account" className={styles.tabButton}>
                  <UserIcon size={16} />
                  Account
                </Tab>
                <Tab id="preferences" className={styles.tabButton}>
                  <SlidersIcon size={16} />
                  Preferences
                </Tab>
                <Tab id="personalisation" className={styles.tabButton}>
                  <CameraIcon size={16} />
                  Personalisation
                </Tab>
                <Tab id="bookmarks" className={styles.tabButton}>
                  <BookmarkIcon size={16} />
                  Bookmarks
                </Tab>
                <Tab id="sync" className={styles.tabButton}>
                  <CloudIcon size={16} />
                  Sync
                </Tab>
                <Tab id="weather" className={styles.tabButton}>
                  <SunIcon size={16} />
                  Weather
                </Tab>
              </TabList>

              <TabPanel id="account" className={styles.content}>
                <AccountTab user={user} signOut={signOut} onRequestSignIn={() => setIsAuthDialogOpen(true)} />
              </TabPanel>

              <TabPanel id="preferences" className={styles.content}>
                <PreferencesTab settings={settings} onSettingsChange={onSettingsChange} />
              </TabPanel>

              <TabPanel id="personalisation" className={styles.content}>
                <PersonalisationTab
                  settings={settings}
                  onSettingsChange={onSettingsChange}
                  onNewPhoto={onNewPhoto}
                  user={user}
                  favorites={favorites}
                  removeFavorite={removeFavorite}
                />
              </TabPanel>

              <TabPanel id="bookmarks" className={styles.content}>
                <BookmarksTab
                  settings={settings}
                  onSettingsChange={onSettingsChange}
                  groups={groups}
                  onReorderGroups={onReorderGroups}
                />
              </TabPanel>

              <TabPanel id="sync" className={styles.content}>
                <SyncTab user={user} refreshBookmarks={refreshBookmarks} refreshSettings={refreshSettings} />
              </TabPanel>

              <TabPanel id="weather" className={styles.content}>
                <WeatherTab settings={settings} onSettingsChange={onSettingsChange} />
              </TabPanel>
            </Tabs>
          </Dialog>
        </Modal>
      </ModalOverlay>

      <AuthDialog
        isOpen={isAuthDialogOpen}
        onClose={() => setIsAuthDialogOpen(false)}
        signIn={signIn}
        signUp={signUp}
      />
    </>
  );
}
