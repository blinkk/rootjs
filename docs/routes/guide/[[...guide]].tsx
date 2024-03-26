import {RequestContext, useRequestContext, useTranslations} from '@blinkk/root';
import Block from '@/components/Block/Block';
import {RichText} from '@/components/RichText/RichText';
import {Text} from '@/components/Text/Text';
import {UnstyledList} from '@/components/UnstyledList/UnstyledList';
import {LogoToggle} from '@/islands/LogoToggle/LogoToggle';
import {BaseLayout} from '@/layouts/BaseLayout';
import {GuideDoc} from '@/root-cms';
import {joinClassNames} from '@/utils/classes';
import {cmsRoute} from '@/utils/cms-route';
import styles from './[[...guide]].module.scss';

const GUIDE_LINKS = [
  {
    label: 'Getting started',
    href: '/guide',
    isActive: (ctx: RequestContext) => {
      return ctx.currentPath === '/guide';
    },
  },
  {
    label: 'Project structure',
    href: '/guide/project-structure',
    isActive: (ctx: RequestContext) => {
      return ctx.currentPath === '/guide/project-structure';
    },
  },
  {
    label: 'Routes',
    href: '/guide/routes',
    isActive: (ctx: RequestContext) => {
      return ctx.currentPath === '/guide/routes';
    },
  },
  {
    label: 'Localization',
    href: '/guide/localization',
    isActive: (ctx: RequestContext) => {
      return ctx.currentPath === '/guide/localization';
    },
  },
  {
    label: 'Config',
    href: '/guide/config',
    isActive: (ctx: RequestContext) => {
      return ctx.currentPath === '/guide/config';
    },
  },
];

const CMS_LINKS = [
  {
    label: 'CMS setup',
    href: '/guide/cms-setup',
    isActive: (ctx: RequestContext) => {
      return ctx.currentPath === '/guide/cms-setup';
    },
  },
  {
    label: 'Schemas',
    href: '/guide/schemas',
    isActive: (ctx: RequestContext) => {
      return ctx.currentPath === '/guide/schemas';
    },
  },
];

const API_LINKS = [
  {
    label: 'API reference',
    href: '/guide/api',
    isActive: (ctx: RequestContext) => {
      return ctx.currentPath === '/guide/api';
    },
  },
  {
    label: 'CLI reference',
    href: '/guide/cli',
    isActive: (ctx: RequestContext) => {
      return ctx.currentPath === '/guide/cli';
    },
  },
];

export interface PageProps {
  doc: GuideDoc;
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
        <Sidebar {...props} />
        <Main {...props} />
      </div>
    </BaseLayout>
  );
}

function Sidebar(props: PageProps) {
  const t = useTranslations();
  const ctx = useRequestContext();

  return (
    <aside id="sidebar" className={styles.sidebar}>
      <nav className={styles.sidebarContent} aria-label="Guide navigation">
        <div className={styles.sidebarLogo}>
          <LogoToggle />
        </div>

        <div className={styles.sidebarSection}>
          <Text as="h2" size="p" weight="semi-bold">
            {t('Guide')}
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
                href={`#${section.id}`}
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
  collection: 'Guide',
  slugParam: 'guide',
});
