import {ButtonsBlock} from '@/blocks/ButtonsBlock/ButtonsBlock.js';
import {Container} from '@/components/Container/Container.js';
import {Image, ImageProps} from '@/components/Image/Image.js';
import {node} from '@/components/RootNode/RootNode.js';
import {SectionHeader} from '@/components/SectionHeader/SectionHeader.js';
import {TemplateHeroFields} from '@/root-cms.js';
import {joinClassNames} from '@/utils/classes.js';
import styles from './TemplateHero.module.scss';

export type TemplateHeroProps = TemplateHeroFields & {
  className?: string;
};

export function TemplateHero(props: TemplateHeroProps) {
  const options = props.options || [];
  const titleSize = options.includes('title:h2') ? 'h2' : 'h1';
  return (
    <div
      id={props.id}
      className={joinClassNames(
        props.className,
        styles.hero,
        ...options.map((option) => styles[option])
      )}
    >
      <Container>
        <SectionHeader
          className={styles.header}
          eyebrow={props.eyebrow}
          title={props.title}
          body={props.body}
          titleSize={titleSize}
          align="center"
        />
        {props.buttons && props.buttons.length > 0 && (
          <ButtonsBlock
            className={styles.buttons}
            options={['align:center']}
            buttons={props.buttons}
          />
        )}
        {props.command && (
          <div className={styles.command}>
            {node(
              'command',
              <code>
                <span className={styles.prompt} aria-hidden="true">
                  $
                </span>
                {props.command}
              </code>
            )}
          </div>
        )}
        {props.image?.src && (
          <div className={styles.media}>
            {node(
              'image',
              <Image
                {...(props.image as ImageProps)}
                sizes={{sm: 400, md: 540, default: 1296}}
                format="webp"
                preload
              />
            )}
          </div>
        )}
      </Container>
    </div>
  );
}
