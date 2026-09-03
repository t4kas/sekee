# sekee

A personal new-tab page: a search bar, your own bookmarks, and a rotating
background photo. It's an ordinary web app, not a browser extension — you
point your browser's homepage or new-tab setting at it.

Built with **React + Vite**, **[React Aria Components]** for the accessible UI
primitives, and plain CSS Modules for styling. There's no backend of our own:
everything lives in `localStorage` by default, with an optional Supabase
account so your bookmarks and settings can follow you to another device.

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

### Adding accounts / cloud sync (optional)

Signing in is entirely optional — everything works with just `localStorage`,
same as before. Signing in additionally syncs your bookmarks and settings to
a [Supabase](https://supabase.com) project, so they follow you to another
browser or device.

1. Create a free project at <https://supabase.com>.
2. Open the project's **SQL Editor** and run:

   ```sql
   create table public.user_data (
     user_id uuid not null references auth.users(id) on delete cascade,
     key text not null,               -- 'bookmarks' | 'settings'
     value jsonb not null,
     updated_at timestamptz not null default now(),
     primary key (user_id, key)
   );

   alter table public.user_data enable row level security;

   create policy "select own rows" on public.user_data
     for select using (auth.uid() = user_id);
   create policy "insert own rows" on public.user_data
     for insert with check (auth.uid() = user_id);
   create policy "update own rows" on public.user_data
     for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
   create policy "delete own rows" on public.user_data
     for delete using (auth.uid() = user_id);
   ```

   One table holds both bookmarks and settings, one row per user per key —
   the same "one blob per key" shape `storage.js` already uses for
   `localStorage`. Row Level Security is what actually keeps one user from
   reading another's data; the app never even tries to query without it.

3. In **Project Settings → API**, copy the **Project URL** and the
   **anon/public key**.
4. Add them to `.env.local` (see `.env.example`):

   ```
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

5. Restart the dev server. A sign-in button now appears in the header.

By default, Supabase requires confirming a sign-up by email before you can
sign in — fine for real use, but slow while developing. To skip it locally,
turn off **Confirm email** under **Authentication → Providers → Email** in
the project settings.

**What syncs, and when.** Signed in, bookmarks and settings read from and
write to Supabase instead of `localStorage`; signed out, it's `localStorage`
as always. The first time you sign in on a device, whatever's already in
that browser's `localStorage` is merged into your account (local bookmarks
are added if their URL isn't already there; local settings are kept only if
you don't have any synced yet) — nothing is ever deleted locally, so this
can't lose data. Sync is refresh-based, not live: a bookmark added on one
device shows up elsewhere the next time the app loads there, not instantly.

---

## How the code is organised

```
src/
├── main.jsx                 entry point; mounts <App> and loads global CSS
├── App.jsx                  layout shell; owns which dialog is open
│
├── services/                ← all data access lives here
│   ├── storage.js               storage adapter (localStorage, or Supabase
│   │                            once signed in — see `setActiveAdapter`)
│   ├── bookmarksService.js      bookmark CRUD + URL validation
│   ├── settingsService.js       search engine + background preferences
│   ├── unsplashService.js       photo fetching, caching, Unsplash rules
│   ├── supabaseClient.js        the Supabase client + `isSupabaseConfigured`
│   ├── supabaseAdapter.js       the signed-in storage adapter
│   ├── authService.js           sign up / in / out, wraps Supabase auth
│   ├── favicons.js              builds favicon image URLs
│   ├── searchEngines.js         the list of search engines
│   └── backgroundCategories.js  the list of photo categories
│
├── hooks/                   ← connects services to React
│   ├── useBookmarks.js
│   ├── useSettings.js
│   ├── useBackground.js
│   └── useAuth.js               also points `storage` at the right adapter
│
├── components/
│   ├── ui/                  small styled wrappers around React Aria
│   │   ├── Button.jsx  Select.jsx  TextField.jsx  icons.jsx
│   ├── Background/          full-bleed photo + photographer credit
│   ├── SearchBar/
│   ├── BookmarkGrid/        the tile grid + favicon handling
│   ├── BookmarkDialog/      add/edit form + delete confirmation
│   ├── SettingsPopover/
│   └── Account/              sign-in button + auth dialog
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

## How the storage adapter works

This is the main thing the structure is designed for, and it's why adding
accounts (above) didn't touch `bookmarksService.js` or `settingsService.js`
at all.

Every service function is `async`, even though `localStorage` is synchronous
— so components already `await` their data and handle loading states, and
don't care which backend is actually answering. `storage.js` exports one
`storage` object with four methods (`read`, `write`, `remove`, `subscribe`);
underneath, it delegates to whichever *adapter* is currently active:

- `createLocalStorageAdapter()` — the default, always available.
- `createSupabaseAdapter(userId)` — used while signed in; see
  `supabaseAdapter.js`.

`useAuth.js` calls `setActiveAdapter(...)` whenever sign-in state changes,
which re-points every live `subscribe()` the app has open and re-delivers a
fresh read — so `useBookmarks`/`useSettings` update immediately without
needing to know auth exists.

Adding a different backend later means writing one more adapter with the
same four methods and deciding when it becomes active — no component or hook
needs to change, because their contract ("call this async function, get
plain data back") stays the same.

---

## Extending it

**Add a search engine** — one object in `src/services/searchEngines.js`:

```js
{ id: 'kagi', name: 'Kagi', queryUrl: 'https://kagi.com/search?q=' }
```

To give it a logo in the search bar, find the brand on
[simpleicons.org](https://simpleicons.org), copy the `d` attribute out of the
downloaded SVG, and add it to `ENGINE_LOGO_PATHS` in
`src/components/SearchBar/EngineLogo.jsx` under the same `id`. An engine with
no entry falls back to its initial, so this step is optional — that's why Bing
shows a "B" (Simple Icons removed Microsoft's marks over trademark policy).

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
browser bookmarks, user-uploaded backgrounds, a theming panel, live sync
across open tabs/devices while signed in (it's refresh-based — see "Adding
accounts" above), password reset / OAuth sign-in, and account deletion (drop
the row from Supabase's Users page in the dashboard for now).
