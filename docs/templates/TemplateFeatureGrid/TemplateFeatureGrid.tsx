import {useTranslations} from '@blinkk/root';
import {Container} from '@/components/Container/Container.js';
import {FeatureIcon} from '@/components/FeatureIcon/FeatureIcon.js';
import {node} from '@/components/RootNode/RootNode.js';
import {SectionHeader} from '@/components/SectionHeader/SectionHeader.js';
import {Text} from '@/components/Text/Text.js';
import {TemplateFeatureGridFields} from '@/root-cms.js';
import {joinClassNames} from '@/utils/classes.js';
import styles from './TemplateFeatureGrid.module.scss';

export type TemplateFeatureGridProps = TemplateFeatureGridFields & {
  className?: string;
};

export function TemplateFeatureGrid(props: TemplateFeatureGridProps) {
  const t = useTranslations();
  const options = props.options || [];
  const items = props.items || [];
  return (
    <div
      id={props.id}
      className={joinClassNames(
        props.className,
        styles.featureGrid,
        ...options.map((option) => styles[option])
      )}
    >
      <Container>
        <SectionHeader
          eyebrow={props.eyebrow}
          title={props.title}
          body={props.body}
          align="center"
        />
        <ul className={styles.grid}>
          {items.map((item, i) => {
            const Tag = item.href ? 'a' : 'div';
            return (
              <li>
                <Tag className={styles.item} href={item.href || undefined}>
                  {item.icon && (
                    <FeatureIcon className={styles.icon} icon={item.icon} />
                  )}
                  {item.title && (
                    <Text as="h3" className={styles.itemTitle} size="h6">
                      {node(`items.${i}.title`, t(item.title))}
                    </Text>
                  )}
                  {item.body && (
                    <Text className={styles.itemBody} size="p">
                      {node(`items.${i}.body`, t(item.body))}
                    </Text>
                  )}
                </Tag>
              </li>
            );
          })}
        </ul>
      </Container>
    </div>
  );
}
