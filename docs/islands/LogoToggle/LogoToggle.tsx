import {IconChevronDown} from '@tabler/icons-preact';
import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
import {RootCmsWordmark} from '@/components/RootCmsWordmark/RootCmsWordmark.js';
import {RootJsWordmark} from '@/components/RootJsWordmark/RootJsWordmark.js';
import {UnstyledList} from '@/components/UnstyledList/UnstyledList.js';
import {joinClassNames} from '@/utils/classes.js';
import styles from './LogoToggle.module.scss';

export interface LogoToggleProps {
  className?: string;
  logo?: 'root.js' | 'root cms' | string;
}

const LOGOS = [
  {
    id: 'root.js',
    logo: <RootJsWordmark className={styles.logoSvg} />,
    href: '/',
  },
  {
    id: 'root cms',
    logo: <RootCmsWordmark className={styles.logoSvg} />,
    href: '/products/cms',
  },
];

export function LogoToggle(props: LogoToggleProps) {
  return (
    <root-island component="LogoToggle" props={JSON.stringify(props)}>
      <LogoToggle.Component {...props} />
    </root-island>
  );
}

LogoToggle.Component = (props: LogoToggleProps) => {
  const logoId = props.logo || 'root.js';
  // const [selectedLogo, setSelectedLogo] = useState(() => {
  //   return LOGOS.find((logo) => logo.id === logoId) || LOGOS[0];
  // });
  const selectedLogo = LOGOS.find((logo) => logo.id === logoId) || LOGOS[0];
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current!;
    const handler = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!el.contains(target)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, []);

  const toggleMenu = useCallback(() => {
    setMenuOpen((current) => !current);
  }, []);

  return (
    <div
      className={joinClassNames(
        props.className,
        styles.logoToggle,
        menuOpen && styles.menuOpen
      )}
      ref={ref}
    >
      <div className={styles.selectedLogo}>
        <a href="/">{selectedLogo.logo}</a>
        <button
          className={styles.menuToggleButton}
          onClick={() => toggleMenu()}
        >
          <IconChevronDown />
        </button>
      </div>
      <div className={joinClassNames(styles.menu)}>
        <UnstyledList>
          {LOGOS.filter((logo) => logo.id !== selectedLogo.id).map((logo) => (
            <li>
              <a href={logo.href}>{logo.logo}</a>
            </li>
          ))}
        </UnstyledList>
      </div>
    </div>
  );
};
