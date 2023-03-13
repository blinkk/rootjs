import {GetStaticPaths, GetStaticProps} from '@blinkk/root';
import {Container} from '@/components/Container/Container.js';
import {BaseLayout} from '@/layouts/BaseLayout.js';

interface Fields {
  [key: string]: any;
  meta?: {
    title?: string;
  };
}

interface Props {
  slug: string;
  doc: {
    fields: Fields,
  }
}

export default function Page(props: Props) {
  const fields = props.doc.fields || {};
  return (
    <BaseLayout title={fields?.meta?.title || 'Blog Post'}>
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

export const getStaticProps: GetStaticProps = async (ctx) => {
  const slug = ctx.params.slug;
  // const doc = await getDoc('Page', slug);
  const doc = {};
  return {props: {slug, doc}};
};
