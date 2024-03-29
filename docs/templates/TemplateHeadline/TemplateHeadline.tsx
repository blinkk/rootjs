import {useTranslations} from '@blinkk/root';
import {ButtonsBlock} from '@/blocks/ButtonsBlock/ButtonsBlock';
import {Container} from '@/components/Container/Container';
import {RichText} from '@/components/RichText/RichText';
import {Text} from '@/components/Text/Text';
import {TemplateHeadlineFields} from '@/root-cms';
import {joinClassNames} from '@/utils/classes';
import styles from './TemplateHeadline.module.scss';

export type TemplateHeadlineProps = TemplateHeadlineFields & {
  className?: string;
};

export function TemplateHeadline(props: TemplateHeadlineProps) {
  const options = props.options || [];
  const t = useTranslations();
  const titleSize = options.includes('title:h1') ? 'h1' : 'h2';
  return (
    <Container
      id={props.id}
      className={joinClassNames(
        props.className,
        styles.headline,
        ...options.map((option) => styles[option])
      )}
    >
      {props.eyebrow && (
        <Text className={styles.eyebrow} size="h6">
          {t(props.eyebrow)}
        </Text>
      )}
      {props.title && (
        <Text as={titleSize} className={styles.title} size={titleSize}>
          {t(props.title)}
        </Text>
      )}
      {props.body && (
        <Text className={styles.body} size="p-large">
          <RichText data={props.body} />
        </Text>
      )}
      {props.buttons && (
        <ButtonsBlock
          className={styles.buttons}
          options={['align:center']}
          buttons={props.buttons}
        />
      )}
    </Container>
  );
}
