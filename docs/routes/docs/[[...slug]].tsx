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

        <div className={styles.sidebarSection}>
          <Text as="h2" size="p" weight="semi-bold">
            {t('Framework')}
          </Text>
          {/* TODO(stevenle): create a system for this. */}
          <UnstyledList className={styles.sidebarLinks}>
            {GUIDE_LINKS.map((link) => (
              <li>
                <Text
                  className={joinClassNames(
                    styles.sidebarLink,
                    link.isActive(ctx) && styles.sidebarLinkActive
                  )}
                  as="a"
                  size="small"
                  href={link.href}
                >
                  {t(link.label)}
                </Text>
              </li>
            ))}
          </UnstyledList>
        </div>

        <div className={styles.sidebarSection}>
          <Text as="h2" size="p" weight="semi-bold">
            {t('CMS')}
          </Text>
          {/* TODO(stevenle): create a system for this. */}
          <UnstyledList className={styles.sidebarLinks}>
            {CMS_LINKS.map((link) => (
              <li>
                <Text
                  className={joinClassNames(
                    styles.sidebarLink,
                    link.isActive(ctx) && styles.sidebarLinkActive
                  )}
                  as="a"
                  size="small"
                  href={link.href}
                >
                  {t(link.label)}
                </Text>
              </li>
            ))}
          </UnstyledList>
        </div>

        <div className={styles.sidebarSection}>
          <Text as="h2" size="p" weight="semi-bold">
            {t('API')}
          </Text>
          {/* TODO(stevenle): create a system for this. */}
          <UnstyledList className={styles.sidebarLinks}>
            {API_LINKS.map((link) => (
              <li>
                <Text
                  className={joinClassNames(
                    styles.sidebarLink,
                    link.isActive(ctx) && styles.sidebarLinkActive
                  )}
                  as="a"
                  size="small"
                  href={link.href}
                >
                  {t(link.label)}
                </Text>
              </li>
            ))}
          </UnstyledList>
        </div>
      </nav>
    </aside>
  );
}

function Main(props: PageProps) {
  const fields = props.doc.fields || {};
  const content = fields.content || {};
  const sections = content.sections || [];
  const t = useTranslations();
  return (
    <div className={styles.main}>
      <TableOfContents {...props} />
      <div className={styles.mainContent}>
        <div className={styles.mainContentHeader}>
          {content.title && (
            <Text
              className={styles.mainContentTitle}
              as="h1"
              size="h4"
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
    <div className={styles.toc}>
      <div className={styles.tocContent}>
        <Text as="h2" size="small" weight="semi-bold">
          {t('On this page')}
        </Text>
        <UnstyledList className={styles.tocLinks}>
          {sections.map((section) => (
            <li>
              <Text
                className={styles.tocLink}
                as="a"
                size="small"
                href={`#${section.id || ''}`}
              >
                {t(section.title)}
              </Text>
            </li>
          ))}
        </UnstyledList>
      </div>
    </div>
  );
}

export const {handle} = cmsRoute({
  collection: 'Docs',
  slugParam: 'slug',
});
