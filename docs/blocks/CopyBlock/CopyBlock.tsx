import {useTranslations} from '@blinkk/root';
import {RichText} from '@/components/RichText/RichText.js';
import {Text, TextSize} from '@/components/Text/Text.js';
import {CopyBlockFields} from '@/root-cms.js';
import styles from './CopyBlock.module.scss';

export type CopyBlockProps = CopyBlockFields & {
  bodySize?: TextSize;
};

export function CopyBlock(props: CopyBlockProps) {
  const t = useTranslations();
  const titleSize = (props.titleSize || 'h2') as TextSize;
  const bodySize = props.bodySize || 'p';
  return (
    <div className={styles.copyBlock}>
      {props.eyebrow && (
        <Text className={styles.eyebrow} size="h6">
          {t(props.eyebrow)}
        </Text>
      )}
      {props.title && (
        <Text as="h2" className={styles.title} size={titleSize}>
          {t(props.title)}
        </Text>
      )}
      {props.body && (
        <Text className={styles.body} size={bodySize}>
          <RichText data={props.body} />
        </Text>
      )}
    </div>
  );
}
