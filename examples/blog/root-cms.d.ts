/** Root.js CMS types. This file is autogenerated. */

export interface RootCMSImage {
  src: string;
  width?: number;
  height?: number;
  alt?: string;
}

export type RootCMSOneOf<T = any> = T & {
  _type: string;
};

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

/** Generated from `/collections/BlogPosts.schema.ts`. */
export interface BlogPostsFields {
  /** Internal Description. Use this field to leave internal notes, etc. */
  internalDesc?: string;
  /** Meta */
  meta?: {
    /** Title */
    title?: string;
    /** Description. Description for SEO and social shares. */
    description?: string;
    /** Image. Meta image for social shares. Recommended size: 1200x600. */
    image?: RootCMSImage;
    /** Featured?. Check the box to mark the blog post as a featured blog post. */
    featured?: boolean;
    /** Tags. Category tags for searching and filtering. */
    tags?: string[];
  };
  /** Content */
  content?: {
    /** Blog content */
    richtext?: RootCMSRichText;
    /** Body copy. Markdown supported. */
    body?: string;
  };
  /** Advanced */
  advanced?: {
    /**
     * Custom CSS. Optional CSS to inject into the page.
     * @deprecated
    */
    customCss?: string;
    /** PDF. PDF version of the post. */
    pdf?: {
      src: string;
    };
    /** Published Date Override. Override for the "Published" date. */
    publishedAtOverride?: number;
    /** Parent Post. Optional parent post for breadcrumbs. */
    parentPost?: RootCMSReference;
    /** Related Posts. Suggest related blog posts to read. */
    relatedPosts?: RootCMSReference[];
  };
}

/** Generated from `/collections/BlogPosts.schema.ts`. */
export type BlogPostsDoc = RootCMSDoc<BlogPostsFields>;

/** Generated from `/collections/BlogPostsSandbox.schema.ts`. */
export interface BlogPostsSandboxFields {
  /** Internal Description. Use this field to leave internal notes, etc. */
  internalDesc?: string;
  /** Meta */
  meta?: {
    /** Title */
    title?: string;
    /** Description. Description for SEO and social shares. */
    description?: string;
    /** Image. Meta image for social shares. Recommended size: 1200x600. */
    image?: RootCMSImage;
    /** Featured?. Check the box to mark the blog post as a featured blog post. */
    featured?: boolean;
    /** Tags. Category tags for searching and filtering. */
    tags?: string[];
  };
  /** Content */
  content?: {
    /** Blog content */
    richtext?: RootCMSRichText;
    /** Body copy. Markdown supported. */
    body?: string;
  };
  /** Advanced */
  advanced?: {
    /**
     * Custom CSS. Optional CSS to inject into the page.
     * @deprecated
    */
    customCss?: string;
    /** PDF. PDF version of the post. */
    pdf?: {
      src: string;
    };
    /** Published Date Override. Override for the "Published" date. */
    publishedAtOverride?: number;
    /** Parent Post. Optional parent post for breadcrumbs. */
    parentPost?: RootCMSReference;
    /** Related Posts. Suggest related blog posts to read. */
    relatedPosts?: RootCMSReference[];
  };
}

/** Generated from `/collections/BlogPostsSandbox.schema.ts`. */
export type BlogPostsSandboxDoc = RootCMSDoc<BlogPostsSandboxFields>;

/** Generated from `/collections/Pages.schema.ts`. */
export interface PagesFields {
  /** [INTERNAL] Description. Internal-only field. Used for notes, etc. */
  internalDesc?: string;
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
    /** Modules. Compose the page by adding one or more modules. */
    modules?: RootCMSOneOf<SpacerFields | Template5050Fields | TemplateFeaturedBlogPostsFields | TemplateHeroFields>[];
  };
  /** Advanced */
  advanced?: {
    /** Analytics. HTML injected into the page for custom analytics. */
    analtyics?: string;
  };
}

/** Generated from `/collections/Pages.schema.ts`. */
export type PagesDoc = RootCMSDoc<PagesFields>;

/** Generated from `/templates/Spacer/Spacer.schema.ts`. */
export interface SpacerFields {
  /** Desktop Height. Height of the spacer for the desktop layout. If blank, defaults to 80. */
  desktopHeight?: string;
  /** Tablet Height. Height of the spacer for the tablet layout. If blank, defaults to the desktop size. */
  tabletHeight?: string;
  /** Mobile Height. Height of the spacer for the mobile layout. If blank, defaults to the desktop size. */
  mobileHeight?: string;
}

/** Generated from `/templates/Template5050/5050assets/ImageAsset.schema.ts`. */
export interface ImageAssetFields {
  /** Image to embed. Optional. If not provided, the default YT thumbnail is used. */
  image?: RootCMSImage;
}

/** Generated from `/templates/Template5050/5050assets/YouTubeAsset.schema.ts`. */
export interface YouTubeAssetFields {
  /** YouTube URL */
  youtubeUrl?: string;
  /** Thumbnail image. Optional. If not provided, the default YT thumbnail is used. */
  thumbnail?: RootCMSImage;
}

/** Generated from `/templates/Template5050/Template5050.schema.ts`. */
export interface Template5050Fields {
  /** ID. Used for deep linking, tracking, etc. */
  id?: string;
  /** Title */
  title?: string;
  /** Body */
  body?: string;
  /** Asset */
  asset?: RootCMSOneOf<ImageAssetFields | YouTubeAssetFields>;
}

/** Generated from `/templates/TemplateFeaturedBlogPosts/TemplateFeaturedBlogPosts.schema.ts`. */
export interface TemplateFeaturedBlogPostsFields {
  /** ID. Used for deep linking, tracking, etc. */
  id?: string;
  /** Module Options. Layout and display options. */
  options?: string[];
  /** More Posts: Title. Headline below the featured blog post. */
  morePostsTitle?: string;
}

/** Generated from `/templates/TemplateHero/TemplateHero.schema.ts`. */
export interface TemplateHeroFields {
  /** ID. Used for deep linking, tracking, etc. */
  id?: string;
  /** Module Options. Layout and display options. */
  options?: string[];
  /** Title */
  title?: string;
  /** Image */
  image?: RootCMSImage;
}