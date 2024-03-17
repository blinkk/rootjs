import {Body, Handler, HandlerContext, Head, Html, Request, useTranslations} from '@blinkk/root';
import {RootCMSClient} from '@blinkk/root-cms';
import {PagesDoc} from '@/root-cms';

interface Props {
  doc: PagesDoc;
}

export default function Page(props: Props) {
  const t = useTranslations();
  const fields = props.doc.fields || {};
  return (
    <Html>
      <Head>
        <title>{t(fields.meta?.title || '')}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <Body>
        <h1>{t(fields.meta?.title || '')}</h1>
        {fields.meta?.description && (
          <p>{t(fields.meta.description)}</p>
        )}
      </Body>
    </Html>
  );
}

/** SSR handler. */
export const handle: Handler = async (req: Request) => {
  const ctx = req.handlerContext as HandlerContext;
  const slug = ctx.params.page || 'index';
  const mode = String(req.query.preview) === 'true' ? 'draft' : 'published';

  const cmsClient = new RootCMSClient(req.rootConfig);
  const doc = await cmsClient.getDoc<PagesDoc>('Pages', slug, {mode});
  if (!doc) {
    return ctx.render404();
  }
  const supportedLocales = doc.sys.locales || ['en'];
  const locale = ctx.getPreferredLocale(supportedLocales);

  const translations = await cmsClient.loadTranslationsForLocale(locale);
  const props = {doc};
  return ctx.render(props, {locale, translations});
};
