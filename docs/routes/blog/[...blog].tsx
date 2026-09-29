import {useTranslations} from '@blinkk/root';
import {BlogPost} from '@/components/BlogPost/BlogPost.js';
import {BaseLayout} from '@/layouts/BaseLayout.js';
import {BlogPostsDoc} from '@/root-cms.js';
import {cmsRoute} from '@/utils/cms-route.js';

export interface PageProps {
  doc: BlogPostsDoc;
}

export default function Page(props: PageProps) {
  const t = useTranslations();
  const fields = props.doc.fields || {};
  const meta = fields.meta || {};

  return (
    <BaseLayout
      title={meta.title ? `${t(meta.title)} – Root.js` : 'Blog – Root.js'}
      description={meta.description}
      image={meta.image?.src}
    >
      <BlogPost doc={props.doc} />
    </BaseLayout>
  );
}

export const {handle} = cmsRoute({
  collection: 'BlogPosts',
  slugParam: 'blog',
});
