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

**Keys have to be set where the build runs.** Vite reads `VITE_*` variables at
build time and bakes their values into `dist/`, so `.env.local` — which is
gitignored and never uploaded — has no effect on a deployment. Every optional
feature below (Unsplash, accounts, file storage) is off in a build that didn't
have its key, and the app can't tell you afterwards which key was missing at
the time. On Vercel or Netlify that means the host's **Environment Variables**
settings, followed by a **redeploy**: an existing deployment keeps whatever it
was built with, so adding a variable changes nothing until something rebuilds.

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

### The weather widget

Type a city into **Weather location** in the settings panel and a small pill
showing current conditions appears above the search bar; leave it blank and
the widget stays hidden. It uses [Open-Meteo](https://open-meteo.com), which
needs no API key and no `.env` setup — this one works for everyone out of the
box. See `services/weatherService.js`.

### Adding cloud sync (optional)

Sync is entirely optional — everything works with just `localStorage`, same
as before. There are two kinds of destination, and you can enable either,
both, or neither:

- **An account on a Supabase project you run** (below). You operate the
  backend; the free tier covers a personal app comfortably.
- **The user's own Google Drive or Dropbox** (further below). Nothing to
  operate and nothing to pay for at any scale — each person's data sits in
  their own storage, in a folder scoped to this app, under their own quota.

If both are configured, connecting your own cloud storage takes precedence
over being signed in; Settings → Sync is where that's chosen.

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
6. Under **Authentication → URL Configuration**, add every URL you'll sign up
   from to **Redirect URLs** — `http://localhost:5173` for local dev, plus
   whatever your app is deployed at (e.g. `https://your-app.vercel.app`).
   The app already tells Supabase which origin to send the confirmation link
   back to (see `emailRedirectTo` in `authService.js`), but Supabase still
   rejects any origin that isn't on this list — without it, sign-up email
   links fall back to the project's default **Site URL**, which is
   `localhost:3000` and almost certainly not where your app lives.

By default, Supabase requires confirming a sign-up by email before you can
sign in — fine for real use, but slow while developing. To skip it locally,
turn off **Confirm email** under **Authentication → Providers → Email** in
the project settings.

### Storing files (optional)

Separate from sync, and worth keeping straight: **sync is about bookmarks and
settings, files are about images and attachments.** Signing in decides the
first; connecting storage decides the second. Neither affects the other.

Files go to one of two places, chosen by who has to read them:

- **Anything other people see — avatars above all — goes to Supabase
  Storage.** It's the only option that produces a permanent public URL, which
  is what another person's browser needs. Create the bucket by running this
  in the project's SQL editor:

  ```sql
  insert into storage.buckets (id, name, public)
  values ('user-files', 'user-files', true);

  -- Every path is `<user id>/<name>`, and these policies key off that first
  -- segment: a signed-in user can only write inside their own prefix.
  create policy "read any file" on storage.objects
    for select using (bucket_id = 'user-files');
  create policy "write own files" on storage.objects
    for insert with check (
      bucket_id = 'user-files' and (storage.foldername(name))[1] = auth.uid()::text
    );
  create policy "update own files" on storage.objects
    for update using (
      bucket_id = 'user-files' and (storage.foldername(name))[1] = auth.uid()::text
    );
  create policy "delete own files" on storage.objects
    for delete using (
      bucket_id = 'user-files' and (storage.foldername(name))[1] = auth.uid()::text
    );
  ```

  The bucket is public for **reads** — that's what makes an avatar URL work
  without signing every request. Don't put anything private in it.

- **The user's own files go to their own Google Drive or Dropbox.** Costs you
  nothing at any scale, since it's their storage and their quota, and the
  files stay theirs if they stop using this app. Setup for both — which
  console, which scopes, and which URLs to register (they differ: Dropbox
  wants a redirect URL, Google wants a bare origin) — is in `.env.example`.
  Add a key, restart the dev server, and a **Files** tab appears in Settings.

Google uses the `drive.file` scope, which only reaches files this app created
and which Google treats as non-sensitive — so there's no verification process
or test-user cap to work around. Dropbox apps do stay in development mode
until you apply for production, capping them at around 50 linked accounts.

In code this is one call: `getStore(scope)` from `fileStorageService.js`,
where the scope is `shared` or `personal`. One caveat the service documents —
only the shared store's URLs are permanent. Dropbox links expire in hours and
Drive hands back a `blob:` handle, so for personal files persist the **path**
and resolve it when you need it.

### What syncs, and when

With a destination connected, bookmarks, bookmark groups, settings and
favorited photos read from and write to it instead of `localStorage`; with
none, it's `localStorage` as always. Cached backgrounds and weather always
stay on the device — they expire on their own, so there's nothing worth
carrying between devices.

The first time a device connects, whatever's already in that browser's
`localStorage` is merged into the destination: local bookmarks are added if
their URL isn't already there, local groups are matched up by name (and
local-only bookmarks re-pointed at the merged groups), and local settings are
kept only if you don't have any synced yet. Nothing is ever deleted on either
side, so this can't lose data.

