/**
 * MobileSettings
 * ---------------------------------------------------------------------------
 * Settings as a phone sees them: an account card, a menu of sections, and a
 * page that slides in when you pick one — the shape iOS Settings uses, and
 * the one a thumb can actually work with. `SettingsModal` renders this
 * instead of its tab layout below the breakpoint; both are fed the same
 * `sections` array, so a section is only ever described once.
 *
 * BOTH PAGES STAY MOUNTED, side by side in a clipped track that slides. The
 * alternative — swapping which page is rendered — means the outgoing one is
 * gone before it can animate, and you're left reaching for mount/unmount
 * timing to fake it. Here the transition is one `transform` on the track and
 * the browser does the rest, which also makes an interrupted tap (back
 * before the push finishes) reverse cleanly instead of jumping.
 *
 * The page that isn't showing is `inert`, so nothing in it can be tabbed to
 * or read out while it sits off to the side.
 */
import { Button as AriaButton } from 'react-aria-components';
import { ChevronDownIcon, CloseIcon } from '../ui/icons.jsx';
import { isSupabaseConfigured } from '../../services/supabaseClient.js';
import styles from './SettingsModal.module.css';

/**
 * @param {object} props
 * @param {{id: string, label: string, icon: JSX.Element, panel: JSX.Element}[]} props.sections
 * @param {string|null} props.openSectionId  null shows the menu
 * @param {(id: string|null) => void} props.onNavigate
 * @param {object|null} props.user
 * @param {() => void} props.onClose
 */
export function MobileSettings({ sections, openSectionId, onNavigate, user, onClose }) {
  const openSection = sections.find((section) => section.id === openSectionId) ?? null;

  // The account card stands in for the Account row, the way the Apple ID
  // card does — so it's pulled out of the menu rather than listed twice.
  const account = sections.find((section) => section.id === 'account');
  const menu = sections.filter((section) => section.id !== 'account');

  return (
    <div className={styles.mobile}>
      <div className={styles.mobileHeader}>
        {openSection ? (
          <>
            <AriaButton className={styles.backButton} onPress={() => onNavigate(null)}>
              {/* The shared chevron points down; a quarter turn makes it the
                  back arrow, rather than adding a near-duplicate icon. */}
              <ChevronDownIcon size={18} className={styles.backChevron} />
              Settings
            </AriaButton>
            <span className={styles.mobileTitle}>{openSection.label}</span>
          </>
        ) : (
          <span className={styles.mobileHeading}>Settings</span>
        )}

        <AriaButton className={styles.closeButton} aria-label="Close" onPress={onClose}>
          <CloseIcon size={18} />
        </AriaButton>
      </div>

      <div className={styles.pages} data-open={openSection ? '' : undefined}>
        <div className={styles.page} inert={Boolean(openSection)}>
          {account && (
            <button type="button" className={styles.accountCard} onClick={() => onNavigate('account')}>
              <span className={styles.accountAvatar} aria-hidden="true">
                {user ? (user.email?.[0] ?? '?').toUpperCase() : <span className={styles.accountAvatarIcon}>{account.icon}</span>}
              </span>
              <span className={styles.accountText}>
                <span className={styles.accountName}>{user ? user.email : 'Account'}</span>
                <span className={styles.accountMeta}>
                  {user
                    ? 'Signed in — bookmarks and settings sync'
                    : isSupabaseConfigured
                      ? 'Sign in to sync across devices'
                      : 'Stored on this device only'}
                </span>
              </span>
              <ChevronDownIcon size={16} className={styles.rowChevron} />
            </button>
          )}

          <div className={styles.menu}>
            {menu.map((section) => (
              <button
                key={section.id}
                type="button"
                className={styles.menuRow}
                onClick={() => onNavigate(section.id)}
              >
                <span className={styles.menuIcon}>{section.icon}</span>
                <span className={styles.menuLabel}>{section.label}</span>
                <ChevronDownIcon size={16} className={styles.rowChevron} />
              </button>
            ))}
          </div>
        </div>

        <div className={styles.page} inert={!openSection}>
          {/* Only the open section's panel is built. The pages both stay
              mounted for the slide, but their *contents* needn't — and some
              of these tabs do real work on mount. */}
          <div className={styles.content}>{openSection?.panel}</div>
        </div>
      </div>
    </div>
  );
}
