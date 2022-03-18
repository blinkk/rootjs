import {FieldConfig} from './FieldConfig';

export interface SchemaConfig {
  name?: string;
  description?: string;
  fields?: FieldConfig[];
}

export default SchemaConfig;
