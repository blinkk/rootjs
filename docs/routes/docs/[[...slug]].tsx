import {useTranslations} from '@blinkk/root';
import {RichText} from '@blinkk/root-cms/richtext';
import {IconLayoutSidebarLeftExpand} from '@tabler/icons-preact';
import {
  ArticleAsideSection,
  ArticleHeader,
  ArticleLayout,
  ArticleSection,
  ArticleToc,
} from '@/components/ArticleLayout/ArticleLayout.js';
import Block from '@/components/Block/Block.js';
import {Reference} from '@/components/Reference/Reference.js';
import {Text} from '@/components/Text/Text.js';
import {UnstyledList} from '@/components/UnstyledList/UnstyledList.js';
import {BaseLayout} from '@/layouts/BaseLayout.js';
import {DocsDoc, DocsFields} from '@/root-cms.js';
import {joinClassNames} from '@/utils/classes.js';
import {cmsRoute} from '@/utils/cms-route.js';
import {buildDocsNav, DocsNavGroup} from '@/utils/docs.js';
import {getReference, getReferenceToc} from '@/utils/reference.js';
import styles from './[[...slug]].module.scss';

export interface PageProps {
  doc: DocsDoc;
  /** Sidebar groups, built from every doc in the collection. */
  nav: DocsNavGroup[];
}

type DocsSection = NonNullable<
  NonNullable<DocsFields['content']>['sections']
>[number];

export default function Page(props: PageProps) {
  const fields = props.doc.fields || {};
  const meta = fields.meta || {};
  const content = fields.content || {};
  const sections = content.sections || [];
  const reference = getReference(content.reference);
  const nav = props.nav || [];
  const activeGroup = nav.find((group) =>
    group.links.some((link) => link.id === props.doc.id)
  );

  return (
    <BaseLayout
      title={meta.title}
      description={meta.description}
      image={meta.image?.src}
    >
      {/*
        Unlike the guides, the headline leads the right column, and the left
        column holds the table of contents above the navigation.
      */}
      <ArticleLayout
        className={styles.docs}
        aside={
          <>
            <ArticleToc
              items={[
                ...sections.map((section) => ({
                  href: `#${section.id || ''}`,
                  label: section.title || '',
                })),
                ...getReferenceToc(reference),
              ]}
            />
            <DocsNav nav={nav} activeId={props.doc.id} />
          </>
        }
      >
        <header>
          <ArticleHeader eyebrow={activeGroup?.label} title={content.title} />
        </header>
        {content.body && (
          <Text as="div" size="p" className={styles.body}>
            <RichText data={content.body} />
          </Text>
        )}
        {sections.map((section) => (
          <Section section={section} />
        ))}
        {reference && <Reference reference={reference} />}
      </ArticleLayout>
    </BaseLayout>
  );
}

/**
 * The docs navigation. On wide screens it sits in the left column in a tinted
 * panel; on narrow screens it opens as a drawer from a "Docs menu" button.
 */
function DocsNav(props: {nav: DocsNavGroup[]; activeId: string}) {
  const t = useTranslations();
  return (
    <div className={styles.nav}>
      <root-drawer className={styles.navDrawer}>
        <button
          className={styles.navTrigger}
          data-slot="drawer-trigger"
          aria-controls="docs-nav"
          aria-expanded="false"
        >
          <IconLayoutSidebarLeftExpand size={18} aria-hidden="true" />
          {t('Docs menu')}
        </button>
      </root-drawer>
      <nav id="docs-nav" className={styles.navPanel} aria-label={t('Docs')}>
        {props.nav.map((group) => (
          <ArticleAsideSection
            className={styles.navSection}
            title={group.label}
          >
            <UnstyledList className={styles.navLinks}>
              {group.links.map((link) => {
                const active = link.id === props.activeId;
                return (
                  <li>
                    <a
                      className={joinClassNames(
                        styles.navLink,
                        active && styles.navLinkActive
                      )}
                      href={link.href}
                      aria-current={active ? 'page' : undefined}
                    >
                      {t(link.label)}
                    </a>
                  </li>
                );
              })}
            </UnstyledList>
          </ArticleAsideSection>
        ))}
      </nav>
    </div>
  );
}

function Section(props: {section: DocsSection}) {
  const section = props.section;
  const blocks = section.blocks || [];
  return (
    <ArticleSection id={section.id} title={section.title}>
      {section.body && (
        <Text as="div" size="p" className={styles.body}>
          <RichText data={section.body} />
        </Text>
      )}
      {blocks.map((block) => (
        <Text
          as="div"
          className={styles.block}
          size="p"
          data-type={block._type}
        >
          <Block {...block} />
        </Text>
      ))}
    </ArticleSection>
  );
}

export const {handle} = cmsRoute({
  collection: 'Docs',
  slugParam: 'slug',
  fetchData: (ctx) => ({
    nav: ctx.cmsClient
      .listDocs<DocsDoc>('Docs', {mode: ctx.mode})
      .then((res) => buildDocsNav(res.docs)),
  }),
});
