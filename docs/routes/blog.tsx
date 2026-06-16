import type {Handler, HandlerContext, Request, Response} from '@blinkk/root';
import {RootCMSClient, translationsForLocale} from '@blinkk/root-cms/client';
import {BlogPost} from '@/components/BlogPost/BlogPost.js';
import {Container} from '@/components/Container/Container.js';
import {Text} from '@/components/Text/Text.js';
import {BaseLayout} from '@/layouts/BaseLayout.js';
import {BlogPostsDoc} from '@/root-cms.js';
import {joinClassNames} from '@/utils/classes.js';
import styles from './blog.module.scss';

interface PageProps {
  docs: BlogPostsDoc[];
}

type BlogRequest = Request & {
  cmsClient?: RootCMSClient;
};

let cmsClient: RootCMSClient | null = null;

export default function Page(props: PageProps) {
  return (
    <BaseLayout
      title="Blog – Root.js"
      description="Learn more about the latest features updates for Root.js and its AI-ready content engine."
    >
      <Container>
        <div className={styles.content}>
          <Text
            as="h1"
            size="h2"
            className={joinClassNames(styles.title, 'sr-only')}
          >
            Blog
          </Text>
          <div className={styles.posts}>
            {props.docs.map((doc) => (
              <BlogPost
                doc={doc}
                className={styles.post}
                titleAs="h2"
                titleHref={getBlogPostHref(doc)}
              />
            ))}
          </div>
        </div>
      </Container>
    </BaseLayout>
  );
}

export const handle: Handler = async (req: BlogRequest, res: Response) => {
  if (!cmsClient) {
    cmsClient = new RootCMSClient(req.rootConfig!);
  }
  req.cmsClient = cmsClient;

  const ctx = req.handlerContext as HandlerContext<PageProps>;
  const mode = String(req.query.preview) === 'true' ? 'draft' : 'published';
  const [blogPosts, translationsMap] = await Promise.all([
    cmsClient.listDocs<BlogPostsDoc>('BlogPosts', {mode}),
    cmsClient.loadTranslations({tags: ['common']}),
  ]);
  const docs = blogPosts.docs.sort((a, b) => getPostTime(b) - getPostTime(a));
  const locale = ctx.route.isDefaultLocale
    ? ctx.getPreferredLocale(['en'])
    : ctx.route.locale;
  const translations = translationsForLocale(translationsMap, locale);

  if (mode === 'published') {
    res.setHeader('cache-control', 'public, max-age=15, s-maxage=30');
    if (ctx.route.isDefaultLocale) {
      res.setHeader('vary', 'accept-language, x-country-code');
    }
  } else {
    res.setHeader('cache-control', 'private');
  }

  return ctx.render({docs}, {locale, translations});
};

function getBlogPostHref(doc: BlogPostsDoc) {
  const slug = doc.slug
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `/blog/${slug}`;
}

function getPostTime(doc: BlogPostsDoc) {
  return (
    doc.sys.firstPublishedAt || doc.sys.publishedAt || doc.sys.createdAt || 0
  );
}
