import {Handler, HandlerContext, Request} from '@blinkk/root';
import {RootCMSClient} from '@blinkk/root-cms';

import {
  PageModuleFields,
  PageModules,
} from '@/components/PageModules/PageModules.js';
import {PAGE_CONTEXT} from '@/hooks/usePage.js';
import {BaseLayout} from '@/layouts/BaseLayout.js';
import {PagesDoc} from '@/root-cms.js';

interface Props {
  slug: string;
  doc: PagesDoc;
}

export default function Page(props: Props) {
  const fields = props.doc.fields || {};
  const modules: PageModuleFields[] = fields.content?.modules || [];
  return (
    <BaseLayout title={fields?.meta?.title || 'Blog'}>
      <PAGE_CONTEXT.Provider value={props}>
        <PageModules modules={modules} />
      </PAGE_CONTEXT.Provider>
    </BaseLayout>
  );
}

/** SSR handler. */
export const handle: Handler = async (req: Request) => {
  const ctx = req.handlerContext as HandlerContext<Props>;
  const slug = ctx.params.page || 'index';
  const mode = String(req.query.preview) === 'true' ? 'draft' : 'published';

  const cmsClient = new RootCMSClient(req.rootConfig);
  const doc = await cmsClient.getDoc<PagesDoc>('Pages', slug, {mode});
  if (!doc) {
    return ctx.render404();
  }
  const supportedLocales = doc.sys.locales || ['en'];
  const locale = ctx.getPreferredLocale(supportedLocales);

  const promisesMap: Record<string, any> = {
    translations: cmsClient.loadTranslationsForLocale(locale),
  };
  if (slug === 'index') {
    const orderBy = mode === 'draft' ? 'sys.createdAt' : 'sys.firstPublishedAt';
    promisesMap.blogPosts = cmsClient.listDocs('BlogPosts', {
      mode,
      query: (q) => {
        return q.where('sys.locales', 'array-contains', locale);
      },
      orderBy,
      orderByDirection: 'desc',
      limit: 3,
    });
  }
  const {translations, ...extraProps} = await resolvePromisesMap(promisesMap);
  const props = {slug, doc, ...extraProps};
  return ctx.render(props, {locale, translations});
};

async function resolvePromisesMap(promisesMap: Record<string, Promise<any>>) {
  const keys = Object.keys(promisesMap);
  const promises = Object.values(promisesMap);
  const values = await Promise.all(promises);
  const results: Record<string, any> = {};
  keys.forEach((key, i) => {
    results[key] = values[i];
  });
  return results;
}
