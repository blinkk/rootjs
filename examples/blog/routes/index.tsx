import {Handler, HandlerContext, Request} from '@blinkk/root';
import {RootCMSClient} from '@blinkk/root-cms';
import Page from './[...page].js';

export default Page;

/** SSR handler. */
export const handle: Handler = async (req: Request) => {
  const ctx = req.handlerContext as HandlerContext;
  const slug = 'index';
  const mode = String(req.query.preview) === 'true' ? 'draft' : 'published';
  const orderBy = mode === 'draft' ? 'sys.createdAt' : 'sys.firstPublishedAt';
  const locale = ctx.params.$locale || req.params.hl || 'en';
  const cmsClient = new RootCMSClient(req.rootConfig);
  const [doc, blogPosts, translations] = await Promise.all([
    cmsClient.getDoc('Pages', slug, {mode}),
    cmsClient.listDocs('BlogPosts', {
      mode,
      orderBy: orderBy,
      orderByDirection: 'desc',
      limit: 3,
    }),
    cmsClient.loadTranslationsForLocale(locale),
  ]);
  if (!doc) {
    return ctx.render404();
  }
  return ctx.render({slug, doc, blogPosts}, {locale, translations});
};
