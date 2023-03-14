import {GetStaticPaths, GetStaticProps} from '@blinkk/root';
import {getDoc} from '@blinkk/root-cms';
import {Container} from '@/components/Container/Container.js';
import {BaseLayout} from '@/layouts/BaseLayout.js';
import {PagesDoc} from '@/root-cms.js';

interface Props {
  slug: string;
  doc: PagesDoc;
}

export default function Page(props: Props) {
  const fields = props.doc.fields || {};
  return (
    <BaseLayout title={fields?.meta?.title || 'Blog'}>
      <Container>
        <h1>Blog</h1>
        <code>{JSON.stringify(props, null, 2)}</code>
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
  const doc = await getDoc(ctx.rootConfig, 'Pages', slug, {mode: 'draft'});
  if (!doc) {
    return {notFound: true};
  }
  return {props: {slug, doc}};
};
