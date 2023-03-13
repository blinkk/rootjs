import {GetStaticPaths, GetStaticProps} from '@blinkk/root';
// import {getDoc} from '@blinkk/root-cms';
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
    <BaseLayout title={fields?.meta?.title || 'Blog'}>
      <Container>
        <h1>Blog</h1>
        <code>{JSON.stringify(props)}</code>
      </Container>
    </BaseLayout>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  // TODO(stevenle): list paths from db.
  return {paths: []};
}

export const getStaticProps: GetStaticProps = async (ctx) => {
  const slug = ctx.params.page;
  // const doc = await getDoc(ctx.rootConfig, 'Page', slug, {mode: 'draft'});
  const doc = {};
  return {props: {slug, doc}};
};
