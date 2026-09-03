# sekee

A personal new-tab page: a search bar, your own bookmarks, and a rotating
background photo. It's an ordinary web app, not a browser extension — you
point your browser's homepage or new-tab setting at it.

Built with **React + Vite**, **[React Aria Components]** for the accessible UI
primitives, and plain CSS Modules for styling. There's no backend: everything
lives in `localStorage`.

[React Aria Components]: https://react-aria.adobe.com/

---

## Quick start

```bash
npm install
npm run dev
```

Then open <http://localhost:5173>. That's enough to use the app — you'll get
the bundled gradient backgrounds until you add an Unsplash key.

Other scripts:

| Command           | What it does                                  |
| ----------------- | --------------------------------------------- |
| `npm run dev`     | Dev server with hot reload                    |
| `npm run build`   | Production build into `dist/`                 |
| `npm run preview` | Serve the built `dist/` locally, to check it  |
| `npm run lint`    | Lint the source                               |

### Using it as your actual new-tab page

Run `npm run build` and host `dist/` anywhere that serves static files (Netlify,
Vercel, GitHub Pages, or a folder on your own machine), then set that URL as
your browser's homepage. Chrome doesn't allow replacing the new-tab page
without an extension, so most people set it as the **homepage** and use a
pinned tab; Firefox lets you set a custom new-tab page directly.

### Adding Unsplash backgrounds (optional)

1. Register a free app at <https://unsplash.com/developers>.
2. Copy the **Access Key** (not the Secret Key).
3. `cp .env.example .env.local` and paste the key in:

   ```
   VITE_UNSPLASH_ACCESS_KEY=your-key-here
   ```

4. Restart the dev server — Vite only reads env files at startup.

Without a key, the app falls back to four gradient images bundled in
`src/assets/backgrounds/`, and the settings panel says so.

> **A note on the key.** Because there's no backend, this key ends up in the
> built JavaScript. That's fine for a personal page you host yourself, but
> don't publish the build somewhere public.

---

## How the code is organised

```
src/
├── main.jsx                 entry point; mounts <App> and loads global CSS
├── App.jsx                  layout shell; owns which dialog is open
│
├── services/                ← all data access lives here
│   ├── storage.js               the ONLY file that touches localStorage
│   ├── bookmarksService.js      bookmark CRUD + URL validation
│   ├── settingsService.js       search engine + background preferences
│   ├── unsplashService.js       photo fetching, caching, Unsplash rules
│   ├── favicons.js              builds favicon image URLs
│   ├── searchEngines.js         the list of search engines
│   └── backgroundCategories.js  the list of photo categories
│
├── hooks/                   ← connects services to React
│   ├── useBookmarks.js
│   ├── useSettings.js
│   └── useBackground.js
│
├── components/
│   ├── ui/                  small styled wrappers around React Aria
│   │   ├── Button.jsx  Select.jsx  TextField.jsx  icons.jsx
│   ├── Background/          full-bleed photo + photographer credit
│   ├── SearchBar/
│   ├── BookmarkGrid/        the tile grid + favicon handling
│   ├── BookmarkDialog/      add/edit form + delete confirmation
│   └── SettingsPopover/
│
└── styles/
    ├── tokens.css           every colour, size and timing, as CSS variables
    └── global.css           reset + page defaults
```

Each component has its own `*.module.css` next to it. CSS Modules scope class
names automatically, so `.item` in one file can't collide with `.item` in
another.

### The layering rule

```
components  →  hooks  →  services  →  storage
```

Components never read or write storage directly. This is what keeps the app
easy to change: the UI only knows about hooks, and hooks only know about
services.

---

## Swapping localStorage for a real backend

This is the main thing the structure is designed for.

Every service function is already `async`, even though `localStorage` is
synchronous — so the components already `await` their data and handle loading
states. Moving to something like Supabase means:

1. Write a new adapter with the same four methods as
   `createLocalStorageAdapter()` in `src/services/storage.js`
   (`read`, `write`, `remove`, `subscribe`).
2. Change the one line at the bottom of that file:

   ```js
   export const storage = createSupabaseAdapter();
   ```

For a proper backend you'd more likely rewrite the bodies of the functions in
`bookmarksService.js` to issue queries directly (`supabase.from('bookmarks')…`).
Either way, **no component or hook needs to change**, because their contract —
"call this async function, get plain data back" — stays the same.

---

## Extending it

**Add a search engine** — one object in `src/services/searchEngines.js`:

```js
{ id: 'kagi', name: 'Kagi', queryUrl: 'https://kagi.com/search?q=' }
```

**Add a background category** — one object in
`src/services/backgroundCategories.js`; `query` is the Unsplash search term:

```js
{ id: 'forest', name: 'Forest', query: 'forest trees mist' }
```

**Restyle everything** — edit `src/styles/tokens.css`. Components reference
tokens rather than hard-coded values, so changing the accent colour or the
corner radius there updates the whole app.

**Add a widget** — build it as a component, give it a service + hook if it
needs to persist anything, and drop it into the `.content` column in `App.jsx`.

---

## Things worth knowing

**Unsplash's API rules are implemented, not optional.** When a photo is shown
the app credits the photographer with a link to their profile and a link back
to Unsplash (both carrying UTM parameters), and it pings the photo's
`download_location` endpoint to register the use. Both are required by
Unsplash's API guidelines. See `unsplashService.js` and `PhotoCredit.jsx`.

**Photos are fetched in pools.** A free Unsplash key allows 50 requests per
hour, so fetching one photo per new tab would exhaust it quickly. Instead the
app fetches 12 photos in a single request, caches them for 6 hours, and picks a
random one on each load — so backgrounds still rotate every time you open a
tab, at about one request per 6 hours. "New photo" in settings clears the cache.

**Bookmark URLs are validated.** Only `http://` and `https://` are accepted.
This isn't fussiness: bookmark URLs are rendered into an `<a href>`, so
allowing `javascript:` would be a script-injection hole. `new URL()` alone is
far too permissive for this — browsers happily parse `https://a` — so
`bookmarksService.js` also checks the hostname looks real.

**Keyboard navigation.** Tab moves into the bookmark grid, arrow keys move
between tiles, Enter opens one, and Tab again reaches its edit/delete buttons.
Typing a few letters jumps to a matching tile. This comes from React Aria's
`GridList`.

---

## Not built yet

Deliberately out of scope for now: widgets (clock, weather, to-do), importing
browser bookmarks, user-uploaded backgrounds, a theming panel, and any kind of
account or sync.
