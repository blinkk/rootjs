import {RichText} from '@blinkk/root-cms/richtext';
import {
  ArticleHeader,
  ArticleLayout,
  ArticleSection,
} from '@/components/ArticleLayout/ArticleLayout.js';
import Block, {RichTextBlocksProvider} from '@/components/Block/Block.js';
import {Emoji} from '@/components/Emoji/Emoji.js';
import {Text} from '@/components/Text/Text.js';
import {BlogPostsDoc, RootCMSRichText} from '@/root-cms.js';
import {formatBlogPostDate} from '@/utils/blog.js';
import {joinClassNames} from '@/utils/classes.js';
import styles from './BlogPost.module.scss';

const RICH_TEXT_COMPONENTS = {
  Emoji: Emoji,
};

interface BlogPostProps {
  doc: BlogPostsDoc;
  className?: string;
}

/**
 * Renders a full blog post article from a CMS blog post document, in a single
 * column with the same header and type styles as the guides and docs.
 */
export function BlogPost(props: BlogPostProps) {
  const fields = props.doc.fields || {};
  const title = fields.meta?.title;
  const content = fields.content || {};
  const blocks = content.blocks || [];
  const sections = content.sections || [];
  const date = formatBlogPostDate(props.doc);

  return (
    <RichTextBlocksProvider components={RICH_TEXT_COMPONENTS}>
      <ArticleLayout
        className={joinClassNames(styles.blogPost, props.className)}
        header={
          <ArticleHeader
            back={{href: '/blog/', label: 'All posts'}}
            eyebrow={date.label}
            title={title}
          />
        }
      >
        {content.body && <Body body={content.body} />}
        {sections.length > 0
          ? sections.map((section) => (
              <ArticleSection id={section.id} title={section.title}>
                {section.body && <Body body={section.body} />}
              </ArticleSection>
            ))
          : // Deprecated.
            blocks.map((block, index) => (
              <div
                key={`${block._type}-${index}`}
                className={styles.block}
                data-type={block._type}
              >
                <Block {...block} className={block._type} />
              </div>
            ))}
      </ArticleLayout>
    </RichTextBlocksProvider>
  );
}

function Body(props: {body: RootCMSRichText}) {
  if (!props.body.blocks?.length) {
    return null;
  }
  return (
    <Text as="div" size="p" className={styles.body}>
      <RichText data={props.body} />
    </Text>
  );
}
