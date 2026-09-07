# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev      # dev server on :5173
npm run build    # production build into dist/
npm run preview  # serve the built dist/ locally
npm run lint     # oxlint
```

**There is no test framework.** `npm run lint` and `npm run build` are the only
automated checks — there is no `npm test`, and therefore no way to "run a single
test". Behavioural changes have to be verified by driving the running app in a
browser. Both checks are fast; run them before committing.

Every `VITE_*` key is optional and each one gates a feature: without
`VITE_UNSPLASH_ACCESS_KEY` backgrounds fall back to bundled gradients, and
without the Supabase / Dropbox / Google keys those sync destinations aren't
offered at all. So the app runs fine unkeyed — but those code paths are then
never exercised, and "works for me" may only mean "works with nothing
configured". Vite reads env files only at startup, so restart the dev server
after editing them.

## Architecture

A personal new-tab page: React + Vite (plain JS), `react-aria-components` for
UI primitives, CSS Modules for styling. No router — a single page.
`README.md` has the directory tree and setup instructions; this file covers
what isn't visible from the structure.

Two persistence systems that are deliberately kept apart, and are the thing
most likely to get conflated:

- **Structured data** (bookmarks, groups, settings, favorites) — `localStorage`,
  or Supabase when signed in. See "Storage destinations".
- **Files** (images, avatars, attachments) — Supabase Storage or the user's own
  Drive/Dropbox. See "File storage".

Connecting cloud storage does not move bookmarks, and signing in does not
decide where files go.

### The layering rule

```
components  →  hooks  →  services  →  storage
```

Components never read or write storage directly. Keep it that way — it's what
makes the persistence layer swappable.

Every service function is `async` even though `localStorage` is synchronous.
That is deliberate: components already `await` their data and handle loading
states, so a remote backend doesn't touch the UI. An adapter needs four
methods — `read`, `write`, `remove`, `subscribe` — plus `isRemote: true` if it
stores data anywhere but this device.

### Storage destinations

`storage` in `src/services/storage.js` is a fixed-identity object delegating
to whichever adapter is active; `setActiveAdapter` swaps it and re-points
every live `subscribe()` at the new one. `useSync.js` is the only caller, and
it chooses between `createLocalStorageAdapter()` and `createSupabaseAdapter`.

Two rules that are easy to break:

- **`useAuth` handles authentication and nothing else.** Which adapter is
  active is `useSync`'s job. They used to be one hook, and merging them again
  puts the migration back on the auth path.
- **Supabase stays wrapped in `createCachedRemoteAdapter`.** Unwrapped, every
  signed-in read is a Postgres round-trip on the first paint of a new-tab
  page, and `recordBookmarkOpened` — which rewrites the whole bookmarks blob
  on every bookmark click — becomes one write per click. The wrapper serves
  reads from a local mirror, revalidates in the background (which is also the
  only cross-device update mechanism, since the Supabase adapter's `subscribe`
  is a no-op), and debounces writes. Its consequence: `write` resolves before
  the upload happens, so failures reach `onFlushError` — surfaced in the Sync
  tab — rather than the caller's `try`/`catch`.

`DeviceLocalKeys` (photo pool, both weather caches) never leave the device.
`favoritesService.js` deliberately doesn't use `storage` — it calls
`getRemoteAdapter()` and refuses when there isn't one, so "no account means no
favorites" holds by construction rather than by convention.

### File storage

`getStore(scope)` in `fileStorageService.js` is the only way to reach a file
store, and the scope — not a provider name — is the decision:

- `shared` → Supabase Storage. **The only store that can produce a permanent
  public URL**, so anything another person's browser fetches (avatars) must go
  here. Paths are `<userId>/<name>`; the RLS policies key off that first
  segment, so getting the prefix wrong is rejected by Postgres.
- `personal` → the user's linked Drive/Dropbox, registered by
  `useFileProvider`. Their quota, their files.

**Never persist a URL from the personal store.** Dropbox links expire in
hours; Drive returns a tab-lifetime `blob:` handle, because serving a
`drive.file` file to an `<img>` would require sharing it. Persist the path and
re-resolve. `store.hasStableUrls` is the check, and `releaseViewUrl` is a
no-op on stores that don't need it so callers can always call it.

Adding a provider means one entry in `fileProviders.js` plus a store
implementing the contract at the top of `dropboxFileStore.js`.

### React Aria composition constraints

These cost real debugging time and are easy to reintroduce. Each is load-bearing
where it appears.

- **A `Button` inside a `SearchField` is that field's *clear* button.** This is
  why the search pill is a plain `.bar` div with the logo, `SearchField`, and
  submit button as siblings — nesting the submit inside would wipe the query
  instead of searching.
- **`TooltipTrigger` must wrap `DialogTrigger`, not the reverse.** Both hand
  props to the button through context and the inner one wins, so a tooltip on
  the inside swallows the props linking the button to its popover.
- **`GridListItem`'s `href` prop does not render an `<a>`.** It renders
  `div[data-href]` and synthesises navigation, costing middle-click, "Open link
  in new tab", and the status-bar URL preview. Bookmark tiles therefore contain
  a real `<a>`, with the action buttons as *siblings* of it (a `<button>` inside
  an `<a>` is invalid HTML). React Aria puts both in the same gridcell.
- **Arrow keys focus the row, not the anchor inside it**, so Enter needs an
  explicit `onAction` on each item. `focusMode="child"` does *not* change this —
  it was tried and removed as a no-op.
- **`[data-hovered]` is not set on a `GridListItem`** when `selectionMode="none"`
  and the item has no `href`. Use plain CSS `:hover` for row hover styling.
- **React Aria filters unknown DOM props.** An `onKeyDown` passed to
  `GridListItem` never reaches the DOM; use the component's own callbacks.
- **`Form` uses native constraint validation.** While a field is marked
  `isInvalid` the form silently refuses to submit, so a validation error must be
  cleared when the user edits the field — otherwise fixing a bad value appears
  to do nothing.

### Styling

`src/styles/tokens.css` holds every colour, size, radius and duration as CSS
variables; components reference tokens rather than literals. `global.css` is a
reset plus the focus fallback. Everything else is a `*.module.css` beside its
component.

Two specificity traps:

- `global.css` loads last, so its `:focus-visible` fallback would beat a
  component's own `outline: none` at equal specificity. `[data-rac]:focus-visible
  { outline: none }` exists to stop that — React Aria components style their own
  focus via data attributes.
- When a component needs to fully restyle a button's size and shape, it uses
  React Aria's `Button` directly rather than the `ui/Button.jsx` wrapper. Mixing
  them leaves two single-class rules of equal specificity fighting, with the
  winner decided by stylesheet order. `SearchBar` and `SettingsModal` both do
  this deliberately.

`useBackgroundTone` measures the background photo and App stamps
`data-bg-tone="light"` on its own wrapper when it's bright, which flips a
second palette in `tokens.css` — dark text on dark glass, plus a light scrim —
so the search bar, widgets, group tabs and bookmark tiles don't turn into white
on white. Two consequences: **a new on-photo surface must be built from the
tokens**, not from literal whites, or it won't follow; and the attribute is on
the wrapper rather than `:root` deliberately, so the portalled dialogs, menus
and tooltips outside it stay dark (they cover the photo entirely, so its
brightness says nothing about what they need). `.app` also re-declares
`color: var(--fg-primary)` because `body`'s copy resolves against `:root` and
would otherwise leave anything that merely *inherits* its colour still white.

Prefer React Aria's state attributes (`data-hovered`, `data-pressed`,
`data-focus-visible`, `data-selected`) over CSS pseudo-classes on React Aria
elements — except where the component genuinely doesn't emit them, as with the
GridList rows noted above.

### OAuth without a backend

Dropbox and Google Drive are reached with no server and no client secret,
which constrains both flows:

- **Dropbox** does full PKCE and `token_access_type=offline`, so it yields a
  refresh token and the connection lasts indefinitely.
- **Google** can't: its web authorization-code flow requires a client secret
  at the token endpoint. It uses Google Identity Services' token client
  instead, which gives a ~1h access token and no refresh token. Renewal is a
  silent `prompt: ''` re-request, and `restore` returning null (rather than
  throwing) is what produces a reconnect prompt instead of a broken page.

The Drive scope is `drive.file`, not `drive.appdata`: app-data is hidden from
the user, which is wrong for files they should be able to see and move in
their own Drive, and `drive.file` is additionally the scope Google treats as
non-sensitive, so it carries no verification or test-user cap.

The popup handback in `oauthPkce.js` carries a one-time authorization code.
Its three checks — message origin, message source, and `state` — are all
load-bearing, as is `postMessage`'s explicit target origin in
`public/oauth-callback.html`. Don't relax any of them to `*`.

Refresh tokens live in `localStorage` and are readable by any XSS on the
origin. That's stated plainly in `dropboxClient.js` rather than hidden: with
no backend a token has to be somewhere the page can reach, and the app-folder
scope is what bounds the damage.

### Unsplash: quota and API compliance

A free key allows 50 requests/hour, so one photo per tab load would exhaust it.
`unsplashService.js` fetches a **pool** of 12 photos in one request, caches it in
`localStorage` for 6 hours, and picks randomly per load — backgrounds still
rotate every tab at roughly one request per 6 hours. Concurrent requests for the
same pool share one promise (`inFlightPools`), because StrictMode's
double-invoked effect otherwise fires two cold requests.

Two things there are **required by Unsplash's API guidelines, not decoration**:
the photographer credit linking to their profile and back to Unsplash with UTM
parameters (`PhotoCredit.jsx`), and the ping to the photo's `download_location`
when a photo is used (`trackPhotoUse`). Don't remove either.

`getBackgroundPhoto` is written never to throw — missing key, 401, 403, network
failure and malformed payloads all fall back to the bundled gradients in
`src/assets/backgrounds/`. A new-tab page has to render.

### URL validation is a security boundary

Bookmark URLs are rendered into an `<a href>`, so `normaliseUrl` in
`bookmarksService.js` enforces an http/https allowlist — without it a
`javascript:` URL would be a script-injection vector. `new URL()` alone is not
sufficient validation: it is far more permissive than it looks (browsers parse
`https://a`, and Chromium accepts `https://ht tp://%%%` where Node rejects it),
which is why the hostname is checked separately. Validate in the browser, not
just in Node — they differ.
