import {useTranslations} from '@blinkk/root';
import {
  PageModuleFields,
  PageModules,
} from '@/components/PageModules/PageModules.js';
import {SectionFields} from '@/root-cms.js';

export function Section(props: SectionFields) {
  const modules: PageModuleFields[] = props.modules || [];
  const t = useTranslations();
  return (
    <section id={props.id} aria-label={t(props.description)}>
      <PageModules modules={modules} fieldKey="modules" />
    </section>
  );
}
