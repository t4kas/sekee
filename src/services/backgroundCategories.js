/**
 * Background categories
 * ---------------------------------------------------------------------------
 * The choices offered in the settings popover. `query` is the search term
 * sent to Unsplash — add a category by adding an object here.
 */

export const BACKGROUND_CATEGORIES = [
  { id: 'nature', name: 'Nature', query: 'nature landscape' },
  { id: 'mountains', name: 'Mountains', query: 'mountains fog' },
  { id: 'water', name: 'Water', query: 'ocean lake water' },
  { id: 'architecture', name: 'Architecture', query: 'minimal architecture' },
  { id: 'space', name: 'Space', query: 'space stars galaxy' },
  { id: 'minimal', name: 'Minimal', query: 'minimal abstract texture' },
];

export const DEFAULT_CATEGORY_ID = 'nature';

/** Falls back to the default if a stored id no longer exists in the list. */
export function getCategory(categoryId) {
  return (
    BACKGROUND_CATEGORIES.find((category) => category.id === categoryId) ??
    BACKGROUND_CATEGORIES.find((category) => category.id === DEFAULT_CATEGORY_ID)
  );
}
