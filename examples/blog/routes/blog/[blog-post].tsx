import {Handler, HandlerContext, Request} from '@blinkk/root';
import {getDoc} from '@blinkk/root-cms';

import {Container} from '@/components/Container/Container.js';
import {BaseLayout} from '@/layouts/BaseLayout.js';
import {BlogPostsDoc} from '@/root-cms.js';

interface Props {
  slug: string;
  doc: BlogPostsDoc;
}

export default function Page(props: Props) {
  const fields = props.doc.fields || {};
  return (
    <BaseLayout title={fields.meta?.title || 'Blog Post'}>
      <Container>
        <h1>Blog Post</h1>
        <pre><code>{JSON.stringify(props, null, 2)}</code></pre>
      </Container>
    </BaseLayout>
  );
}

/** SSR handler. */
export const handle: Handler = async (req: Request) => {
  const ctx = req.handlerContext as HandlerContext<Props>;
  const slug = ctx.params['blog-post'];
  const mode = String(req.query.preview) === 'true' ? 'draft' : 'published';
  const doc = await getDoc<BlogPostsDoc>(req.rootConfig, 'BlogPosts', slug, {
    mode,
  });
  if (!doc) {
    return ctx.render404();
  }
  return ctx.render({slug, doc});
};
