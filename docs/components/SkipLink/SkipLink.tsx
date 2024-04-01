import {useTranslations} from '@blinkk/root';
import {joinClassNames} from '@/utils/classes';
import styles from './SkipLink.module.scss';

interface SkipLinkProps {
  className?: string;
  label?: string;
  href?: string;
}

export function SkipLink(props: SkipLinkProps) {
  const t = useTranslations();
  const label = props.label || 'Skip to main content';
  const href = props.href || '#main';
  return (
    <a className={joinClassNames(props.className, styles.skipLink)} href={href}>
      {t(label)}
    </a>
  );
}
