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

Unsplash backgrounds need `VITE_UNSPLASH_ACCESS_KEY` in `.env.local` (see
`.env.example`). Without it the app falls back to bundled gradients, so the app
runs fine unkeyed — but the Unsplash code paths are then never exercised. Vite
reads env files only at startup, so restart the dev server after editing them.

## Architecture

A personal new-tab page: React + Vite (plain JS), `react-aria-components` for
UI primitives, CSS Modules for styling, `localStorage` for persistence. No
backend, no router — a single page. `README.md` has the directory tree and
setup instructions; this file covers what isn't visible from the structure.

### The layering rule

```
components  →  hooks  →  services  →  storage
```

Components never read or write storage directly. Keep it that way — it's what
makes the persistence layer swappable.

Every service function is `async` even though `localStorage` is synchronous.
That is deliberate: components already `await` their data and handle loading
states, so moving to a real backend doesn't touch the UI. `src/services/storage.js`
is the only file that knows `localStorage` exists, and the swap point is the
single `export const storage = createLocalStorageAdapter()` line at its bottom.
An adapter needs four methods: `read`, `write`, `remove`, `subscribe`
(`subscribe` powers cross-tab sync via the `storage` event).

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
  winner decided by stylesheet order. `SearchBar` and `SettingsPopover` both do
  this deliberately.

Prefer React Aria's state attributes (`data-hovered`, `data-pressed`,
`data-focus-visible`, `data-selected`) over CSS pseudo-classes on React Aria
elements — except where the component genuinely doesn't emit them, as with the
GridList rows noted above.

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
