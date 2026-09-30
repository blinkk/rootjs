import {useTranslations} from '@blinkk/root';
import {HeroFields} from '@/root-cms.js';
import styles from './Hero.module.scss';

export function Hero(props: HeroFields) {
  const t = useTranslations();
  return (
    <section className={styles.hero}>
      {props.title && <h1 className={styles.title}>{t(props.title)}</h1>}
      {props.body && <p className={styles.body}>{t(props.body)}</p>}
      {props.image?.src && (
        <img
          className={styles.image}
          src={props.image.src}
          width={props.image.width}
          height={props.image.height}
          alt={props.image.alt || ''}
        />
      )}
    </section>
  );
}
