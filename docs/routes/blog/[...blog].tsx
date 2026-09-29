import {useRequestContext, useTranslations} from '@blinkk/root';
import {BlogPost} from '@/components/BlogPost/BlogPost.js';
import {BaseLayout} from '@/layouts/BaseLayout.js';
import {BlogPostsDoc} from '@/root-cms.js';
import {getBlogPostTime} from '@/utils/blog.js';
import {cmsRoute} from '@/utils/cms-route.js';
import {
  getAbsoluteUrl,
  JsonLdNode,
  ORGANIZATION_ID,
  SOFTWARE_ID,
  WEBSITE_ID,
} from '@/utils/structured-data.js';

export interface PageProps {
  doc: BlogPostsDoc;
}

export default function Page(props: PageProps) {
  const t = useTranslations();
  const ctx = useRequestContext();
  const fields = props.doc.fields || {};
  const meta = fields.meta || {};
  const sys = props.doc.sys;
  const url = getAbsoluteUrl(ctx.currentPath);

  const jsonLd: JsonLdNode[] = [
    {
      '@type': 'BlogPosting',
      '@id': `${url}#article`,
      mainEntityOfPage: url,
      url: url,
      headline: t(meta.title || ''),
      description: meta.description ? t(meta.description) : undefined,
      image: meta.image?.src || undefined,
      datePublished: new Date(getBlogPostTime(props.doc)).toISOString(),
      dateModified: new Date(
        sys.publishedAt || sys.modifiedAt || getBlogPostTime(props.doc)
      ).toISOString(),
      inLanguage: ctx.locale || 'en',
      author: {'@id': ORGANIZATION_ID},
      publisher: {'@id': ORGANIZATION_ID},
      isPartOf: {'@id': WEBSITE_ID},
      about: {'@id': SOFTWARE_ID},
    },
  ];

  return (
    <BaseLayout
      title={meta.title ? `${t(meta.title)} – Root.js` : 'Blog – Root.js'}
      description={meta.description}
      image={meta.image?.src}
      jsonLd={jsonLd}
    >
      <BlogPost doc={props.doc} />
    </BaseLayout>
  );
}

export const {handle} = cmsRoute({
  collection: 'BlogPosts',
  slugParam: 'blog',
});
