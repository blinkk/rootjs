import {FunctionalComponent} from 'preact';

export interface CommonFieldProps {
  id?: string;
  label?: string;
  help?: string;
  type: string;
  default?: any;
  hidden?: boolean;
  deprecated?: boolean;
}

export type StringField = CommonFieldProps & {
  type: 'string';
  default?: string;
  translate?: boolean;
  variant?: 'input' | 'textarea';
};

export function string(field: Omit<StringField, 'type'>): StringField {
  return {...field, type: 'string'};
}

export type NumberField = CommonFieldProps & {
  type: 'number';
  default?: number;
};

export function number(field: Omit<NumberField, 'type'>): NumberField {
  return {...field, type: 'number'};
}

export type DateField = CommonFieldProps & {
  type: 'date';
  default?: string;
};

export function date(field: Omit<DateField, 'type'>): DateField {
  return {...field, type: 'date'};
}

export type DateTimeField = CommonFieldProps & {
  type: 'datetime';
  default?: string;
};

export function datetime(field: Omit<DateTimeField, 'type'>): DateTimeField {
  return {...field, type: 'datetime'};
}

export type BooleanField = CommonFieldProps & {
  type: 'boolean';
  default?: boolean;
};

export function boolean(field: Omit<BooleanField, 'type'>): BooleanField {
  return {...field, type: 'boolean'};
}

export type SelectField = CommonFieldProps & {
  type: 'select';
  default?: string;
  options?: {
    values?: Array<{value: string; label?: string}>;
  };
};

export function select(field: Omit<SelectField, 'type'>): SelectField {
  return {...field, type: 'select'};
}

export type MultiSelectField = Omit<SelectField, 'type'> & {
  type: 'multiselect';
  default?: string[];
};

export function multiselect(
  field: Omit<MultiSelectField, 'type'>
): MultiSelectField {
  return {...field, type: 'multiselect'};
}

export type ImageField = CommonFieldProps & {
  type: 'image';
};

export function image(field: Omit<ImageField, 'type'>): ImageField {
  return {...field, type: 'image'};
}

export type ObjectField = CommonFieldProps & {
  type: 'object';
  fields: FieldWithId[];
};

export function object(field: Omit<ObjectField, 'type'>): ObjectField {
  return {...field, type: 'object'};
}

export type ArrayField = CommonFieldProps & {
  type: 'array';
  default?: Array<any>;
  preview?: (value: any) => string;
  // NOTE(stevenle): the array field should only accept object values to keep
  // the schemas future-friendly. For example, if we were to accept primatives
  // (e.g. Array<string>) and the developer decides in the future that they
  // need to add extra fields to that array type, they would have to create a
  // new field, create a new schema field, and then perform a db migration to
  // update from the old field type to the new field type. But if we enforce
  // objects here, a developer should technically be able to add fields to the
  // nested field definition without breaking any existing db entries.
  of: ImageField | ObjectField | OneOfField;
};

export function array(field: Omit<ArrayField, 'type'>): ArrayField {
  return {...field, type: 'array'};
}

export type OneOfField = CommonFieldProps & {
  type: 'oneof';
  types: Array<Schema>;
};

export function oneOf(field: Omit<OneOfField, 'type'>): OneOfField {
  return {...field, type: 'oneof'};
}

export type Field =
  | StringField
  | NumberField
  | DateField
  | DateTimeField
  | BooleanField
  | SelectField
  | MultiSelectField
  | ImageField
  | ObjectField
  | ArrayField
  | OneOfField;

export type FieldWithId = Field;

export interface Schema {
  name: string;
  description?: string;
  fields: Array<FieldWithId>;
}

export function defineSchema(schema: Schema): Schema {
  return schema;
}

export const define = defineSchema;

export type Collection = Schema & {
  // URL where the collection serves from.
  url?: string;
  // Page component to render for the collection.
  Component: FunctionalComponent;
  // Defines the fields to use for document preview.
  preview?: {
    title?: string;
    image?: string;
  };
};

export function defineCollection(collection: Collection): Collection {
  return collection;
}

export const collection = defineCollection;
