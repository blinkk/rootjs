import {useTranslations} from '@blinkk/root';
import {RichText} from '@blinkk/root-cms/richtext';
import {IconArrowRight, IconCheck} from '@tabler/icons-preact';
import {
  ArticleAsideSection,
  ArticleHeader,
  ArticleLayout,
  ArticleSection,
  ArticleToc,
} from '@/components/ArticleLayout/ArticleLayout.js';
import {Image, ImageProps} from '@/components/Image/Image.js';
import {Text} from '@/components/Text/Text.js';
import {UnstyledList} from '@/components/UnstyledList/UnstyledList.js';
import {BaseLayout} from '@/layouts/BaseLayout.js';
import {GuidesDoc, GuidesFields} from '@/root-cms.js';
import {cmsRoute} from '@/utils/cms-route.js';
import {getGuideUrl, sortGuides} from '@/utils/guides.js';
import styles from './[...slug].module.scss';

export interface PageProps {
  doc: GuidesDoc;
  /** Every guide in the collection, used to link to the next guide. */
  guides: GuidesDoc[];
}

type GuideSection = NonNullable<
  NonNullable<GuidesFields['content']>['sections']
>[number];

export default function Page(props: PageProps) {
  const t = useTranslations();
  const fields = props.doc.fields || {};
  const meta = fields.meta || {};
  const content = fields.content || {};
  const sections = content.sections || [];
  const takeaways = content.takeaways || [];
  const faq = content.faq || [];
  const nextGuide = getNextGuide(props.doc, props.guides || []);

  const tocItems = sections.map((section) => ({
    href: `#${section.id || ''}`,
    label: section.title || '',
  }));
  if (faq.length > 0) {
    tocItems.push({href: '#faq', label: 'Frequently asked questions'});
  }

  return (
    <BaseLayout
      title={meta.title ? `${t(meta.title)} – Root.js` : 'Guides – Root.js'}
      description={meta.description}
      image={meta.image?.src}
    >
      <ArticleLayout
        header={
          <ArticleHeader
            back={{href: '/guides/', label: 'All guides'}}
            eyebrow={content.eyebrow}
            title={content.title}
            intro={content.intro && <RichText data={content.intro} />}
          />
        }
        media={
          content.heroImage?.src && (
            <figure className={styles.frame}>
              <Image
                {...(content.heroImage as ImageProps)}
                sizes={{sm: 500, md: 1000, default: 1200}}
                loading="eager"
              />
            </figure>
          )
        }
        aside={
          <>
            {takeaways.length > 0 && (
              <ArticleAsideSection
                className={styles.glance}
                title="At a glance"
              >
                <UnstyledList className={styles.takeaways}>
                  {takeaways.map((item) => (
                    <li>
                      <IconCheck size={16} aria-hidden="true" />
                      <span>{t(item.text || '')}</span>
                    </li>
                  ))}
                </UnstyledList>
              </ArticleAsideSection>
            )}
            <ArticleToc items={tocItems} />
          </>
        }
      >
        {sections.map((section) => (
          <Section section={section} />
        ))}

        {faq.length > 0 && (
          <ArticleSection id="faq" title="Frequently asked questions">
            <dl className={styles.faq}>
              {faq.map((item) => (
                <div className={styles.faqItem}>
                  <dt>{t(item.question || '')}</dt>
                  <dd>{t(item.answer || '')}</dd>
                </div>
              ))}
            </dl>
          </ArticleSection>
        )}

        {nextGuide && (
          <a className={styles.next} href={getGuideUrl(nextGuide)}>
            <span className={styles.nextLabel}>{t('Next guide')}</span>
            <span className={styles.nextTitle}>
              {t(nextGuide.fields?.meta?.title || '')}
              <IconArrowRight size={20} aria-hidden="true" />
            </span>
          </a>
        )}
      </ArticleLayout>
    </BaseLayout>
  );
}

function Section(props: {section: GuideSection}) {
  const t = useTranslations();
  const section = props.section;
  return (
    <ArticleSection id={section.id} title={section.title}>
      {section.body && (
        <Text as="div" size="p" className={styles.sectionBody}>
          <RichText data={section.body} />
        </Text>
      )}
      {section.image?.src && (
        <figure className={styles.figure}>
          <div className={styles.frame}>
            <Image
              {...(section.image as ImageProps)}
              sizes={{sm: 500, md: 900, default: 820}}
            />
          </div>
          {section.caption && (
            <figcaption className={styles.caption}>
              {t(section.caption)}
            </figcaption>
          )}
        </figure>
      )}
    </ArticleSection>
  );
}

/**
 * Returns the guide to suggest next: the `meta.nextGuide` reference if set,
 * otherwise the following guide in index order.
 */
function getNextGuide(doc: GuidesDoc, guides: GuidesDoc[]) {
  const nextId = doc.fields?.meta?.nextGuide?.id;
  if (nextId) {
    const match = guides.find((guide) => guide.id === nextId);
    if (match) {
      return match;
    }
  }
  const sorted = sortGuides(guides);
  const index = sorted.findIndex((guide) => guide.id === doc.id);
  if (index === -1) {
    return null;
  }
  return sorted[index + 1] || null;
}

export const {handle} = cmsRoute({
  collection: 'Guides',
  slugParam: 'slug',
  fetchData: (ctx) => ({
    guides: ctx.cmsClient
      .listDocs<GuidesDoc>('Guides', {mode: ctx.mode})
      .then((res) => res.docs),
  }),
});
