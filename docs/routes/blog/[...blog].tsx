import {BlogPost} from '@/components/BlogPost/BlogPost.js';
import {Container} from '@/components/Container/Container.js';
import {BaseLayout} from '@/layouts/BaseLayout.js';
import {BlogPostsDoc} from '@/root-cms.js';
import {cmsRoute} from '@/utils/cms-route.js';

export interface PageProps {
  doc: BlogPostsDoc;
}

export default function Page(props: PageProps) {
  const fields = props.doc.fields || {};
  const title = fields?.meta?.title;
  const description = fields?.meta?.description;
  const image = fields.meta?.image?.src;

  return (
    <BaseLayout title={title} description={description} image={image}>
      <Container>
        <BlogPost doc={props.doc} />
      </Container>
    </BaseLayout>
  );
}

export const {handle} = cmsRoute({
  collection: 'BlogPosts',
  slugParam: 'blog',
});
