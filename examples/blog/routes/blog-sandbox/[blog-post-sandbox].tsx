import {GetStaticPaths, GetStaticProps} from '@blinkk/root';
import Page from '../blog/[blog-post].js';

export default Page;

export const getStaticPaths: GetStaticPaths = async () => {
  return {paths: []};
}

export const getStaticProps: GetStaticProps = async (ctx) => {
  if (import.meta.env.PROD) {
    return {notFound: true};
  }

  const slug = ctx.params.slug;
  // const doc = await getDoc('BlogPostsSandbox', slug);
  const doc = {};
  return {props: {slug, doc}};
};
