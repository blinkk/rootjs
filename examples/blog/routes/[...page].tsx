import {GetStaticPaths, GetStaticProps, Handler, HandlerContext, Request} from '@blinkk/root';
import {getDoc} from '@blinkk/root-cms';
import {BaseLayout} from '@/layouts/BaseLayout.js';
import {PagesDoc} from '@/root-cms.js';
import {PageModuleFields, PageModules} from '@/components/PageModules/PageModules.js';
import {PAGE_CONTEXT} from '@/hooks/usePage.js';

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
  const slug = ctx.params.page;
  const mode = String(req.query.preview) === 'true' ? 'draft' : 'published';
  const doc = await getDoc<PagesDoc>(req.rootConfig, 'Pages', slug, {
    mode,
  });
  if (!doc) {
    return ctx.render404();
  }
  return ctx.render({slug, doc});
};
