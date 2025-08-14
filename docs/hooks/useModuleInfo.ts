import {createContext} from 'preact';
import {useContext} from 'preact/hooks';

export interface ModuleInfo {
  /** A UUID associated with the module instance. */
  uuid: string;
  /** Typically the tracking ID of the module. */
  id?: string;
  /** The template name, e.g. `TemplateFoo`. */
  name: string;
  /** A description of the module (intended for humans). */
  description?: string;
  /** The position of the module on the page. */
  position?: number;
  /** The parent module (i.e. for nested modules). */
  parent?: ModuleInfo;
  /** The key for the module's fields. */
  fieldKey?: string;
  /** A deep key for the module's fields. */
  deepKey?: string;
}

export const ModuleInfoContext = createContext<ModuleInfo>(null);

export function useModuleInfo() {
  return useContext(ModuleInfoContext);
}

type PageModuleFields<T = {[key: string]: any}> = T & {
  _type?: string;
};

/** Creates a unique ID for the module. */
function createId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

/** Builds the deeplink key for a given module. */
function buildDeepKey(
  parent: ModuleInfo,
  moduleFields: PageModuleFields,
  fieldKey: string
) {
  if (parent) {
    return `${parent.deepKey}.${fieldKey}.${moduleFields._arrayKey}`;
  }
  return `${fieldKey}.${moduleFields._arrayKey}`;
}

/** Builds the `ModuleInfo` data for a module. */
export function buildModuleInfo(
  moduleFields: PageModuleFields,
  fieldKey: string
): ModuleInfo {
  const parent = useModuleInfo();
  return {
    fieldKey: fieldKey,
    deepKey: fieldKey
      ? buildDeepKey(parent, moduleFields, fieldKey)
      : undefined,
    uuid: createId(),
    id: moduleFields.id,
    name: moduleFields._type,
    description: moduleFields.description,
    parent: parent,
  };
}
