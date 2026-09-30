import {FunctionalComponent} from '@blinkk/root/jsx';

/**
 * Fields for a single module. `_type` is the name of the template schema that
 * was picked in the CMS, e.g. "Hero".
 */
export type PageModuleFields = {
  [key: string]: any;
  _type?: string;
};

// Load every `templates/<Name>/<Name>.tsx` file. Each file should export a
// component with the same name as the template, e.g. `export function Hero()`.
// This mirrors `schema.glob('/templates/*/*.schema.ts')` in the `Pages`
// collection, so adding a new template folder makes it available in the CMS
// and on the page.
const TEMPLATE_FILES = import.meta.glob<Record<string, FunctionalComponent>>(
  '/templates/*/*.tsx',
  {eager: true}
);

const TEMPLATES: Record<string, FunctionalComponent<any>> = {};
for (const filepath in TEMPLATE_FILES) {
  const name = filepath.split('/').at(-1)!.replace(/\.tsx$/, '');
  const component = TEMPLATE_FILES[filepath][name];
  if (component) {
    TEMPLATES[name] = component;
  }
}

interface PageModulesProps {
  modules?: PageModuleFields[];
}

/** Renders a list of modules, using the template that matches each `_type`. */
export function PageModules(props: PageModulesProps) {
  const modules = props.modules || [];
  return (
    <>
      {modules.map((fields) => {
        const Template = fields._type && TEMPLATES[fields._type];
        if (!Template) {
          return null;
        }
        return <Template {...fields} />;
      })}
    </>
  );
}
