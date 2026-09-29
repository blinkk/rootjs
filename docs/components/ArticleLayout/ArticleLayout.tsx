import {useTranslations} from '@blinkk/root';
import {IconArrowLeft} from '@tabler/icons-preact';
import {ComponentChildren} from 'preact';
import {Container} from '@/components/Container/Container.js';
import {Text} from '@/components/Text/Text.js';
import {UnstyledList} from '@/components/UnstyledList/UnstyledList.js';
import {joinClassNames} from '@/utils/classes.js';
import styles from './ArticleLayout.module.scss';

export interface ArticleLayoutProps {
  className?: string;
  /** Content above the columns, usually an `<ArticleHeader>`. */
  header?: ComponentChildren;
  /** Full-width media between the header and the columns. */
  media?: ComponentChildren;
  /** The sticky left column, e.g. navigation and a table of contents. */
  aside?: ComponentChildren;
  /** The article column. */
  children?: ComponentChildren;
}

/**
 * The two-column page layout shared by the guides and the docs: a header, an
 * optional full-width media slot, then a sticky aside next to the article.
 * Uses the "platform" design tokens, like the home page templates.
 */
export function ArticleLayout(props: ArticleLayoutProps) {
  return (
    <div className={joinClassNames(props.className, styles.page)}>
      {props.header && (
        <Container className={styles.header}>{props.header}</Container>
      )}
      {props.media && (
        <Container className={styles.media}>{props.media}</Container>
      )}
      <Container className={styles.columns}>
        {props.aside && <aside className={styles.aside}>{props.aside}</aside>}
        <article className={styles.article}>{props.children}</article>
      </Container>
    </div>
  );
}

export interface ArticleHeaderProps {
  /** Optional link above the eyebrow, e.g. back to an index page. */
  back?: {href: string; label: string};
  eyebrow?: string;
  title?: string;
  /** Intro copy, shown in a larger, muted style. */
  intro?: ComponentChildren;
}

/** The back link, eyebrow, title and intro at the top of an article. */
export function ArticleHeader(props: ArticleHeaderProps) {
  const t = useTranslations();
  return (
    <>
      {props.back && (
        <a className={styles.back} href={props.back.href}>
          <IconArrowLeft size={16} aria-hidden="true" />
          {t(props.back.label)}
        </a>
      )}
      {props.eyebrow && (
        <div className={styles.eyebrow}>{t(props.eyebrow)}</div>
      )}
      {props.title && (
        <Text as="h1" size="h2" className={styles.title}>
          {t(props.title)}
        </Text>
      )}
      {props.intro && (
        <Text as="div" size="p-large" className={styles.intro}>
          {props.intro}
        </Text>
      )}
    </>
  );
}

export interface ArticleAsideSectionProps {
  className?: string;
  title: string;
  /** Renders the section as a `<nav>` with the title as its label. */
  nav?: boolean;
  children?: ComponentChildren;
}

/** A titled group in the aside column, e.g. "On this page". */
export function ArticleAsideSection(props: ArticleAsideSectionProps) {
  const t = useTranslations();
  const Component = props.nav ? 'nav' : 'div';
  return (
    <Component
      className={props.className}
      aria-label={props.nav ? t(props.title) : undefined}
    >
      <h2 className={styles.asideTitle}>{t(props.title)}</h2>
      {props.children}
    </Component>
  );
}

export interface ArticleTocProps {
  items: Array<{href: string; label: string}>;
}

/** The "On this page" links. Hidden on narrow screens. */
export function ArticleToc(props: ArticleTocProps) {
  const t = useTranslations();
  if (props.items.length === 0) {
    return null;
  }
  return (
    <ArticleAsideSection className={styles.toc} title="On this page" nav>
      <UnstyledList className={styles.tocLinks}>
        {props.items.map((item) => (
          <li>
            <a href={item.href}>{t(item.label)}</a>
          </li>
        ))}
      </UnstyledList>
    </ArticleAsideSection>
  );
}

export interface ArticleSectionProps {
  className?: string;
  id?: string;
  title?: string;
  children?: ComponentChildren;
}

/** A titled section in the article column. */
export function ArticleSection(props: ArticleSectionProps) {
  const t = useTranslations();
  return (
    <section
      className={joinClassNames(props.className, styles.section)}
      id={props.id}
    >
      {props.title && (
        <Text as="h2" size="h4" className={styles.sectionTitle}>
          {t(props.title)}
        </Text>
      )}
      {props.children}
    </section>
  );
}
