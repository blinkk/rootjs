export interface CommonFieldProps {
  /** The type that defines the structure of the field and its UI component. */
  type: string;
  /** The ID provides a key for the field in the data. */
  id?: string;
  /** The label that appears in the CMS UI. */
  label?: string;
  /** The help text that appears below the field in the CMS UI. */
  help?: string;
  /** The placeholder text that appears in the field input. */
  placeholder?: string;
  default?: any;
  /** Hides the entire field in the CMS UI. */
  hidden?: boolean;
  /** Deprecates the field. Deprecated fields are suppressed when empty in the CMS UI, and are flagged as deprecated in the field's type definition. */
  deprecated?: boolean;
  /** Hides just the field label in the CMS UI. */
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
  return {type: 'string', ...field};
}

export type NumberField = CommonFieldProps & {
  type: 'number';
  default?: number;
};

export function number(field: Omit<NumberField, 'type'>): NumberField {
  return {type: 'number', ...field};
}

export type DateField = CommonFieldProps & {
  type: 'date';
  default?: string;
};

export function date(field: Omit<DateField, 'type'>): DateField {
  return {type: 'date', ...field};
}

export type DateTimeField = CommonFieldProps & {
  type: 'datetime';
  default?: string;
};

export function datetime(field: Omit<DateTimeField, 'type'>): DateTimeField {
  return {type: 'datetime', ...field};
}

export type BooleanField = CommonFieldProps & {
  type: 'boolean';
  default?: boolean;
  checkboxLabel?: string;
};

export function boolean(field: Omit<BooleanField, 'type'>): BooleanField {
  return {type: 'boolean', ...field};
}

export type SelectField = CommonFieldProps & {
  type: 'select';
  default?: string;
  options?: Array<{value: string; label?: string}> | string[];
  translate?: boolean;
  searchable?: boolean;
};

export function select(field: Omit<SelectField, 'type'>): SelectField {
  return {type: 'select', ...field};
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
  return {type: 'multiselect', ...field};
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
  /** Set to `false` to disable the alt text input. */
  alt?: boolean;
};

export function image(field: Omit<ImageField, 'type'>): ImageField {
  return {type: 'image', ...field};
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
  /** Set to `false` to disable the alt text input. */
  alt?: boolean;
};

export function file(field: Omit<FileField, 'type'>): FileField {
  return {type: 'file', ...field};
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
  return {type: 'object', ...field};
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
   * Built-in placeholder values:
   * - {_index}: The 0-based index.
   * - {_index:02}: A left-padded version of _index to 2 digits.
   * - {_index:03}: A left-padded version of _index to 3 digits.
   * - {_type}: For array of one-of fields, the type of the selected field.
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
  return {type: 'array', ...field};
}

export type OneOfField = CommonFieldProps & {
  type: 'oneof';
  types: Schema[] | string[];
};

export function oneOf(field: Omit<OneOfField, 'type'>): OneOfField {
  return {type: 'oneof', ...field};
}

export type RichTextField = CommonFieldProps & {
  type: 'richtext';
  translate?: boolean;
  placeholder?: string;
};

export function richtext(field: Omit<RichTextField, 'type'>): RichTextField {
  return {type: 'richtext', ...field};
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
  return {type: 'reference', ...field};
}

export type ReferencesField = CommonFieldProps & {
  type: 'references';
  /** List of collection ids the references can be chosen from. */
  collections?: string[];
  /** Initial collection to show when picking a reference. */
  initialCollection?: string;
  /** Label for the button. Defaults to "Select". */
  buttonLabel?: string;
};

export function references(
  field: Omit<ReferencesField, 'type'>
): ReferencesField {
  return {...field, type: 'references'};
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
  | ReferenceField
  | ReferencesField;

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
  /** The name of the content type. Used as the field key. */
  name: string;
  /** The description of the content type. Appears in CMS menus. */
  description?: string;
  /** Fields describe the structure of the content. */
  fields: FieldWithId[];
  /** Defines the preview displayed within the CMS UI. Overrides the `preview` definition for the `array` field. */
  preview?: {
    /**
     * Provides the title for the content in the CMS UI.
     *
     * For example, to show the schema's type and the value of its "id" field, use `{_type}: {id}`.
     *
     * Multiple values can be provided, in which case the first preview line with
     * no missing placeholder values will be used.
     *
     * Built-in placeholder values:
     * - {_index}: The 0-based index.
     * - {_index:02}: A left-padded version of _index to 2 digits.
     * - {_index:03}: A left-padded version of _index to 3 digits.
     * - {_type}: For array of one-of fields, the type of the selected field.
     * */
    title?: string | string[];

    /**
     * Provides the thumbnail image for content in the CMS UI.
     *
     * For example, to show the content's "image" field, use `{image.src}`.
     */
    image?: string | string[];
  };
}

export type SchemaWithTypes = Schema & {
  /** Reusable type definitions used by the schema, e.g. for oneOf() fields. */
  types?: Record<string, Schema>;
};

export function defineSchema(schema: Schema): Schema {
  return schema;
}

/** Defines the schema for a collection or reusable component. */
export const define = defineSchema;

export type Collection = SchemaWithTypes & {
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
  /**
   * Defines the fields to use for document preview. Defaults to "title" and
   * "image". Use dot notation for nested fields, e.g. "meta.title".
   */
  preview?: {
    /** The field that provides the document title. */
    title?: string;
    /** The field that provides the document image. */
    image?: string | string[];
    /** A fallback image to display when the document image field is empty. */
    defaultImage?: {
      src: string;
    };
  };
  /**
   * Regular expression used to validate document slugs. Should be provided as a
   * string so it can be serialized to the CMS UI.
   */
  slugRegex?: string;
  /**
   * Automatically add a publishing lock whenever the doc is edited.
   */
  autolock?: boolean;
  /** Reason for the automatic publishing lock. */
  autolockReason?: string;
  /**
   * Custom sort options available when listing documents in the CMS.
   *
   * NOTE: a new DB index may need to be created for the sort option. The first
   * time using the sort option, you will get an error that provides a link for
   * creating the index.
   */
  sortOptions?: Array<{
    /** Unique identifier for the sort option. */
    id: string;
    /** Label displayed in the CMS UI. */
    label: string;
    /** DB field path to sort by, e.g. 'fields.meta.title'. */
    field: string;
    /** Sort direction. Defaults to ascending. */
    direction?: 'asc' | 'desc';
  }>;
};

export function defineCollection(
  collection: Omit<Collection, 'id'>
): Omit<Collection, 'id'> {
  return collection;
}

export const collection = defineCollection;
