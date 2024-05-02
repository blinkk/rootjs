import {useTranslations} from '@blinkk/root';
import {Container} from '@/components/Container/Container.js';
import {Text} from '@/components/Text/Text.js';
import {Jumplink, Jumplinks} from '@/islands/Jumplinks/Jumplinks.js';
import {TemplateJumplinksFields} from '@/root-cms.js';
import styles from './TemplateJumplinks.module.scss';

export function TemplateJumplinks(props: TemplateJumplinksFields) {
  const t = useTranslations();
  const description = props.description || 'Jump to section';
  const links = (props.links || [])
    .filter((link) => link.label && link.href)
    .map((link) => {
      return {
        // The "Jumplinks" island doesn't handle translations, so handle it here.
        label: t(link.label || ''),
        href: link.href,
        ariaLabel: link.ariaLabel,
      };
    }) as Jumplink[];
  return (
    <div id={props.id} className={styles.jumplinksModule}>
      {props.title && (
        <Container className={styles.headline}>
          <Text as="h2" className={styles.title} size="h4">
            {t(props.title)}
          </Text>
        </Container>
      )}
      <Jumplinks
        className={styles.jumplinks}
        links={links}
        ariaLabel={t(description)}
      />
    </div>
  );
}
