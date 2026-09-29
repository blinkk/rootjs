/**
 * Helpers for schema.org structured data (JSON-LD). The site-wide nodes are
 * rendered on every page by `BaseLayout`, and page-level nodes reference them
 * by `@id` instead of repeating their details.
 */

export const SITE_URL = 'https://rootjs.dev';

/** A JSON-LD node, e.g. `{'@type': 'FAQPage', ...}`. */
export type JsonLdNode = Record<string, unknown>;

export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const SOFTWARE_ID = `${SITE_URL}/#software`;

/** Returns an absolute URL for a path on the site, e.g. `/blog/`. */
export function getAbsoluteUrl(path: string) {
  return new URL(path, SITE_URL).toString();
}

/**
 * Returns the site-wide nodes that describe the organization behind Root.js,
 * the rootjs.dev website, and Root.js itself as a software application.
 */
export function getSiteNodes(): JsonLdNode[] {
  return [
    {
      '@type': 'Organization',
      '@id': ORGANIZATION_ID,
      name: 'Blinkk',
      url: 'https://blinkk.com/',
      sameAs: ['https://github.com/blinkk'],
    },
    {
      '@type': 'WebSite',
      '@id': WEBSITE_ID,
      name: 'Root.js',
      url: `${SITE_URL}/`,
      publisher: {'@id': ORGANIZATION_ID},
      about: {'@id': SOFTWARE_ID},
    },
    {
      '@type': 'SoftwareApplication',
      '@id': SOFTWARE_ID,
      name: 'Root.js',
      description:
        'Root.js is a web development framework with a built-in CMS, designed for building modern, performant web applications.',
      url: `${SITE_URL}/`,
      applicationCategory: 'DeveloperApplication',
      applicationSubCategory: 'Web framework',
      operatingSystem: 'Cross-platform',
      softwareRequirements: 'Node.js 24 or later',
      license: 'https://opensource.org/licenses/MIT',
      isAccessibleForFree: true,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      author: {'@id': ORGANIZATION_ID},
      publisher: {'@id': ORGANIZATION_ID},
      sameAs: [
        'https://github.com/blinkk/rootjs',
        'https://www.npmjs.com/package/@blinkk/root',
      ],
    },
  ];
}
