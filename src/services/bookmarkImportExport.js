/**
 * Bookmark import/export
 * ---------------------------------------------------------------------------
 * Reads and writes the Netscape Bookmark File format — the `<!DOCTYPE
 * NETSCAPE-Bookmark-file-1>` HTML dialect every major browser (Chrome,
 * Firefox, Safari, Edge) both exports to and imports from, despite the name.
 * There's no JSON/CSV equivalent that all of them agree on, so this is the
 * one format that actually moves bookmarks between browsers and back into
 * this app.
 *
 * Deliberately NOT in `bookmarksService.js`: everything in that file reads
 * and writes `storage` (see its own header comment on why every function
 * there is async, mirroring a future backend). These two functions do
 * neither — `exportBookmarksToHtml` is a pure string builder over data the
 * caller already has, and `parseBookmarksHtml` only turns a string into
 * data, using `DOMParser` (a browser API, not storage) to do it. Deciding
 * what to *do* with parsed bookmarks — which groups to create, which to
 * merge into by name — is `useBookmarks.js`'s `importBookmarks`, since that
 * needs both this module and `bookmarkGroupsService.js` together.
 *
 * FOLDERS <-> GROUPS: this app has no nested groups, so on import every
 * folder becomes one group (nested subfolders flatten into whichever named
 * folder directly contains them — a folder-of-folders' own bookmarks land in
 * the innermost name, not "Parent/Child"), and a bookmark that isn't inside
 * any folder comes back with `folder: null` for the caller to place
 * somewhere sensible (see `importBookmarks`). On export, the reverse: one
 * top-level folder per group, no nesting.
 */

/** Escapes text for safe inclusion in the HTML this generates. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {{id: string, name: string, order: number}[]} groups
 * @param {{groupId: string, title: string, url: string, order: number, createdAt: number}[]} bookmarks
 * @returns {string} a Netscape Bookmark File — save it as .html and every
 *   major browser's own bookmark importer will read it.
 */
export function exportBookmarksToHtml(groups, bookmarks) {
  const bookmarksByGroup = new Map(groups.map((group) => [group.id, []]));
  for (const bookmark of [...bookmarks].sort((a, b) => a.order - b.order)) {
    bookmarksByGroup.get(bookmark.groupId)?.push(bookmark);
  }

  const folders = [...groups]
    .sort((a, b) => a.order - b.order)
    .map((group) => {
      const items = (bookmarksByGroup.get(group.id) ?? [])
        .map((bookmark) => {
          const addDate = Math.floor((bookmark.createdAt ?? Date.now()) / 1000);
          return `        <DT><A HREF="${escapeHtml(bookmark.url)}" ADD_DATE="${addDate}">${escapeHtml(bookmark.title)}</A>`;
        })
        .join('\n');

      return [
        `    <DT><H3 ADD_DATE="${Math.floor(Date.now() / 1000)}">${escapeHtml(group.name)}</H3>`,
        '    <DL><p>',
        items,
        '    </DL><p>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  // The exact preamble every browser writes and expects — not arbitrary
  // formatting. `<DT>`/`<p>` are deliberately left unclosed: that's what the
  // format actually looks like everywhere it's produced, and HTML parsers
  // (this app's own import included) handle it as designed.
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${folders}
</DL><p>
`;
}

/**
 * Walks one `<DL>` level of a parsed bookmark file, appending every bookmark
 * found (at this level or nested inside a subfolder) to `into`. A nested
 * `<DL>` can end up as either a child of its `<DT><H3>` or that `<DT>`'s next
 * sibling, depending on the browser that produced the file and how lenient
 * HTML parsing settled the tags — this checks both.
 */
function walkFolder(dl, folderName, into) {
  for (const child of dl.children) {
    if (child.tagName === 'DL') {
      walkFolder(child, folderName, into);
      continue;
    }
    if (child.tagName !== 'DT') continue;

    const heading = child.querySelector(':scope > h3');
    const link = child.querySelector(':scope > a');
    const nestedDl = child.querySelector(':scope > dl') ?? (child.nextElementSibling?.tagName === 'DL' ? child.nextElementSibling : null);

    if (heading) {
      walkFolder(nestedDl ?? child, heading.textContent.trim() || 'Imported', into);
    } else if (link) {
      const url = link.getAttribute('href');
      if (url) into.push({ folder: folderName, title: link.textContent.trim() || url, url });
    }
  }
}

/**
 * @param {string} html  the contents of a Netscape Bookmark File
 * @returns {{folder: string|null, title: string, url: string}[]} every
 *   bookmark found, in document order. `folder` is the name of the
 *   innermost enclosing folder, or `null` for one not inside any folder —
 *   see the file header on how `importBookmarks` decides what to do with
 *   each case.
 */
export function parseBookmarksHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const rootDl = doc.querySelector('dl');
  if (!rootDl) return [];

  const found = [];
  walkFolder(rootDl, null, found);
  return found;
}
