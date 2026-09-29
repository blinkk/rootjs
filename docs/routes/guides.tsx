import type {Handler, HandlerContext, Request, Response} from '@blinkk/root';
import {useTranslations} from '@blinkk/root';
import {
  RootCMSClient,
  resolveLocaleFallbacks,
  translationsForLocale,
} from '@blinkk/root-cms/client';
import {IconArrowRight} from '@tabler/icons-preact';
import {Container} from '@/components/Container/Container.js';
import {Image, ImageProps} from '@/components/Image/Image.js';
import {SectionHeader} from '@/components/SectionHeader/SectionHeader.js';
import {Text} from '@/components/Text/Text.js';
import {BaseLayout} from '@/layouts/BaseLayout.js';
import {GuidesDoc} from '@/root-cms.js';
import {getGuideUrl, sortGuides} from '@/utils/guides.js';
import styles from './guides.module.scss';

interface PageProps {
  guides: GuidesDoc[];
}

type GuidesRequest = Request & {
  cmsClient?: RootCMSClient;
};

let cmsClient: RootCMSClient | null = null;

/** The `/guides/` index, listing every doc in the `Guides` collection. */
export default function Page(props: PageProps) {
  const t = useTranslations();
  return (
    <BaseLayout
      title="Guides – Root.js"
      description="Plain-language guides to Root.js for the people choosing a content platform: editing, publishing, localization, AI, governance and more."
    >
      <div className={styles.page}>
        <Container>
          <SectionHeader
            eyebrow="Root.js guides"
            title="See how your team would work in Root.js"
            body="Short, non-technical tours of each part of Root.js and its CMS, with screenshots from the app. Written for the people choosing a content platform, not just the developers building on it."
            titleSize="h1"
          />
          <p className={styles.docsLink}>
            {t('Looking for setup instructions and API references?')}{' '}
            <a href="/docs/">{t('Read the developer docs')}</a>
          </p>
        </Container>
        <Container className={styles.grid}>
          {props.guides.map((guide) => (
            <GuideCard guide={guide} />
          ))}
        </Container>
      </div>
    </BaseLayout>
  );
}

function GuideCard(props: {guide: GuidesDoc}) {
  const t = useTranslations();
  const fields = props.guide.fields || {};
  const meta = fields.meta || {};
  const eyebrow = fields.content?.eyebrow;
  const image = meta.image?.src ? meta.image : fields.content?.heroImage;
  return (
    <a className={styles.card} href={getGuideUrl(props.guide)}>
      {image?.src && (
        <div className={styles.cardImage}>
          <Image {...(image as ImageProps)} sizes={{sm: 500, default: 600}} />
        </div>
      )}
      <div className={styles.cardCopy}>
        {eyebrow && <div className={styles.cardEyebrow}>{t(eyebrow)}</div>}
        <Text as="h2" size="h5" className={styles.cardTitle}>
          {t(meta.title || '')}
        </Text>
        {meta.description && (
          <Text as="p" size="small" className={styles.cardDescription}>
            {t(meta.description)}
          </Text>
        )}
        <span className={styles.cardLink}>
          {t('Read the guide')}
          <IconArrowRight size={16} aria-hidden="true" />
        </span>
      </div>
    </a>
  );
}

export const handle: Handler = async (req: GuidesRequest, res: Response) => {
  if (!cmsClient) {
    cmsClient = new RootCMSClient(req.rootConfig!);
  }
  req.cmsClient = cmsClient;

  const ctx = req.handlerContext as HandlerContext<PageProps>;
  const mode = String(req.query.preview) === 'true' ? 'draft' : 'published';
  const result = await cmsClient.listDocs<GuidesDoc>('Guides', {mode});
  const guides = sortGuides(result.docs);
  // `array-contains-any` queries accept up to 30 values.
  const tags = ['common', ...guides.map((g) => `Guides/${g.slug}`)].slice(
    0,
    30
  );
  const translationsMap = await cmsClient.loadTranslations({tags});
  const locale = ctx.route.isDefaultLocale
    ? ctx.getPreferredLocale(['en'])
    : ctx.route.locale;
  const translations = translationsForLocale(
    translationsMap,
    resolveLocaleFallbacks(cmsClient.rootConfig.i18n, locale)
  );

  if (mode === 'published') {
    res.setHeader('cache-control', 'public, max-age=15, s-maxage=30');
    if (ctx.route.isDefaultLocale) {
      res.setHeader('vary', 'accept-language, x-country-code');
    }
  } else {
    res.setHeader('cache-control', 'private');
  }
  return ctx.render({guides}, {locale, translations});
};
