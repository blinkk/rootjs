import path from 'node:path';
import {FunctionalComponent} from 'preact';

type TemplateComponent = FunctionalComponent<PageModuleFields>;

interface TemplateImport {
  [key: string]: TemplateComponent;
}

const templateFiles = import.meta.glob<TemplateImport>('/templates/**/*.tsx', {
  eager: true,
});
const templates: Record<string, TemplateComponent> = {};
for (const filepath in templateFiles) {
  const templateId = path.basename(filepath, path.extname(filepath));
  // Ignore files that start with `_` or templates that have extra periods, e.g.
  // TemplateFoo.stories.tsx.
  if (templateId.startsWith('_') || templateId.includes('.')) {
    continue;
  }
  const tplImport = templateFiles[filepath];
  const Template = tplImport[templateId];
  if (Template) {
    templates[templateId] = Template;
  }
}

export type PageModuleFields<T = {[key: string]: any}> = T & {
  _type?: string;
}

export interface PageModulesProps {
  className?: string;
  modules: PageModuleFields;
}

export function PageModules(props: PageModulesProps) {
  const modules = props.modules || [];
  return (
    <div className={props.className}>
      {modules.map((moduleFields) => (
        <PageModules.Module {...moduleFields} />
      ))}
    </div>
  );
}

PageModules.Module = (props: PageModuleFields) => {
  const Template = templates[props._type];
  if (!props._type) {
    return null;
  }
  if (!Template) {
    return <div>Unknown template {props._type}</div>
  }
  return <Template {...props} />
};
