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
import { MobileSettings } from './MobileSettings.jsx';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
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
 * @param {(name: string) => Promise<void>} props.onCreateGroup
 * @param {(id: string, name: string) => Promise<void>} props.onRenameGroup
 * @param {(orderedIds: string[]) => void} props.onReorderGroups
 * @param {() => void} props.onExportBookmarks
 * @param {(file: File) => Promise<{imported: number, skipped: number, groupsCreated: number}>} props.onImportBookmarks
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
  onCreateGroup,
  onRenameGroup,
  onReorderGroups,
  onExportBookmarks,
  onImportBookmarks,
}) {
  const [activeTab, setActiveTab] = useState('account');
  // Phones get a drill-down instead of tabs (see MobileSettings.jsx), which
  // needs one extra thing tabs don't have: a state with *nothing* open, for
  // the menu itself. Kept separate from `activeTab` so that resizing across
  // the breakpoint mid-session doesn't strand either layout.
  const [openSectionId, setOpenSectionId] = useState(null);
  const isCompact = useMediaQuery('(max-width: 560px)');
  // Separate from `isOpen` above, same reason `App.jsx` keeps its own
  // AuthDialog state separate from the bookmark dialog's: this has its own
  // trigger (the Account tab's "Sign in" button) unrelated to anything else.
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);

  // One description of each section, shared by both layouts below — the
  // desktop tabs and the phone's drill-down render from this same array, so
  // adding a section is still a single entry rather than two.
  //
  // Building the panel elements up front costs nothing: an element is a
  // description, not a render. Only the open one is ever mounted, on either
  // layout.
  const sections = [
    {
      id: 'account',
      label: 'Account',
      icon: <UserIcon size={16} />,
      panel: <AccountTab user={user} signOut={signOut} onRequestSignIn={() => setIsAuthDialogOpen(true)} />,
    },
    {
      id: 'preferences',
      label: 'Preferences',
      icon: <SlidersIcon size={16} />,
      panel: <PreferencesTab settings={settings} onSettingsChange={onSettingsChange} />,
    },
    {
      id: 'personalisation',
      label: 'Personalisation',
      icon: <CameraIcon size={16} />,
      panel: (
        <PersonalisationTab
          settings={settings}
          onSettingsChange={onSettingsChange}
          onNewPhoto={onNewPhoto}
          user={user}
          favorites={favorites}
          removeFavorite={removeFavorite}
        />
      ),
    },
    {
      id: 'bookmarks',
      label: 'Bookmarks',
      icon: <BookmarkIcon size={16} />,
      panel: (
        <BookmarksTab
          settings={settings}
          onSettingsChange={onSettingsChange}
          groups={groups}
          onCreateGroup={onCreateGroup}
          onRenameGroup={onRenameGroup}
          onReorderGroups={onReorderGroups}
          onExportBookmarks={onExportBookmarks}
          onImportBookmarks={onImportBookmarks}
        />
      ),
    },
    {
      id: 'sync',
      label: 'Sync',
      icon: <CloudIcon size={16} />,
      panel: <SyncTab user={user} refreshBookmarks={refreshBookmarks} refreshSettings={refreshSettings} />,
    },
    {
      id: 'weather',
      label: 'Weather',
      icon: <SunIcon size={16} />,
      panel: <WeatherTab settings={settings} onSettingsChange={onSettingsChange} />,
    },
  ];

  return (
    <>
      <ModalOverlay
        /* `sheetOverlay` bottom-anchors this on a phone; the matching sheet
           treatment for the panel itself lives on `.modal` in this
           component's own stylesheet rather than the shared `.sheet`, since
           two single-class rules from different CSS modules would be left
           fighting on stylesheet order. */
        className={`${dialogStyles.overlay} ${dialogStyles.sheetOverlay}`}
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        isDismissable
      >
        <Modal className={styles.modal}>
          <Dialog className={styles.dialog} aria-label="Settings">
            {isCompact ? (
              <MobileSettings
                sections={sections}
                openSectionId={openSectionId}
                onNavigate={setOpenSectionId}
                user={user}
                onClose={onClose}
              />
            ) : (
              <>
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
                    {sections.map((section) => (
                      <Tab key={section.id} id={section.id} className={styles.tabButton}>
                        {section.icon}
                        {section.label}
                      </Tab>
                    ))}
                  </TabList>

                  {sections.map((section) => (
                    <TabPanel key={section.id} id={section.id} className={styles.content}>
                      {section.panel}
                    </TabPanel>
                  ))}
                </Tabs>
              </>
            )}
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
