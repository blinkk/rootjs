import {BaseLayout} from '@/layouts/base.js';

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

export async function getStaticProps(ctx: {params: Record<string, string>}) {
  return {
    props: {
      slug: ctx.params.slug,
    },
  };
}

export async function getStaticPaths() {
  return {
    paths: [{params: {slug: 'a'}}, {params: {slug: 'b'}}],
  };
}
