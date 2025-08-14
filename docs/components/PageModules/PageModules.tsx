import path from 'node:path';
import {FunctionalComponent} from 'preact';
import {buildModuleInfo, ModuleInfoContext} from '@/hooks/useModuleInfo.js';
import {testPreviewMode} from '@/utils/mode.js';
import {NodeEditor} from '../NodeEditor/NodeEditor.js';

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
};

export interface PageModulesProps {
  className?: string;
  modules: PageModuleFields;
  /** Key to identify the module instance's CMS fields. */
  fieldKey?: string;
}

export function PageModules(props: PageModulesProps) {
  const modules = props.modules || [];
  return (
    <>
      {modules.map((moduleFields) => (
        <PageModules.Module fields={moduleFields} fieldKey={props.fieldKey} />
      ))}
    </>
  );
}

PageModules.Module = (props: {fields: PageModuleFields; fieldKey: string}) => {
  const {fields, fieldKey} = props;
  if (!fields) {
    return null;
  }
  const Template = templates[fields._type];
  if (!fields._type) {
    return null;
  }
  if (!Template) {
    return testPreviewMode() ? (
      <div>Unknown template {fields._type}</div>
    ) : null;
  }
  return (
    <ModuleInfoContext.Provider value={buildModuleInfo(fields, fieldKey)}>
      <NodeEditor />
      <Template {...fields} />
    </ModuleInfoContext.Provider>
  );
};
