// TODO(stevenle): field defs need to be moved to its own file and well-defined.
interface FieldType {
  id: string;
  type: string;
}

export interface SchemaConfig {
  name?: string;
  description?: string;
  fields?: FieldType[];
}

export default SchemaConfig;
