import {useTranslations} from '@blinkk/root';
import {IconArrowRight, IconCheck} from '@tabler/icons-preact';
import {Container} from '@/components/Container/Container.js';
import {FeatureIcon} from '@/components/FeatureIcon/FeatureIcon.js';
import {node} from '@/components/RootNode/RootNode.js';
import {SectionHeader} from '@/components/SectionHeader/SectionHeader.js';
import {Text} from '@/components/Text/Text.js';
import {UnstyledList} from '@/components/UnstyledList/UnstyledList.js';
import {TemplatePillarsFields} from '@/root-cms.js';
import {joinClassNames} from '@/utils/classes.js';
import styles from './TemplatePillars.module.scss';

export type TemplatePillarsProps = TemplatePillarsFields & {
  className?: string;
};

export function TemplatePillars(props: TemplatePillarsProps) {
  const t = useTranslations();
  const options = props.options || [];
  const pillars = props.pillars || [];
  return (
    <div
      id={props.id}
      className={joinClassNames(
        props.className,
        styles.pillars,
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
        <div
          className={styles.grid}
          style={{'--pillar-count': String(Math.max(pillars.length, 1))}}
        >
          {pillars.map((pillar, i) => (
            <div className={styles.card}>
              {pillar.icon && (
                <div className={styles.icon}>
                  <FeatureIcon icon={pillar.icon} size={26} />
                </div>
              )}
              {pillar.eyebrow && (
                <div className={styles.cardEyebrow}>
                  {node(`pillars.${i}.eyebrow`, t(pillar.eyebrow))}
                </div>
              )}
              {pillar.title && (
                <Text as="h3" className={styles.cardTitle} size="h5">
                  {node(`pillars.${i}.title`, t(pillar.title))}
                </Text>
              )}
              {pillar.body && (
                <Text className={styles.cardBody} size="p">
                  {node(`pillars.${i}.body`, t(pillar.body))}
                </Text>
              )}
              {pillar.bullets && pillar.bullets.length > 0 && (
                <UnstyledList className={styles.bullets}>
                  {pillar.bullets.map((bullet) => (
                    <li>
                      <IconCheck size={18} aria-hidden="true" />
                      <span>{t(bullet.text || '')}</span>
                    </li>
                  ))}
                </UnstyledList>
              )}
              {pillar.link?.href && pillar.link?.label && (
                <a className={styles.link} href={pillar.link.href}>
                  {t(pillar.link.label)}
                  <IconArrowRight size={18} aria-hidden="true" />
                </a>
              )}
            </div>
          ))}
        </div>
      </Container>
    </div>
  );
}
