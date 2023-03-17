import {GetStaticProps, Handler, HandlerContext, Request} from '@blinkk/root';
import {getDoc} from '@blinkk/root-cms';
import Page from './[...page].js';

export default Page;

/** SSG props getter. */
export const getStaticProps: GetStaticProps = async (ctx) => {
  const slug = 'index';
  const doc = await getDoc(ctx.rootConfig, 'Pages', slug, {
    mode: 'published',
  });
  if (!doc) {
    return {notFound: true};
  }
  return {props: {slug: slug, doc}};
};

/** SSR handler. */
export const handle: Handler = async (req: Request) => {
  const ctx = req.handlerContext as HandlerContext;
  const slug = 'index';
  const mode = String(req.query.preview) === 'true' ? 'draft' : 'published';
  const doc = await getDoc(req.rootConfig, 'Pages', slug, {
    mode,
  });
  if (!doc) {
    return ctx.render404();
  }
  return ctx.render({slug, doc});
};
