import {useTranslations} from '@/../../packages/root/dist/core.js';
import {Container} from '@/components/Container/Container.js';
import {TemplateHeroFields} from '@/root-cms.js';

export function TemplateHero(props: TemplateHeroFields) {
  const t = useTranslations();
  const id = props.id || 'hero';
  return (
    <Container as="section" id={id} aria-labellbedby={`${id}-title`}>
      {props.title && (
        <h1 id={`${id}-title`}>{t(props.title)}</h1>
      )}
    </Container>
  );
}
