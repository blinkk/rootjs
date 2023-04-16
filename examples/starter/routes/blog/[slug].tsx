import {GetStaticProps, GetStaticPaths} from '@blinkk/root';

import {BaseLayout} from '@/layouts/BaseLayout.js';

interface PageProps {
  slug: string;
}

export default function Page(props: PageProps) {
  return (
    <BaseLayout title={`Blog Post: ${props.slug}`}>
      <h1>Hello, {props.slug}!</h1>
    </BaseLayout>
  );
}

export const getStaticProps: GetStaticProps = async (ctx) => {
  return {
    props: {
      slug: ctx.params.slug,
    },
  };
};

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: [{params: {slug: 'a'}}, {params: {slug: 'b'}}],
  };
};
