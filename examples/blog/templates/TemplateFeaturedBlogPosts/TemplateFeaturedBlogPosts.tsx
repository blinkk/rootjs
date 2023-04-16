import {useTranslations} from '@blinkk/root';

import {Container} from '@/components/Container/Container.js';
import {Heading} from '@/components/Heading/Heading.js';
import {usePage} from '@/hooks/usePage.js';
import {BlogPostsDoc, TemplateFeaturedBlogPostsFields} from '@/root-cms.js';

import styles from './TemplateFeaturedBlogPosts.module.scss';

export function TemplateFeaturedBlogPosts(
  props: TemplateFeaturedBlogPostsFields
) {
  const page = usePage();
  const blogPosts: BlogPostsDoc[] = page.blogPosts.docs || [];
  if (blogPosts.length === 0) {
    return null;
  }

  const t = useTranslations();
  const id = props.id || 'featured-posts';

  const featured = blogPosts[0];
  const morePosts = blogPosts.slice(1);

  return (
    <Container as="section" id={id} aria-label={t('Featured Posts')}>
      <div className={styles.layout}>
        <FeaturedPost doc={featured} />
        {morePosts.length > 0 && <MorePosts docs={morePosts} />}
      </div>
    </Container>
  );
}

function FeaturedPost(props: {doc: BlogPostsDoc}) {
  return (
    <div className={styles.featuredPost}>
      <div className={styles.featuredPostImage}></div>
    </div>
  );
}

function MorePosts(props: {docs: BlogPostsDoc[]}) {
  const t = useTranslations();
  return (
    <div className={styles.morePosts}>
      <Heading className={styles.morePostsTitle} level={2}>
        {t('More posts')}
      </Heading>
      <div className={styles.posts}>
        {props.docs.map((doc) => (
          <div className={styles.post}>
            <div className={styles.postImage}></div>
          </div>
        ))}
      </div>
    </div>
  );
}
