import {joinClassNames} from '../../utils/joinClassNames';
import styles from './BlogCard.module.css';

interface BlogCardProps {
  featured?: boolean;
  post: BlogPost;
}

interface BlogPost {
  url: string;
  meta: {
    title?: string;
    description?: string;
    image?: {
      url: string;
      width: number;
      height: number;
      alt?: string;
    };
  };
  status: {
    publishedAt?: string;
  };
}

export function BlogCard(props: BlogCardProps) {
  const post = props.post;
  return (
    <div className={joinClassNames(
      styles.card,
      props.featured && styles.featured
    )}>
      <a href={post.url}>
        <div className={styles.imageWrap}>
          {post.meta.image && post.meta.image.url && (
            <img
              src={post.meta.image.url}
              width={post.meta.image.width}
              height={post.meta.image.height}
              alt={post.meta.image.alt || ''}
            />
          )}
        </div>
      </a>
      <div className={styles.content}>
        <a
          className={styles.contentTitle}
          href={post.url}
        >
          {post.meta.title || 'untitled'}
        </a>
        <div className={styles.contentDate}>
          {(post.status.publishedAt || '').slice(0, 10)}
        </div>
        <div className={styles.contentDescription}>
          {post.meta.description || ''}
        </div>
      </div>
    </div>
  );
}
