import {GetStaticProps, Handler, HandlerContext, Request} from '@blinkk/root';
import {getDoc, listDocs} from '@blinkk/root-cms';
import Page from './[...page].js';

export default Page;

/** SSR handler. */
export const handle: Handler = async (req: Request) => {
  const ctx = req.handlerContext as HandlerContext;
  const slug = 'index';
  const mode = String(req.query.preview) === 'true' ? 'draft' : 'published';
  const [doc, blogPosts] = await Promise.all([
    getDoc(req.rootConfig, 'Pages', slug, {mode}),
    listDocs(req.rootConfig, 'BlogPosts', {
      mode,
      orderBy: 'sys.firstPublishedAt',
      orderByDirection: 'desc',
      limit: 3
    }),
  ]);
  if (!doc) {
    return ctx.render404();
  }
  return ctx.render({slug, doc, blogPosts});
};
