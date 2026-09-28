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
  // The banner layout is a compact, left-aligned card, e.g. for a closing CTA.
  const banner = options.includes('layout:banner');
  let titleSize: 'h1' | 'h2' | 'h3' = 'h1';
  if (banner) {
    titleSize = 'h3';
  } else if (options.includes('title:h2')) {
    titleSize = 'h2';
  }
  const hasButtons = !!props.buttons && props.buttons.length > 0;
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
        <div className={styles.inner}>
          <SectionHeader
            className={styles.header}
            eyebrow={props.eyebrow}
            title={props.title}
            body={props.body}
            titleSize={titleSize}
            align={banner ? 'start' : 'center'}
          />
          {(hasButtons || props.command) && (
            <div className={styles.actions}>
              {hasButtons && (
                <ButtonsBlock
                  className={styles.buttons}
                  options={banner ? [] : ['align:center']}
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
            </div>
          )}
        </div>
        {props.image?.src && (
          <div className={styles.media}>
            {node(
              'image',
              <Image
                {...(props.image as ImageProps)}
                sizes={{sm: 500, md: 540, default: 1296}}
                loading="eager"
              />
            )}
          </div>
        )}
      </Container>
    </div>
  );
}
