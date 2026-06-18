import {
  PageModuleFields,
  PageModules,
} from '@/components/PageModules/PageModules.js';
import {testAllConditions} from '@/conditions/conditions.js';
import {IfFields} from '@/root-cms.js';

export function If(props: IfFields) {
  const conditions = props.conditions || [];
  const passed = testAllConditions(conditions);
  const modules: PageModuleFields[] =
    (passed ? props.modulesIfTrue : props.modulesIfFalse) || [];
  const fieldKey = passed ? 'modulesIfTrue' : 'modulesIfFalse';
  return <PageModules modules={modules} fieldKey={fieldKey} />;
}
