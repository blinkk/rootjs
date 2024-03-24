import {useTranslations} from '@blinkk/root';
import {RichText} from '@/components/RichText/RichText';
import {Text} from '@/components/Text/Text';
import {CopyBlockFields} from '@/root-cms';
import styles from './CopyBlock.module.scss';

export type CopyBlockProps = CopyBlockFields;

export function CopyBlock(props: CopyBlockProps) {
  const options = props.options || [];
  const t = useTranslations();
  return (
    <div className={styles.copyBlock}>
      {props.eyebrow && (
        <Text className={styles.eyebrow} size="h6">
          {t(props.eyebrow)}
        </Text>
      )}
      {props.title && (
        <Text as="h2" className={styles.title} size="h2">
          {t(props.title)}
        </Text>
      )}
      {props.body && (
        <Text className={styles.body} size="p">
          <RichText data={props.body} />
        </Text>
      )}
    </div>
  );
}
