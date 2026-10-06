import {useRequestContext, useTranslations} from '@blinkk/root';
import {RichText} from '@blinkk/root-cms/richtext';
import {IconArrowRight} from '@tabler/icons-preact';
import {Container} from '@/components/Container/Container.js';
import {Image, ImageProps} from '@/components/Image/Image.js';
import {node} from '@/components/RootNode/RootNode.js';
import {SectionHeader} from '@/components/SectionHeader/SectionHeader.js';
import {Text} from '@/components/Text/Text.js';
import {GuidesDoc, TemplateGuidesFields} from '@/root-cms.js';
import {joinClassNames} from '@/utils/classes.js';
import {getGuideUrl} from '@/utils/guides.js';
import styles from './TemplateGuides.module.scss';

export type TemplateGuidesProps = TemplateGuidesFields & {
  className?: string;
};

/**
 * Lists every doc in the `Guides` collection. The guides are fetched by the
 * page route (see `addModuleData()` in `utils/module-data.ts`) and read from
 * the page props.
 */
export function TemplateGuides(props: TemplateGuidesProps) {
  const ctx = useRequestContext();
  const guides: GuidesDoc[] = ctx.props?.guides || [];
  return (
    <div
      id={props.id}
      className={joinClassNames(props.className, styles.guides)}
    >
      <Container>
        <SectionHeader
          eyebrow={props.eyebrow}
          title={props.title}
          body={props.body}
          titleSize="h1"
        />
        {props.docsLink && (
          <div className={styles.docsLink}>
            {node('docsLink', <RichText data={props.docsLink} />)}
          </div>
        )}
      </Container>
      <Container className={styles.grid}>
        {guides.map((guide) => (
          <GuideCard guide={guide} />
        ))}
      </Container>
    </div>
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
