import {useTranslations} from '@blinkk/root';
import {Container} from '@/components/Container/Container.js';
import {Heading} from '@/components/Heading/Heading.js';
import {TemplateHeroFields} from '@/root-cms.js';

export function TemplateHero(props: TemplateHeroFields) {
  const t = useTranslations();
  const id = props.id || 'hero';
  return (
    <Container as="section" id={id} aria-labellbedby={`${id}-title`}>
      {props.title && (
        <Heading id={`${id}-title`} level={1}>{t(props.title)}</Heading>
      )}
    </Container>
  );
}
