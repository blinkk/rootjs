import {useTranslations} from '@blinkk/root';
import {RichText} from '@blinkk/root-cms/richtext';
import {IconArrowLeft, IconArrowRight, IconCheck} from '@tabler/icons-preact';
import {Container} from '@/components/Container/Container.js';
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
  const questions = content.questions || [];
  const nextGuide = getNextGuide(props.doc, props.guides || []);

  return (
    <BaseLayout
      title={meta.title ? `${t(meta.title)} – Root.js` : 'Guides – Root.js'}
      description={meta.description}
      image={meta.image?.src}
    >
      <div className={styles.guide}>
        <Container className={styles.header}>
          <a className={styles.back} href="/guides/">
            <IconArrowLeft size={16} aria-hidden="true" />
            {t('All guides')}
          </a>
          {content.eyebrow && (
            <div className={styles.eyebrow}>{t(content.eyebrow)}</div>
          )}
          {content.title && (
            <Text as="h1" size="h2" className={styles.title}>
              {t(content.title)}
            </Text>
          )}
          {content.intro && (
            <Text as="div" size="p-large" className={styles.intro}>
              <RichText data={content.intro} />
            </Text>
          )}
        </Container>

        {content.heroImage?.src && (
          <Container className={styles.hero}>
            <figure className={styles.frame}>
              <Image
                {...(content.heroImage as ImageProps)}
                sizes={{sm: 500, md: 1000, default: 1200}}
                loading="eager"
              />
            </figure>
          </Container>
        )}

        <Container className={styles.layout}>
          <aside className={styles.aside}>
            {takeaways.length > 0 && (
              <div className={styles.glance}>
                <Text as="h2" size="small" className={styles.asideTitle}>
                  {t('At a glance')}
                </Text>
                <UnstyledList className={styles.takeaways}>
                  {takeaways.map((item) => (
                    <li>
                      <IconCheck size={16} aria-hidden="true" />
                      <span>{t(item.text || '')}</span>
                    </li>
                  ))}
                </UnstyledList>
              </div>
            )}
            {sections.length > 0 && (
              <nav className={styles.toc} aria-label={t('On this page')}>
                <Text as="h2" size="small" className={styles.asideTitle}>
                  {t('On this page')}
                </Text>
                <UnstyledList className={styles.tocLinks}>
                  {sections.map((section) => (
                    <li>
                      <a href={`#${section.id || ''}`}>
                        {t(section.title || '')}
                      </a>
                    </li>
                  ))}
                  {questions.length > 0 && (
                    <li>
                      <a href="#questions">{t('Questions to ask')}</a>
                    </li>
                  )}
                </UnstyledList>
              </nav>
            )}
          </aside>

          <article className={styles.article}>
            {sections.map((section) => (
              <Section section={section} />
            ))}

            {questions.length > 0 && (
              <section className={styles.section} id="questions">
                <Text as="h2" size="h4" className={styles.sectionTitle}>
                  {t('Questions to ask')}
                </Text>
                <Text as="p" size="p" className={styles.sectionBody}>
                  {t(
                    'Use these when you compare content platforms. Here is how Root CMS answers each one.'
                  )}
                </Text>
                <dl className={styles.questions}>
                  {questions.map((item) => (
                    <div className={styles.question}>
                      <dt>{t(item.question || '')}</dt>
                      <dd>{t(item.answer || '')}</dd>
                    </div>
                  ))}
                </dl>
              </section>
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
          </article>
        </Container>
      </div>
    </BaseLayout>
  );
}

function Section(props: {section: GuideSection}) {
  const t = useTranslations();
  const section = props.section;
  return (
    <section className={styles.section} id={section.id}>
      {section.title && (
        <Text as="h2" size="h4" className={styles.sectionTitle}>
          {t(section.title)}
        </Text>
      )}
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
    </section>
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
