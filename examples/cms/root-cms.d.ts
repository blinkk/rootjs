/** Root.js CMS types. This file is autogenerated. */

export interface RootCMSImage {
  src: string;
  width?: number;
  height?: number;
  alt?: string;
}

export type RootCMSOneOf<T = any> = T & {
  _type: string;
}

export interface RootCMSRichTextBlock {
  type: string;
  data: any;
}

export interface RootCMSRichText {
  blocks: RootCMSRichTextBlock[];
}

export interface RootCMSReference {
  /** The id of the doc, e.g. "Pages/foo-bar". */
  id: string;
  /** The collection id of the doc, e.g. "Pages". */
  collection: string;
  /** The slug of the doc, e.g. "foo-bar". */
  slug: string;
}

export interface RootCMSDoc<Fields extends {}> {
  /** The id of the doc, e.g. "Pages/foo-bar". */
  id: string;
  /** The collection id of the doc, e.g. "Pages". */
  collection: string;
  /** The slug of the doc, e.g. "foo-bar". */
  slug: string;
  /** System-level metadata. */
  sys: {
    createdAt: number;
    createdBy: string;
    modifiedAt: number;
    modifiedBy: string;
    firstPublishedAt?: number;
    firstPublishedBy?: string;
    publishedAt?: number;
    publishedBy?: string;
    locales?: string[];
  };
  /** User-entered field values from the CMS. */
  fields?: Fields;
}

/** Generated from `/collections/Pages.schema.ts`. */
export interface PagesFields {
  /** Meta */
  meta?: {
    /** Title. Page title. */
    title?: string;
    /** Description. Description for SEO and social shares. */
    description?: string;
    /** Image. Meta image for social shares. Recommended: 1400x600 JPG. */
    image?: RootCMSImage;
  };
  /** Content */
  content?: {
    /** Content Body */
    body?: RootCMSRichText;
  };
}

/** Generated from `/collections/Pages.schema.ts`. */
export type PagesDoc = RootCMSDoc<PagesFields>;