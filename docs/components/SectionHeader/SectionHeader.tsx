import {useTranslations} from '@blinkk/root';
import {RichText} from '@blinkk/root-cms/richtext';
import {node} from '@/components/RootNode/RootNode.js';
import {Text, TextSize} from '@/components/Text/Text.js';
import {RootCMSRichText} from '@/root-cms.js';
import {joinClassNames} from '@/utils/classes.js';
import styles from './SectionHeader.module.scss';

export interface SectionHeaderProps {
  className?: string;
  eyebrow?: string;
  title?: string;
  /** Body copy, either plain text or rich text. */
  body?: string | RootCMSRichText;
  /**
   * Size of the title. Defaults to `h2`. The title renders as an `<h1>` when
   * the size is `h1`, otherwise as an `<h2>`.
   */
  titleSize?: Extract<TextSize, 'h1' | 'h2' | 'h3'>;
  align?: 'start' | 'center';
}

/**
 * The eyebrow, title and body copy at the top of a landing page section. Used
 * by the "web platform" templates.
 */
export function SectionHeader(props: SectionHeaderProps) {
  const t = useTranslations();
  const titleSize = props.titleSize || 'h2';
  if (!props.eyebrow && !props.title && !props.body) {
    return null;
  }
  return (
    <div
      className={joinClassNames(
        props.className,
        styles.header,
        props.align === 'center' && styles.center
      )}
    >
      {props.eyebrow && (
        <div className={styles.eyebrow}>
          {node('eyebrow', t(props.eyebrow))}
        </div>
      )}
      {props.title && (
        <Text
          as={titleSize === 'h1' ? 'h1' : 'h2'}
          className={styles.title}
          size={titleSize}
        >
          {node('title', t(props.title))}
        </Text>
      )}
      {props.body && (
        <Text className={styles.body} size="p-large">
          {node(
            'body',
            typeof props.body === 'string' ? (
              t(props.body)
            ) : (
              <RichText data={props.body} />
            )
          )}
        </Text>
      )}
    </div>
  );
}
