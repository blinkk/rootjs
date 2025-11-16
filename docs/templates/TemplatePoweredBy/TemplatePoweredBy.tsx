import {useTranslations} from '@blinkk/root';
import {RichText} from '@blinkk/root-cms/richtext';
import {Container} from '@/components/Container/Container.js';
import {Image, ImageProps} from '@/components/Image/Image.js';
import {Text} from '@/components/Text/Text.js';
import {TemplatePoweredByFields} from '@/root-cms.js';
import {joinClassNames} from '@/utils/classes.js';
import styles from './TemplatePoweredBy.module.scss';

export type TemplatePoweredByProps = TemplatePoweredByFields & {
  className?: string;
};

export function TemplatePoweredBy(props: TemplatePoweredByProps) {
  const options = props.options || [];
  const t = useTranslations();

  const logos = props.logos || [];

  return (
    <Container
      id={props.id}
      className={joinClassNames(
        props.className,
        styles.headline,
        ...options.map((option) => styles[option])
      )}
    >
      {props.title && (
        <Text as="h3" className={styles.title} size="h6">
          {t(props.title)}
        </Text>
      )}

      {logos.length > 0 && (
        <div className={styles.logos}>
          {logos.map((logo, i) => (
            <>
              <figure className={styles.logo}>
                {logo.logo && (
                  <Image
                    className={styles.logoImage}
                    {...(logo.logo as ImageProps)}
                    sizes={48}
                  />
                )}
                {logo.name && (
                  <figcaption className={styles.logoName}>
                    {logo.name}
                  </figcaption>
                )}
              </figure>
              {i !== logos.length - 1 && (
                <div className={styles.logoDivider} role="separator">
                  +
                </div>
              )}
            </>
          ))}
        </div>
      )}

      {props.body && (
        <Text className={styles.body} size="small">
          <RichText data={props.body} />
        </Text>
      )}
    </Container>
  );
}
