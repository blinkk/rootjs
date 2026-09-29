import {RequestContext, useRequestContext, useTranslations} from '@blinkk/root';
import {RichText} from '@blinkk/root-cms/richtext';
import {IconLayoutSidebarLeftExpand} from '@tabler/icons-preact';
import Block from '@/components/Block/Block.js';
import {SiteLogo} from '@/components/SiteLogo/SiteLogo.js';
import {Text} from '@/components/Text/Text.js';
import {UnstyledList} from '@/components/UnstyledList/UnstyledList.js';
import {BaseLayout} from '@/layouts/BaseLayout.js';
import {DocsDoc} from '@/root-cms.js';
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

export default function Page(props: PageProps) {
  const fields = props.doc.fields || {};
  const title = fields?.meta?.title;
  const description = fields?.meta?.description;
  const image = fields.meta?.image?.src;

  return (
    <BaseLayout
      title={title}
      description={description}
      image={image}
      hideFooter
    >
      <div className={styles.guideLayout}>
        <Sidebar />
        <Main {...props} />
      </div>
    </BaseLayout>
  );
}

function Sidebar() {
  const t = useTranslations();
  const ctx = useRequestContext();

  return (
    <aside id="sidebar" className={styles.sidebar}>
      <root-drawer className={styles.sidebarMobileSubnav}>
        <button
          className={styles.sidebarMobileSubnavTrigger}
          data-slot="drawer-trigger"
          aria-controls="docs-sidebar"
          aria-expanded="false"
        >
          <div className={styles.sidebarMobileSubnavTriggerIcon}>
            <IconLayoutSidebarLeftExpand />
          </div>
          <div className={styles.sidebarMobileSubnavTriggerLabel}>Docs</div>
        </button>
      </root-drawer>
      <nav
        id="docs-sidebar"
        className={styles.sidebarContent}
        aria-label="Docs navigation"
      >
        <div className={styles.sidebarLogo}>
          <SiteLogo />
        </div>

        {NAV_SECTIONS.map((section) => (
          <div className={styles.sidebarSection}>
            <h2 className={styles.sidebarHeading}>{t(section.label)}</h2>
            <UnstyledList className={styles.sidebarLinks}>
              {section.links.map((link) => {
                const active = link.isActive(ctx);
                return (
                  <li>
                    <a
                      className={joinClassNames(
                        styles.sidebarLink,
                        active && styles.sidebarLinkActive
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
          </div>
        ))}
      </nav>
    </aside>
  );
}

function Main(props: PageProps) {
  const fields = props.doc.fields || {};
  const content = fields.content || {};
  const sections = content.sections || [];
  const t = useTranslations();
  const ctx = useRequestContext();
  const activeSection = getActiveSection(ctx);
  return (
    <div className={styles.main}>
      <TableOfContents {...props} />
      <div className={styles.mainContent}>
        <div className={styles.mainContentHeader}>
          {activeSection && (
            <div className={styles.eyebrow}>{t(activeSection.label)}</div>
          )}
          {content.title && (
            <Text
              className={styles.mainContentTitle}
              as="h1"
              size="h3"
              weight="semi-bold"
            >
              {t(content.title)}
            </Text>
          )}
          {content.body && (
            <Text className={styles.mainContentBody} size="p">
              <RichText data={content.body} />
            </Text>
          )}
        </div>
        {sections.map((section) => (
          <div className={styles.mainContentSection} id={section.id}>
            <Text
              className={styles.mainContentSectionTitle}
              as="h2"
              size="h5"
              weight="semi-bold"
            >
              {t(section.title || '')}
            </Text>
            {section.body && (
              <Text className={styles.mainContentSectionBody} size="p">
                <RichText data={section.body} />
              </Text>
            )}
            {section.blocks &&
              section.blocks.length > 0 &&
              section.blocks.map((block) => (
                <Text
                  className={styles.mainContentSectionBlock}
                  size="p"
                  data-type={block._type}
                >
                  <Block {...block} />
                </Text>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function TableOfContents(props: PageProps) {
  const fields = props.doc.fields || {};
  const content = fields.content || {};
  const sections = content.sections || [];
  const t = useTranslations();
  if (sections.length === 0) {
    return null;
  }
  return (
    <nav className={styles.toc} aria-label={t('On this page')}>
      <div className={styles.tocContent}>
        <h2 className={styles.tocHeading}>{t('On this page')}</h2>
        <UnstyledList className={styles.tocLinks}>
          {sections.map((section) => (
            <li>
              <a className={styles.tocLink} href={`#${section.id || ''}`}>
                {t(section.title || '')}
              </a>
            </li>
          ))}
        </UnstyledList>
      </div>
    </nav>
  );
}

export const {handle} = cmsRoute({
  collection: 'Docs',
  slugParam: 'slug',
});
