import {RequestContext, useRequestContext, useTranslations} from '@blinkk/root';
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
import {Text} from '@/components/Text/Text.js';
import {UnstyledList} from '@/components/UnstyledList/UnstyledList.js';
import {BaseLayout} from '@/layouts/BaseLayout.js';
import {DocsDoc, DocsFields} from '@/root-cms.js';
import {joinClassNames} from '@/utils/classes.js';
import {cmsRoute} from '@/utils/cms-route.js';
import styles from './[[...slug]].module.scss';

const GUIDE_LINKS = [
  {
    label: 'Getting Started',
    href: '/docs',
    isActive: (ctx: RequestContext) => {
      return ctx.currentPath === '/docs/';
    },
  },
  {
    label: 'Project Structure',
    href: '/docs/project-structure',
    isActive: (ctx: RequestContext) => {
      return ctx.currentPath === '/docs/project-structure/';
    },
  },
  {
    label: 'Routes',
    href: '/docs/routes',
    isActive: (ctx: RequestContext) => {
      return ctx.currentPath === '/docs/routes/';
    },
  },
  {
    label: 'Interactive Islands',
    href: '/docs/islands',
    isActive: (ctx: RequestContext) => {
      return ctx.currentPath === '/docs/islands/';
    },
  },
  {
    label: 'Localization',
    href: '/docs/localization',
    isActive: (ctx: RequestContext) => {
      return ctx.currentPath === '/docs/localization/';
    },
  },
  {
    label: 'Plugins',
    href: '/docs/plugins',
    isActive: (ctx: RequestContext) => {
      return ctx.currentPath === '/docs/plugins/';
    },
  },
  {
    label: 'Config',
    href: '/docs/config',
    isActive: (ctx: RequestContext) => {
      return ctx.currentPath === '/docs/config/';
    },
  },
  {
    label: 'v2 Migration Guide',
    href: '/docs/migration/v2',
    isActive: (ctx: RequestContext) => {
      return ctx.currentPath === '/docs/migration/v2/';
    },
  },
  {
    label: 'v3 Migration Guide',
    href: '/docs/migration/v3',
    isActive: (ctx: RequestContext) => {
      return ctx.currentPath === '/docs/migration/v3/';
    },
  },
];

const CMS_LINKS = [
  {
    label: 'Root CMS Setup',
    href: '/docs/cms',
    isActive: (ctx: RequestContext) => {
      return ctx.currentPath === '/docs/cms/';
    },
  },
  {
    label: 'Schemas',
    href: '/docs/cms/schemas',
    isActive: (ctx: RequestContext) => {
      return ctx.currentPath === '/docs/cms/schemas/';
    },
  },
  {
    label: 'Data Fetching',
    href: '/docs/cms/data-fetching',
    isActive: (ctx: RequestContext) => {
      return ctx.currentPath === '/docs/cms/data-fetching/';
    },
  },
];

const API_LINKS = [
  {
    label: 'API Reference',
    href: '/docs/api',
    isActive: (ctx: RequestContext) => {
      return ctx.currentPath === '/docs/api/';
    },
  },
  {
    label: 'CLI Reference',
    href: '/docs/cli',
    isActive: (ctx: RequestContext) => {
      return ctx.currentPath === '/docs/cli/';
    },
  },
];

/** Sidebar sections, in order. The active section is shown as an eyebrow. */
const NAV_SECTIONS = [
  {label: 'Framework', links: GUIDE_LINKS},
  {label: 'CMS', links: CMS_LINKS},
  {label: 'API', links: API_LINKS},
];

/** Returns the sidebar section that contains the current page. */
function getActiveSection(ctx: RequestContext) {
  return NAV_SECTIONS.find((section) =>
    section.links.some((link) => link.isActive(ctx))
  );
}

export interface PageProps {
  doc: DocsDoc;
}

type DocsSection = NonNullable<
  NonNullable<DocsFields['content']>['sections']
>[number];

export default function Page(props: PageProps) {
  const ctx = useRequestContext();
  const fields = props.doc.fields || {};
  const meta = fields.meta || {};
  const content = fields.content || {};
  const sections = content.sections || [];
  const activeSection = getActiveSection(ctx);

  return (
    <BaseLayout
      title={meta.title}
      description={meta.description}
      image={meta.image?.src}
    >
      {/*
        Unlike the guides, the docs keep only the navigation in the left
        column. The headline and table of contents lead the right column.
      */}
      <ArticleLayout className={styles.docs} aside={<DocsNav />}>
        <div className={styles.top}>
          <header>
            <ArticleHeader
              eyebrow={activeSection?.label}
              title={content.title}
            />
          </header>
          <ArticleToc
            className={styles.toc}
            items={sections.map((section) => ({
              href: `#${section.id || ''}`,
              label: section.title || '',
            }))}
          />
        </div>
        {content.body && (
          <Text as="div" size="p" className={styles.body}>
            <RichText data={content.body} />
          </Text>
        )}
        {sections.map((section) => (
          <Section section={section} />
        ))}
      </ArticleLayout>
    </BaseLayout>
  );
}

/**
 * The docs navigation. On wide screens it fills the left column in a tinted
 * panel; on narrow screens it opens as a drawer from a "Docs menu" button.
 */
function DocsNav() {
  const t = useTranslations();
  const ctx = useRequestContext();
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
        {NAV_SECTIONS.map((section) => (
          <ArticleAsideSection
            className={styles.navSection}
            title={section.label}
          >
            <UnstyledList className={styles.navLinks}>
              {section.links.map((link) => {
                const active = link.isActive(ctx);
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
});