Sync is refresh-based, not live: a change made on one device shows up
elsewhere the next time the app loads there — or when you press "Sync now" —
not instantly.

**Favoriting a background photo requires a connected destination — there's no
local version of it.** Click the heart on a photo to save it (with none
connected, it opens the sign-in dialog instead). Once you've favorited a few, "My Favorites"
appears in the Background dropdown alongside the photo categories, either
shuffling among them or, if you switch to "Always show one," pinned to
whichever one you pick on the Personalisation tab's Favorites sub-tab (also
where you remove any).
Favorites are stored the same way as bookmarks and settings — no separate
table, and no separate file.

---

## How the code is organised

```
src/
├── main.jsx                 entry point; mounts <App> and loads global CSS
├── App.jsx                  layout shell; owns which dialog is open
│
├── services/                ← all data access lives here
│   ├── storage.js               storage adapter (localStorage, or a remote
│   │                            one — see `setActiveAdapter`)
│   ├── syncService.js           the merge that runs when local data first
│   │                            meets an account's data
│   ├── cachedRemoteAdapter.js   local mirror + debounced write-behind around
│   │                            the Supabase adapter
│   ├── fileStorageService.js    picks a file store by scope (see below)
│   ├── files/                   file stores + the cloud accounts they need
│   │                            (OAuth, Dropbox, Drive, Supabase Storage)
│   ├── bookmarksService.js      bookmark CRUD + URL validation
│   ├── settingsService.js       search engine + background preferences
│   ├── unsplashService.js       photo fetching, caching, Unsplash rules
│   ├── weatherService.js        Open-Meteo geocoding + forecast, caching
│   ├── supabaseClient.js        the Supabase client + `isSupabaseConfigured`
│   ├── supabaseAdapter.js       the signed-in storage adapter
│   ├── authService.js           sign up / in / out, wraps Supabase auth
│   ├── favoritesService.js      favorited photos — cloud-only, no local mode
│   ├── favicons.js              builds favicon image URLs
│   ├── searchEngines.js         the list of search engines
│   └── backgroundCategories.js  the list of photo categories
│
├── hooks/                   ← connects services to React
│   ├── useBookmarks.js
│   ├── useSettings.js
│   ├── useBackground.js
│   ├── useWeather.js
│   ├── useAuth.js               also points `storage` at the right adapter
│   └── useFavorites.js
│
├── components/
│   ├── ui/                  small styled wrappers around React Aria
│   │   ├── Button.jsx  Select.jsx  TextField.jsx  icons.jsx
│   ├── Background/          full-bleed photo + credit + favorite button
│   ├── SearchBar/
│   ├── WeatherWidget/        current-conditions pill, see "The weather
│   │                         widget" above
│   ├── BookmarkGrid/        the tile grid + favicon handling
│   ├── BookmarkDialog/      add/edit form + delete confirmation
│   ├── SettingsModal/        sidebar-tabbed settings: Account, Preferences,
│   │                         Personalisation, Sync, Weather
│   ├── Account/              sign-in button + auth dialog
│   └── Favorites/            the favorites grid (Personalisation's Favorites
│                             sub-tab)
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
- `createSupabaseAdapter(userId)` — used while signed in.

`useSync.js` calls `setActiveAdapter(...)` whenever that changes, which
re-points every live `subscribe()` the app has open and re-delivers a fresh
read — so `useBookmarks`/`useSettings` update immediately without needing to
know any of this exists. `useAuth.js` only handles signing in; where data
goes is a separate decision.

Supabase is wrapped in `createCachedRemoteAdapter`, which is what keeps a
Postgres round-trip off the first paint: reads come from a local mirror and
revalidate in the background, and writes are debounced, so a burst of
bookmark clicks becomes one upload instead of five. If a flush fails the
value stays queued, and the queue survives a reload. Its one consequence is
that a write resolves before it reaches Postgres, so a failure shows up in
the Sync tab rather than at the call site.

Adding a different backend later means writing one more adapter with the
same four methods and deciding when it becomes active — no component or hook
needs to change, because their contract ("call this async function, get
plain data back") stays the same. **File storage is a separate system** with
its own contract; see `fileStorageService.js`.

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

Deliberately out of scope for now: more widgets (clock, to-do — weather is
built in, see below), importing browser bookmarks, user-uploaded backgrounds,
a theming panel, live sync
across open tabs/devices while signed in (it's refresh-based — see "Adding
accounts" above), password reset / OAuth sign-in, and account deletion (drop
the row from Supabase's Users page in the dashboard for now).
