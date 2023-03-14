import {GetStaticPaths, GetStaticProps} from '@blinkk/root';
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
        <code>{JSON.stringify(props)}</code>
      </Container>
    </BaseLayout>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  return {paths: []};
}

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const slug = ctx.params['blog-post'];
  const doc = await getDoc<BlogPostsDoc>(ctx.rootConfig, 'BlogPosts', slug, {mode: 'draft'});
  if (!doc) {
    return {notFound: true};
  }
  return {props: {slug, doc}};
};
