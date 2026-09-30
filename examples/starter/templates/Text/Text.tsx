import {useTranslations} from '@blinkk/root';
import {TextFields} from '@/root-cms.js';
import styles from './Text.module.scss';

export function Text(props: TextFields) {
  const t = useTranslations();
  const paragraphs = t(props.body || '')
    .split(/\n\s*\n/)
    .filter((paragraph) => paragraph.trim());
  return (
    <section className={styles.text}>
      {props.title && <h2 className={styles.title}>{t(props.title)}</h2>}
      {paragraphs.map((paragraph) => (
        <p>{paragraph}</p>
      ))}
    </section>
  );
}
