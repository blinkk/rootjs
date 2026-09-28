import {useTranslations} from '@blinkk/root';
import {IconCheck} from '@tabler/icons-preact';
import {ButtonsBlock} from '@/blocks/ButtonsBlock/ButtonsBlock.js';
import {Container} from '@/components/Container/Container.js';
import {Image, ImageProps} from '@/components/Image/Image.js';
import {node} from '@/components/RootNode/RootNode.js';
import {SectionHeader} from '@/components/SectionHeader/SectionHeader.js';
import {UnstyledList} from '@/components/UnstyledList/UnstyledList.js';
import {TemplateFeatureSpotlightFields} from '@/root-cms.js';
import {joinClassNames} from '@/utils/classes.js';
import styles from './TemplateFeatureSpotlight.module.scss';

export type TemplateFeatureSpotlightProps = TemplateFeatureSpotlightFields & {
  className?: string;
};

export function TemplateFeatureSpotlight(props: TemplateFeatureSpotlightProps) {
  const t = useTranslations();
  const options = props.options || [];
  const highlights = props.highlights || [];
  return (
    <div
      id={props.id}
      className={joinClassNames(
        props.className,
        styles.spotlight,
        ...options.map((option) => styles[option])
      )}
    >
      <Container className={styles.layout}>
        <div className={styles.copy}>
          <SectionHeader
            eyebrow={props.eyebrow}
            title={props.title}
            body={props.body}
            titleSize="h3"
          />
          {highlights.length > 0 && (
            <UnstyledList className={styles.highlights}>
              {highlights.map((highlight, i) => (
                <li>
                  <IconCheck size={18} aria-hidden="true" />
                  {node(`highlights.${i}.text`, t(highlight.text || ''))}
                </li>
              ))}
            </UnstyledList>
          )}
          {props.buttons && props.buttons.length > 0 && (
            <ButtonsBlock className={styles.buttons} buttons={props.buttons} />
          )}
        </div>
        {props.image?.src && (
          <div className={styles.media}>
            {node(
              'image',
              <Image
                {...(props.image as ImageProps)}
                sizes={{sm: 500, md: 540, default: 720}}
              />
            )}
          </div>
        )}
      </Container>
    </div>
  );
}
