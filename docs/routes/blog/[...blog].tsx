import {RichText} from '@blinkk/root-cms/richtext';
import {CopyBlock} from '@/blocks/CopyBlock/CopyBlock.js';
import Block, {RichTextBlocksProvider} from '@/components/Block/Block.js';
import {Container} from '@/components/Container/Container.js';
import {Emoji} from '@/components/Emoji/Emoji.js';
import {Text} from '@/components/Text/Text.js';
import {BaseLayout} from '@/layouts/BaseLayout.js';
import {BlogPostsDoc, BlogPostsFields, RootCMSRichText} from '@/root-cms.js';
import {cmsRoute} from '@/utils/cms-route.js';
import styles from './[...blog].module.scss';

const RICH_TEXT_COMPONENTS = {
  Emoji: Emoji,
};

export interface PageProps {
  doc: BlogPostsDoc;
}

export default function Page(props: PageProps) {
  const fields = props.doc.fields || {};
  const title = fields?.meta?.title;
  const description = fields?.meta?.description;
  const image = fields.meta?.image?.src;
  const content = fields.content || {};
  const blocks = content.blocks || [];
  const sections = content.sections || [];

  const publishedAt = props.doc.sys.firstPublishedAt || props.doc.sys.createdAt;
  const publishDate = formatDate(publishedAt);

  return (
    <RichTextBlocksProvider components={RICH_TEXT_COMPONENTS}>
      <BaseLayout title={title} description={description} image={image}>
        <Container className={styles.container}>
          <div className={styles.content}>
            <div className={styles.headline}>
              <Text className={styles.headlineTitle} as="h1" size="h3">
                {title}
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
                  {blocks.map((block) => (
                    <Block {...block} className={block._type} />
                  ))}
                </>
              )}
            </div>
          </div>
        </Container>
      </BaseLayout>
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
  const year = parts.find((part) => part.type === 'year').value;
  const month = parts.find((part) => part.type === 'month').value;
  const day = parts.find((part) => part.type === 'day').value;
  const formattedDate = `${year}-${month}-${day}`;
  return formattedDate;
}

export const {handle} = cmsRoute({
  collection: 'BlogPosts',
  slugParam: 'blog',
});
