import {RequestContext, useRequestContext, useTranslations} from '@blinkk/root';
import {IconBrandGithubFilled, IconMenu} from '@tabler/icons-preact';
import {SkipLink} from '@/components/SkipLink/SkipLink';
import {joinClassNames} from '@/utils/classes';
import {RootCmsWordmark} from '../RootCmsWordmark/RootCmsWordmark';
import {RootJsWordmark} from '../RootJsWordmark/RootJsWordmark';
import {UnstyledList} from '../UnstyledList/UnstyledList';
import styles from './GlobalHeader.module.scss';

const LINKS = [
  {
    label: 'CMS',
    url: '/features/cms',
    active: (ctx: RequestContext) => ctx.currentPath === '/features/cms',
  },
  {
    label: 'Blog',
    url: '/blog',
    active: (ctx: RequestContext) => ctx.currentPath.startsWith('/blog'),
  },
  {
    label: 'Docs',
    url: '/docs',
    active: (ctx: RequestContext) => ctx.currentPath.startsWith('/docs'),
  },
];

const ICONS = [
  {
    label: 'GitHub',
    url: 'https://github.com/blinkk/rootjs',
    icon: <IconBrandGithubFilled />,
  },
];

export interface GlobalHeaderProps {
  className?: string;
}

export function GlobalHeader(props: GlobalHeaderProps) {
  const t = useTranslations();
  const ctx = useRequestContext();
  const logoUrl = ctx.currentPath === '/' ? '#top' : '/';
  let wordmarkType = 'root.js';
  if (ctx.currentPath === '/features/cms') {
    wordmarkType = 'root cms';
  }
  return (
    <root-header
      id="header"
      className={joinClassNames(props.className, styles.header, 'y:top')}
      role="banner"
    >
      <SkipLink />
      <div className={styles.content}>
        <a className={styles.logo} href={logoUrl}>
          {wordmarkType === 'root cms' ? (
            <RootCmsWordmark />
          ) : (
            <RootJsWordmark />
          )}
        </a>

        <button
          className={styles.burger}
          aria-label="Open nav menu"
          aria-controls="header-links"
          data-slot="burger"
        >
          <IconMenu />
        </button>

        <nav
          id="header-links"
          className={styles.nav}
          aria-label="Navigation links"
        >
          <UnstyledList className={styles.links}>
            {LINKS.map((link) => (
              <li>
                <a
                  className={joinClassNames(
                    styles.link,
                    link.active(ctx) && styles.linkActive
                  )}
                  href={link.url}
                >
                  {t(link.label)}
                </a>
              </li>
            ))}
          </UnstyledList>

          <UnstyledList className={styles.icons}>
            {ICONS.map((icon) => (
              <li>
                <a
                  className={styles.icon}
                  href={icon.url}
                  aria-label={icon.label}
                >
                  {icon.icon}
                </a>
              </li>
            ))}
          </UnstyledList>
        </nav>
      </div>
    </root-header>
  );
}
