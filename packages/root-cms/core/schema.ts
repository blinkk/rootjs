import {FunctionalComponent} from 'preact';

export interface CommonFieldProps {
  type: string;
  id?: string;
  label?: string;
  help?: string;
  placeholder?: string;
  default?: any;
  hidden?: boolean;
  deprecated?: boolean;
  /** Hides the field label in the CMS UI. */
  hideLabel?: boolean;
}

export type StringField = CommonFieldProps & {
  type: 'string';
  default?: string;
  translate?: boolean;
  variant?: 'input' | 'textarea';
  /** For textarea variant, the maximum number of rows of text to show. */
  maxRows?: number;
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
  checkboxLabel?: string;
};

export function boolean(field: Omit<BooleanField, 'type'>): BooleanField {
  return {...field, type: 'boolean'};
}

export type SelectField = CommonFieldProps & {
  type: 'select';
  default?: string;
  options?: Array<{value: string; label?: string}> | string[];
  translate?: boolean;
};

export function select(field: Omit<SelectField, 'type'>): SelectField {
  return {...field, type: 'select'};
}

export type MultiSelectField = Omit<SelectField, 'type'> & {
  type: 'multiselect';
  /** Set to `true` to allow users to create arbitrary values. */
  creatable?: boolean;
  translate?: boolean;
};

export function multiselect(
  field: Omit<MultiSelectField, 'type'>
): MultiSelectField {
  return {...field, type: 'multiselect'};
}

export type ImageField = CommonFieldProps & {
  type: 'image';
  translate?: boolean;
  /** List of supported exts, e.g. `['.mp4']`. */
  exts?: string[];
  /**
   * Cache-control header to set on the GCS object.
   */
  cacheControl?: string;
};

export function image(field: Omit<ImageField, 'type'>): ImageField {
  return {...field, type: 'image'};
}

export type FileField = CommonFieldProps & {
  type: 'file';
  /** List of supported exts, e.g. `['.mp4']`. */
  exts?: string[];
  /**
   * Whether to preserve the final serving filename when a user uploads a file.
   * By default, the filename is hashed for obfuscation purposes.
   */
  preserveFilename?: boolean;
  /**
   * Cache-control header to set on the GCS object.
   */
  cacheControl?: string;
};

export function file(field: Omit<FileField, 'type'>): FileField {
  return {...field, type: 'file'};
}

export type ObjectField = CommonFieldProps & {
  type: 'object';
  fields: FieldWithId[];
  /** Defaults to "drawer". */
  variant?: 'drawer' | 'inline';
  /** Options for the "drawer" variant. */
  drawerOptions?: {
    /** Whether the drawer should initialize to the "collapsed" state. */
    collapsed?: boolean;
    /**
     * Whether to render the drawer "inline" (this removes borders from the
     * toggle button).
     */
    inline?: boolean;
  };
};

export function object(field: Omit<ObjectField, 'type'>): ObjectField {
  return {...field, type: 'object'};
}

export type ArrayField = CommonFieldProps & {
  type: 'array';
  default?: any[];
  /**
   * String format for the preview line of an item in the array. Placeholder
   * values should use brackets, e.g. `m{_index:02}: {_type}`.
   *
   * Multiple values can be provided, in which case the first preview line with
   * no missing placeholder values will be used.
   *
   * System added placeholder values:
   *
   * - _index: The 0-based index.
   * - _index:02: A left-padded version of _index to 2 digits.
   * - _index:03: A left-padded version of _index to 3 digits.
   * - _type: For array of one-of fields, the type of the selected field.
   */
  preview?: string | string[];
  // NOTE(stevenle): the array field should only accept object values to keep
  // the schemas future-friendly. For example, if we were to accept primatives
  // (e.g. Array<string>) and the developer decides in the future that they
  // need to add extra fields to that array type, they would have to create a
  // new field, create a new schema field, and then perform a db migration to
  // update from the old field type to the new field type. But if we enforce
  // objects here, a developer should technically be able to add fields to the
  // nested field definition without breaking any existing db entries.
  of: ObjectLikeField;
  /**
   * Label to use for the "add item" button. Defaults to `Add`.
   */
  buttonLabel?: string;
};

export function array(field: Omit<ArrayField, 'type'>): ArrayField {
  return {...field, type: 'array'};
}

export type OneOfField = CommonFieldProps & {
  type: 'oneof';
  types: Schema[];
};

export function oneOf(field: Omit<OneOfField, 'type'>): OneOfField {
  return {...field, type: 'oneof'};
}

export type RichTextField = CommonFieldProps & {
  type: 'richtext';
  translate?: boolean;
  placeholder?: string;
};

export function richtext(field: Omit<RichTextField, 'type'>): RichTextField {
  return {...field, type: 'richtext'};
}

export type ReferenceField = CommonFieldProps & {
  type: 'reference';
  /** List of collection ids the reference can be chosen from. */
  collections?: string[];
  /** Initial collection to show when picking a reference. */
  initialCollection?: string;
  /** Label for the button. Defaults to "Select". */
  buttonLabel?: string;
};

export function reference(field: Omit<ReferenceField, 'type'>): ReferenceField {
  return {...field, type: 'reference'};
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
  | FileField
  | ObjectField
  | ArrayField
  | OneOfField
  | RichTextField
  | ReferenceField;

/**
 * Similar to {@link Field} but with a required `id`.
 * TODO(stevenle): fix this.
 */
export type FieldWithId = Field;

export type ObjectLikeField =
  | ImageField
  | FileField
  | ObjectField
  | OneOfField
  | ReferenceField;

export interface Schema {
  name: string;
  description?: string;
  fields: FieldWithId[];
}

export function defineSchema(schema: Schema): Schema {
  return schema;
}

/** Defines the schema for a collection or reusable component. */
export const define = defineSchema;

export type Collection = Schema & {
  /**
   * The ID of the collection. This comes from the schema filename, e.g
   * `<id>.schema.ts`.
   */
  id: string;
  /**
   * Domain where the collection serves from. Used for multi-domain sites,
   * defaults to the "domain" value `from root.config.ts`.
   */
  domain?: string;
  /**
   * URL path where the collection serves from. This is what's displayed in the
   * preview pane in the CMS.
   */
  url?: string;
  /**
   * URL that can be used to render a preview page. Used by the side-by-side
   * editor to render instant previews. If blank, defaults to the `url` config.
   */
  previewUrl?: string;
  /** Page component to render the collection for instant previews */
  Component?: FunctionalComponent;
  /**
   * Defines the fields to use for document preview. Defaults to "title" and
   * "image". Use dot notation for nested fields, e.g. "meta.title".
   */
  preview?: {
    title?: string;
    image?: string;
    defaultImage?: {
      src: string;
    };
  };
};

export function defineCollection(collection: Collection): Collection {
  return collection;
}

export const collection = defineCollection;
