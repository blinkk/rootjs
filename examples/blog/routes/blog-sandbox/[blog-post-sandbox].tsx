import {GetStaticPaths, GetStaticProps} from '@blinkk/root';
import {getDoc} from '@blinkk/root-cms';
import Page from '../blog/[blog-post].js';

export default Page;

export const getStaticPaths: GetStaticPaths = async () => {
  return {paths: []};
}

export const getStaticProps: GetStaticProps = async (ctx) => {
  if (import.meta.env.PROD) {
    return {notFound: true};
  }

  const slug = ctx.params['blog-post-sandbox'];
  const doc = await getDoc(ctx.rootConfig, 'BlogPostsSandbox', slug, {
    mode: 'draft',
  });
  return {props: {slug, doc}};
};
