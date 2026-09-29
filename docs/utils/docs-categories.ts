/**
 * Sidebar groups for the docs, in order. Each doc picks one in its
 * `meta.category` field, and docs within a group are listed in the order set by
 * dragging them in the collection's "Custom order" view.
 */
export const DOCS_CATEGORIES = [
  {id: 'start', label: 'Get started'},
  {id: 'framework', label: 'Framework'},
  {id: 'cms', label: 'CMS'},
  {id: 'reference', label: 'Reference'},
  {id: 'migration', label: 'Migration'},
] as const;

export type DocsCategoryId = (typeof DOCS_CATEGORIES)[number]['id'];
