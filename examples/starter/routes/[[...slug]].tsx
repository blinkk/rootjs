import {Handler, HandlerContext, Request, Response} from '@blinkk/root';
import {createRoute, RouteRequest} from '@blinkk/root-cms';
import {PageModules} from '@/components/PageModules/PageModules.js';
import {BaseLayout} from '@/layouts/BaseLayout.js';
import {PagesDoc} from '@/root-cms.js';

interface PageProps {
  doc?: PagesDoc;
  /** Set in dev when the home page can't be loaded from the CMS. */
  setupError?: string;
}

/**
 * Renders a doc from the `Pages` collection. The doc's slug comes from the URL,
 * e.g. `/about` renders `Pages/about` and `/` renders `Pages/index`.
 */
export default function Page(props: PageProps) {
  if (!props.doc) {
    return <Welcome error={props.setupError} />;
  }
  const fields = props.doc.fields || {};
  return (
    <BaseLayout
      title={fields.meta?.title}
      description={fields.meta?.description}
      image={fields.meta?.image?.src}
    >
      <PageModules modules={fields.content?.modules} />
    </BaseLayout>
  );
}

const route = createRoute({
  collection: 'Pages',
  slugParam: 'slug',
  notFoundHook: (req: Request) => {
    const ctx = req.handlerContext as HandlerContext;
    // Until the home page exists, show setup steps on it in dev.
    if (import.meta.env.DEV && isHomePage(ctx)) {
      return ctx.render({});
    }
    return ctx.render404();
  },
});

export const handle: Handler = async (req: Request, res: Response) => {
  try {
    return await route.handle(req as RouteRequest, res);
  } catch (err) {
    // Until Firebase is set up, show setup steps on the home page in dev.
    const ctx = req.handlerContext as HandlerContext;
    if (import.meta.env.DEV && isHomePage(ctx)) {
      return ctx.render({setupError: String(err)});
    }
    throw err;
  }
};

function isHomePage(ctx: HandlerContext) {
  return (ctx.params.slug || 'index') === 'index';
}

/** Getting started steps, shown in dev until the home page exists. */
function Welcome(props: {error?: string}) {
  return (
    <BaseLayout title="Welcome to Root.js" noindex>
      <section style={{maxWidth: '720px', margin: '0 auto', padding: '40px 24px'}}>
        <h1>Welcome to Root.js</h1>
        {props.error ? (
          <>
            <p>
              The CMS couldn't load the home page. Connect your own Firebase
              project to get started:
            </p>
            <ol>
              <li>
                Replace the <code>firebaseConfig</code> placeholders in{' '}
                <code>root.config.ts</code>.
              </li>
              <li>
                Run <code>gcloud auth application-default login</code>.
              </li>
              <li>
                Run{' '}
                <code>pnpm exec root-cms init-firebase --admin=you@example.com</code>
                .
              </li>
            </ol>
            <pre>{props.error}</pre>
          </>
        ) : (
          <p>
            Open the <a href="/cms/">CMS</a>, create a doc in the{' '}
            <code>Pages</code> collection with the slug <code>index</code>, and
            publish it to replace this page.
          </p>
        )}
        <p>
          See <a href="https://rootjs.dev/docs/">Getting started</a> for more.
        </p>
      </section>
    </BaseLayout>
  );
}
