import {DocsDoc} from '@/root-cms.js';
import {sortByCustomOrder} from '@/utils/custom-order.js';
import {DOCS_CATEGORIES, type DocsCategoryId} from '@/utils/docs-categories.js';

/** Category values used before the current categories were added. */
const LEGACY_CATEGORIES: Record<string, DocsCategoryId> = {
  guide: 'framework',
  api: 'reference',
};

/** Category for docs that don't have one set. */
const DEFAULT_CATEGORY: DocsCategoryId = 'framework';

export interface DocsNavLink {
  id: string;
  label: string;
  href: string;
}

export interface DocsNavGroup {
  id: DocsCategoryId;
  label: string;
  links: DocsNavLink[];
}

/** Returns the URL path for a doc, e.g. `/docs/cms/schemas/`. */
export function getDocUrl(doc: {slug: string}) {
  if (doc.slug === 'index') {
    return '/docs/';
  }
  // Nested slugs are stored with `--` in place of `/`.
  return `/docs/${doc.slug.replaceAll('--', '/')}/`;
}

/** Returns the category a doc is listed under in the sidebar. */
export function getDocCategory(doc: DocsDoc): DocsCategoryId {
  const value = doc.fields?.meta?.category || '';
  if (DOCS_CATEGORIES.some((category) => category.id === value)) {
    return value as DocsCategoryId;
  }
  return LEGACY_CATEGORIES[value] || DEFAULT_CATEGORY;
}

/** Returns the label for a doc in the sidebar. */
export function getDocNavLabel(doc: DocsDoc) {
  const fields = doc.fields || {};
  return (
    fields.meta?.navLabel ||
    fields.content?.title ||
    fields.meta?.title ||
    doc.slug
  );
}

/**
 * Groups docs by category for the sidebar. Empty groups are left out.
 */
export function buildDocsNav(docs: DocsDoc[]): DocsNavGroup[] {
  const sorted = sortByCustomOrder(docs);
  return DOCS_CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
    links: sorted
      .filter((doc) => getDocCategory(doc) === category.id)
      .map((doc) => ({
        id: doc.id,
        label: getDocNavLabel(doc),
        href: getDocUrl(doc),
      })),
  })).filter((group) => group.links.length > 0);
}
