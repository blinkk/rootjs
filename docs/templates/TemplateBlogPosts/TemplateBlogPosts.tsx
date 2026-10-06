import {useRequestContext, useTranslations} from '@blinkk/root';
import {IconArrowRight} from '@tabler/icons-preact';
import {Container} from '@/components/Container/Container.js';
import {SectionHeader} from '@/components/SectionHeader/SectionHeader.js';
import {Text} from '@/components/Text/Text.js';
import {UnstyledList} from '@/components/UnstyledList/UnstyledList.js';
import {BlogPostsDoc, TemplateBlogPostsFields} from '@/root-cms.js';
import {formatBlogPostDate, getBlogPostUrl} from '@/utils/blog.js';
import {joinClassNames} from '@/utils/classes.js';
import styles from './TemplateBlogPosts.module.scss';

export type TemplateBlogPostsProps = TemplateBlogPostsFields & {
  className?: string;
};

/**
 * Lists every doc in the `BlogPosts` collection in a single column, newest
 * first. The posts are fetched by the page route (see `addModuleData()` in
 * `utils/module-data.ts`) and read from the page props.
 */
export function TemplateBlogPosts(props: TemplateBlogPostsProps) {
  const ctx = useRequestContext();
  const posts: BlogPostsDoc[] = ctx.props?.blogPosts || [];
  return (
    <div
      id={props.id}
      className={joinClassNames(props.className, styles.blogPosts)}
    >
      <Container className={styles.inner}>
        <SectionHeader
          eyebrow={props.eyebrow}
          title={props.title}
          body={props.body}
          titleSize="h1"
        />
        <UnstyledList className={styles.posts}>
          {posts.map((post) => (
            <li>
              <PostCard post={post} />
            </li>
          ))}
        </UnstyledList>
      </Container>
    </div>
  );
}

function PostCard(props: {post: BlogPostsDoc}) {
  const t = useTranslations();
  const meta = props.post.fields?.meta || {};
  const date = formatBlogPostDate(props.post);
  return (
    <a className={styles.card} href={getBlogPostUrl(props.post)}>
      <time className={styles.cardDate} dateTime={date.iso}>
        {date.label}
      </time>
      <Text as="h2" size="h4" className={styles.cardTitle}>
        {t(meta.title || '')}
      </Text>
      {meta.description && (
        <Text as="p" size="p" className={styles.cardDescription}>
          {t(meta.description)}
        </Text>
      )}
      <span className={styles.cardLink}>
        {t('Read the post')}
        <IconArrowRight size={16} aria-hidden="true" />
      </span>
    </a>
  );
}
