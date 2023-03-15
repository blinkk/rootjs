import {GetStaticPaths, GetStaticProps, Handler, HandlerContext, Request} from '@blinkk/root';
import {getDoc} from '@blinkk/root-cms';
import {BaseLayout} from '@/layouts/BaseLayout.js';
import {PagesDoc} from '@/root-cms.js';
import {PageModuleFields, PageModules} from '@/components/PageModules/PageModules.js';

interface Props {
  slug: string;
  doc: PagesDoc;
}

export default function Page(props: Props) {
  const fields = props.doc.fields || {};
  const modules: PageModuleFields[] = fields.content?.modules || [];
  return (
    <BaseLayout title={fields?.meta?.title || 'Blog'}>
      <PageModules modules={modules} />
    </BaseLayout>
  );
}

/** Returns a list of routes for the SSG build. */
export const getStaticPaths: GetStaticPaths = async () => {
  // TODO(stevenle): list paths from db.
  return {paths: []};
}

/** Fetches the Root.js CMS doc as props for SSG builds. */
export const getStaticProps: GetStaticProps = async (ctx) => {
  const slug = ctx.params.page;
  const doc = await getDoc(ctx.rootConfig, 'Pages', slug, {mode: 'published'});
  if (!doc) {
    return {notFound: true};
  }
  return {props: {slug, doc}};
};

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
