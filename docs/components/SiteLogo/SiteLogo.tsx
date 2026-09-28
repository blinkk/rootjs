import {RootJsWordmark} from '@/components/RootJsWordmark/RootJsWordmark.js';
import {joinClassNames} from '@/utils/classes.js';
import styles from './SiteLogo.module.scss';

export interface SiteLogoProps {
  className?: string;
}

/** The Root.js logo, linking to the home page. */
export function SiteLogo(props: SiteLogoProps) {
  return (
    <a className={joinClassNames(props.className, styles.siteLogo)} href="/">
      <RootJsWordmark className={styles.wordmark} />
    </a>
  );
}
