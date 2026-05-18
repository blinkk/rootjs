import {RichText} from '@blinkk/root-cms/richtext';
import {CopyBlock} from '@/blocks/CopyBlock/CopyBlock.js';
import Block, {RichTextBlocksProvider} from '@/components/Block/Block.js';
import {Emoji} from '@/components/Emoji/Emoji.js';
import {Text, TextSize} from '@/components/Text/Text.js';
import {BlogPostsDoc, RootCMSRichText} from '@/root-cms.js';
import {joinClassNames} from '@/utils/classes.js';
import styles from './BlogPost.module.scss';

const RICH_TEXT_COMPONENTS = {
  Emoji: Emoji,
};

interface BlogPostProps {
  doc: BlogPostsDoc;
  className?: string;
  titleHref?: string;
  titleAs?: preact.JSX.ElementType;
  titleSize?: TextSize;
}

/** Renders a full blog post article from a CMS blog post document. */
export function BlogPost(props: BlogPostProps) {
  const fields = props.doc.fields || {};
  const title = fields?.meta?.title;
  const content = fields.content || {};
  const blocks = content.blocks || [];
  const sections = content.sections || [];

  const publishedAt = props.doc.sys.firstPublishedAt || props.doc.sys.createdAt;
  const publishDate = formatDate(publishedAt);
  const titleAs = props.titleAs || 'h1';
  const titleSize = props.titleSize || 'h3';

  return (
    <RichTextBlocksProvider components={RICH_TEXT_COMPONENTS}>
      <article className={joinClassNames(styles.content, props.className)}>
        <div className={styles.headline}>
          <Text className={styles.headlineTitle} as={titleAs} size={titleSize}>
            {props.titleHref ? (
              <a className={styles.headlineLink} href={props.titleHref}>
                {title}
              </a>
            ) : (
              title
            )}
          </Text>
          <div className={styles.headlinePublishDate}>{publishDate}</div>
        </div>
        <div className={styles.body}>
          {content.body && <CopyBlock body={content.body} />}
          {sections.length > 0 ? (
            <>
              {sections.map((section) => (
                <Section {...section} />
              ))}
            </>
          ) : (
            <>
              {/* Deprecated. */}
              {blocks.map((block, index) => (
                <Block
                  key={`${block._type}-${index}`}
                  {...block}
                  className={block._type}
                />
              ))}
            </>
          )}
        </div>
      </article>
    </RichTextBlocksProvider>
  );
}

interface SectionProps {
  id?: string;
  title?: string;
  body?: RootCMSRichText;
}

function Section(props: SectionProps) {
  return (
    <div id={props.id} className={styles.section}>
      {props.title && (
        <Text className={styles.sectionTitle} as="h2" size="h5">
          {props.title}
        </Text>
      )}
      {props.body && props.body.blocks?.length && (
        <div className={styles.body}>
          <RichText data={props.body} />
        </div>
      )}
    </div>
  );
}

function formatDate(millis: number) {
  const date = new Date(millis);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = getDatePart(parts, 'year');
  const month = getDatePart(parts, 'month');
  const day = getDatePart(parts, 'day');
  const formattedDate = `${year}-${month}-${day}`;
  return formattedDate;
}

function getDatePart(parts: Intl.DateTimeFormatPart[], type: string) {
  return parts.find((part) => part.type === type)?.value || '';
}
