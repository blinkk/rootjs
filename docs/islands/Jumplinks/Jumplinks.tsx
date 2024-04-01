import {IconChevronLeft, IconChevronRight} from '@tabler/icons-preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import {joinClassNames} from '@/utils/classes';
import styles from './Jumplinks.module.scss';

declare global {
  interface Window {
    _isSmoothScrolling: boolean;
  }
}

export interface JumplinksProps {
  className?: string;
  links: Jumplink[];
  ariaLabel?: string;
}

export interface Jumplink {
  label: string;
  href: string;
  ariaLabel?: string;
}

export function Jumplinks(props: JumplinksProps) {
  return (
    <root-island component="Jumplinks" props={JSON.stringify(props)}>
      <Jumplinks.Component {...props} />
    </root-island>
  );
}

Jumplinks.Component = (props: JumplinksProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const links = props.links || [];
  const [activeLink, setActiveLink] = useState('');
  const [stickyOffset, setStickyOffset] = useState(10);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [leftBtnVisible, setLeftBtnVisible] = useState(false);
  const [rightBtnVisible, setRightBtnVisible] = useState(false);
  const [sections, setSections] = useState<HTMLElement[]>([]);

  useEffect(() => {
    const els: HTMLElement[] = [];
    links.forEach((link) => {
      if (link.href.startsWith('#')) {
        const el = document.getElementById(link.href.slice(1));
        if (el) {
          els.push(el);
        }
      }
    });
    setSections(els);
  }, []);

  function getActiveSection() {
    let activeSectionId = '';
    for (const s of sections) {
      const section = s as HTMLElement;
      if (section.getBoundingClientRect().top <= window.innerHeight / 2) {
        activeSectionId = section.id;
      }
    }
    if (!activeSectionId && sections.length > 0) {
      activeSectionId = sections[0]!.id;
    }
    if (activeSectionId) {
      return `#${activeSectionId}`;
    }
    return '';
  }

  function onScroll() {
    if (window._isSmoothScrolling) {
      return;
    }
    const el = ref.current!;
    const navEl = el.closest('nav') as HTMLElement;
    if (navEl) {
      const offset = getStickyOffset(navEl);
      setStickyOffset(offset);
    }
    setActiveLink((currentActiveLink) => {
      const newActiveLink = getActiveSection();
      const links = linksRef.current!;
      if (
        currentActiveLink !== newActiveLink &&
        links.scrollWidth > links.offsetWidth
      ) {
        const link = links.querySelector(
          `[href="${newActiveLink}"]`
        ) as HTMLElement;
        if (link) {
          const left =
            link.offsetLeft + 0.5 * link.offsetWidth - 0.5 * links.offsetWidth;
          links.scroll({left: left, behavior: 'smooth'});
        }
      }
      return newActiveLink;
    });
  }

  function onResize() {
    const links = linksRef.current!;
    setIsOverflowing(links.scrollWidth > links.offsetWidth);
    // setCssVariable(
    //   document.documentElement,
    //   '--jumplinks-height',
    //   `${links.offsetHeight}px`
    // );
    onScroll();
  }

  function onScrollX() {
    const links = linksRef.current!;
    setLeftBtnVisible(links.scrollLeft > 0);
    setRightBtnVisible(
      Math.ceil(links.scrollLeft) < links.scrollWidth - links.offsetWidth
    );
  }

  function scrollLeft() {
    const links = linksRef.current!;
    links.scrollTo({left: links.scrollLeft - 100, behavior: 'smooth'});
  }

  function scrollRight() {
    const links = linksRef.current!;
    links.scrollTo({left: links.scrollLeft + 100, behavior: 'smooth'});
  }

  function onLinkClicked(e: Event) {
    const target = e.target as HTMLLinkElement;
    // NOTE: use .getAttribute() instead of .href because .href will return the
    // full URL, including hostname/path etc.
    const href = target?.getAttribute('href');
    if (href && href.startsWith('#')) {
      const section = document.getElementById(href.slice(1));
      if (section) {
        e.preventDefault();
        window._isSmoothScrolling = true;
        setStickyOffset(0);
        section.scrollIntoView({
          block: 'start',
          behavior: 'smooth',
        });
        setTimeout(() => {
          window._isSmoothScrolling = false;
          if (document.activeElement) {
            const el = document.activeElement as HTMLElement;
            el.blur && el.blur();
          }
          onScroll();
        }, 750);
      }
    }
  }

  useEffect(() => {
    if (sections.length === 0) {
      return;
    }
    window.addEventListener('scroll', onScroll, {passive: true});
    window.addEventListener('resize', onResize, {passive: true});
    const links = linksRef.current!;
    links.addEventListener('scroll', onScrollX, {passive: true});
    onScroll();
    onResize();
    onScrollX();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      links.removeEventListener('scroll', onScrollX);
    };
  }, [sections]);

  return (
    <nav
      className={joinClassNames(props.className, styles.jumplinksNav)}
      aria-label={props.ariaLabel}
    >
      <div
        className={joinClassNames(
          styles.jumplinks,
          stickyOffset > 1 && styles.stickyBefore,
          stickyOffset < 1 && stickyOffset > -1 && styles.stickyTop,
          stickyOffset < -1 && styles.stickyAfter,
          isOverflowing && styles.overflowing,
          leftBtnVisible && styles.isScrolled
        )}
        ref={ref}
      >
        {isOverflowing && (
          <button
            className={joinClassNames(
              styles.scrollButton,
              styles.scrollLeft,
              leftBtnVisible && styles.visible
            )}
            onClick={scrollLeft}
          >
            <IconChevronLeft />
          </button>
        )}
        <div className={styles.links} ref={linksRef}>
          {links.map((link) => (
            <a
              className={joinClassNames(
                styles.link,
                activeLink === link.href && styles.active
              )}
              href={link.href}
              onClick={onLinkClicked}
              aria-label={link.ariaLabel || `Jump to ${link.label}`}
            >
              {link.label}
            </a>
          ))}
        </div>
        {isOverflowing && (
          <button
            className={joinClassNames(
              styles.scrollButton,
              styles.scrollRight,
              rightBtnVisible && styles.visible
            )}
            onClick={scrollRight}
          >
            <IconChevronRight />
          </button>
        )}
      </div>
    </nav>
  );
};

/**
 * Returns the offset from the element's sticky top position. If the element
 * is below the "top" of the viewport, will return a positive number. When
 * the element is currently "sticky" it'll return 0. When the element scrolls
 * past the top position, will return a negative number.
 */
function getStickyOffset(el: HTMLElement): number {
  const styles = window.getComputedStyle(el);
  const box = el.getBoundingClientRect();
  const stickyTop = pxToNumber(styles.top);
  return Math.floor(box.top - stickyTop);
}

function pxToNumber(px: string): number {
  return parseInt(px.slice(0, px.length - 2));
}
