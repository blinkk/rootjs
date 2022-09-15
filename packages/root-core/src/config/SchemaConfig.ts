import {FieldConfig} from '@private/root-form/src/field';

export interface SchemaConfig {
  name?: string;
  description?: string;
  fields?: FieldConfig[];
}

/**
 * Helper function for defining a schema config with type checking.
 */
export function defineSchema(config: SchemaConfig): SchemaConfig {
  return config;
}
