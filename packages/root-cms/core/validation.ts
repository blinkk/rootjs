import {getLocalizedValueLocales} from '../shared/localized-values.js';
import {isArrayObject} from '../shared/marshal.js';
import {
  checkNestingDepth,
  formatNestingDepthMessage,
} from '../shared/nesting.js';
import type {
  ArrayField,
  FieldWithId,
  ObjectField,
  OneOfField,
  RichTextField,
  Schema,
  SelectField,
} from './schema.js';

/** Doc-level key the schema's fields are stored under in Firestore. */
const FIELDS_KEY = 'fields';

/**
 * Represents a validation error for a field.
 */
export interface ValidationError {
  /** The path to the field, e.g., "meta.title" or "content.blocks[0].text". */
  path: string;
  /** Human-readable error message. */
  message: string;
  /** Expected type or value. */
  expected?: string;
  /** Actual value received. */
  received?: any;
}

/** Options for the validation functions. */
export interface ValidateOptions {
  /**
   * The collection's hoisted schemas, keyed by name. Collections served by
   * `getCollectionSchema()` store `oneOf` types as names and move the schemas
   * here, so without this map `oneOf` values can't be validated. `validateFields`
   * reads it from the schema, callers of the lower-level functions must pass it.
   */
  types?: Record<string, Schema>;
  /**
   * Also report values that wouldn't crash anything but are almost certainly
   * mistakes, such as fields that don't exist in the schema, rich text block
   * types the site can't render, or select values outside of the field's
   * options. Stored docs can legitimately contain these (e.g. after a schema
   * change), so this is for checking new values, such as AI output.
   */
  strict?: boolean;
}

/**
 * Field types the CMS UI clears by storing `null`. A `null` value is handled
 * the same as a missing value for these types.
 */
const NULLABLE_FIELD_TYPES = new Set([
  'date',
  'datetime',
  'file',
  'image',
  'password',
  'reference',
]);

/** URL schemes that can execute script when followed or embedded. */
const UNSAFE_URL_RE = /^\s*(?:javascript|vbscript|data:text\/html)/i;

/** Rich text block types rendered by the CMS with a schema-independent shape. */
const RICHTEXT_BUILTIN_BLOCKS = new Set([
  'delimiter',
  'heading',
  'html',
  'image',
  'orderedList',
  'paragraph',
  'quote',
  'table',
  'unorderedList',
]);

/**
 * Validates field data against a schema.
 *
 * This function validates `fieldsData` against the provided `schema`. It
 * supports both partial validation (validates only fields present in the data)
 * and full document validation.
 *
 * @param fieldsData - The data to validate.
 * @param schema - The schema defining the expected structure.
 * @returns An array of validation errors. Empty array if validation passes.
 */
export function validateFields(
  fieldsData: any,
  schema: Schema,
  options?: ValidateOptions
): ValidationError[] {
  // Handle null or undefined data.
  if (fieldsData === null || fieldsData === undefined) {
    return [];
  }

  // Validate that fieldsData is an object.
  if (typeof fieldsData !== 'object' || Array.isArray(fieldsData)) {
    return [
      {
        path: '',
        message: 'Expected object for fields data',
        expected: 'object',
        received: getType(fieldsData),
      },
    ];
  }

  const context: ValidateOptions = {
    types: (schema as {types?: Record<string, Schema>}).types,
    ...options,
  };
  const errors = validateNestedFields(fieldsData, schema.fields, '', context);
  errors.push(...validateStorageSafety(fieldsData, ''));
  errors.push(...validateNestingDepth(fieldsData));

  return errors;
}

/**
 * Reports values anywhere under `value` that the datastore rejects, or that
 * are unsafe to copy into an object: reserved `__name__` keys (which include
 * `__proto__`), empty keys, and arrays directly nested inside of arrays.
 */
export function validateStorageSafety(
  value: any,
  path: string
): ValidationError[] {
  if (value === null || typeof value !== 'object') {
    return [];
  }
  const prefix = path ? `${path}.` : '';
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => {
      const itemPath = `${prefix}${index}`;
      if (Array.isArray(item)) {
        return [
          {
            path: itemPath,
            message: 'Arrays cannot be nested directly inside of arrays',
            expected: 'object',
            received: 'array',
          },
        ];
      }
      return validateStorageSafety(item, itemPath);
    });
  }
  return Object.keys(value).flatMap((key) => {
    if (!key || /^__.*__$/.test(key)) {
      return [
        {
          path: `${prefix}${key}`,
          message: `Invalid key "${key}"`,
          expected: 'field id',
          received: key,
        },
      ];
    }
    return validateStorageSafety(value[key], `${prefix}${key}`);
  });
}

/**
 * Validates the fields of an object (e.g. the doc's fields or an object
 * field's value), including any localized values stored in each field's
 * `@<id>` metadata. Only fields present in the data are validated (partial
 * validation).
 */
function validateNestedFields(
  data: Record<string, any>,
  fields: FieldWithId[],
  path: string,
  options?: ValidateOptions
): ValidationError[] {
  const errors: ValidationError[] = [];
  const prefix = path ? `${path}.` : '';
  const fieldIds = new Set<string>();
  for (const field of fields) {
    if (!field.id) {
      continue;
    }
    fieldIds.add(field.id);
    if (field.id in data) {
      errors.push(
        ...validateValue(data[field.id], field, `${prefix}${field.id}`, options)
      );
    }
    errors.push(
      ...validateLocalizedValues(
        data[`@${field.id}`],
        field,
        `${prefix}@${field.id}`,
        options
      )
    );
  }
  if (options?.strict) {
    for (const key of Object.keys(data)) {
      // `_` keys are system keys (e.g. `_type`), `@` keys are field metadata.
      if (!fieldIds.has(key) && !/^[_@]/.test(key)) {
        errors.push({
          path: `${prefix}${key}`,
          message: `Unknown field "${key}". Expected one of: ${
            Array.from(fieldIds).join(', ') || '(no fields)'
          }`,
          expected: 'field defined in the schema',
          received: key,
        });
      }
    }
  }
  return errors;
}

/**
 * Validates the localized values in a field's `@<id>` metadata against the
 * field. A `null` localized value is valid (it clears the field's value for
 * the locale).
 */
export function validateLocalizedValues(
  metadata: any,
  field: FieldWithId,
  path: string,
  options?: ValidateOptions
): ValidationError[] {
  const localizedValues = metadata?.localizedValues;
  if (localizedValues === undefined) {
    return [];
  }
  const localizedValuesPath = `${path}.localizedValues`;
  if (
    typeof localizedValues !== 'object' ||
    localizedValues === null ||
    Array.isArray(localizedValues)
  ) {
    return [createError(localizedValuesPath, 'object', localizedValues)];
  }
  return getLocalizedValueLocales(localizedValues).flatMap((locale) => {
    const value = localizedValues[locale];
    if (value === null) {
      return [];
    }
    return validateValue(
      value,
      field,
      `${localizedValuesPath}.${locale}`,
      options
    );
  });
}

/**
 * Validates that no field is nested deeper than Firestore allows.
 *
 * Firestore rejects writes containing a field nested more than 20 levels deep
 * with an opaque error, so the offending path is reported here instead. Depth
 * is measured against the stored shape, which nests the schema's fields under
 * a top-level `fields` map.
 */
function validateNestingDepth(fieldsData: any): ValidationError[] {
  const issue = checkNestingDepth(FIELDS_KEY, fieldsData, {warningBuffer: 0});
  if (!issue) {
    return [];
  }
  // Report the path relative to `fields`, matching the rest of the errors.
  const path = issue.deepKey.slice(FIELDS_KEY.length + 1);
  return [
    {
      path: path,
      message: formatNestingDepthMessage({...issue, deepKey: path}),
      expected: `at most ${issue.limit} levels of nesting`,
      received: `${issue.depth} levels`,
    },
  ];
}

/**
 * Validates a single value against a field definition.
 */
export function validateValue(
  value: any,
  field: FieldWithId,
  path: string,
  options?: ValidateOptions
): ValidationError[] {
  // Handle undefined (optional) values.
  // Note: null is considered a value and should be validated against the type,
  // except for field types that the CMS UI clears by storing null.
  if (value === undefined) {
    return [];
  }
  if (value === null && NULLABLE_FIELD_TYPES.has(field.type)) {
    return [];
  }

  switch (field.type) {
    case 'string':
      if (typeof value !== 'string') {
        return [createError(path, 'string', value)];
      }
      return [];

    case 'select': // Select is stored as a string.
      if (typeof value !== 'string') {
        return [createError(path, 'string', value)];
      }
      return options?.strict
        ? validateSelectOption(value, field as SelectField, path)
        : [];

    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return [createError(path, 'number', value)];
      }
      return [];

    case 'boolean':
      if (typeof value !== 'boolean') {
        return [createError(path, 'boolean', value)];
      }
      return [];

    case 'password': {
      // Passwords are stored as a hash object, never as a plain string.
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return [createError(path, 'object', value)];
      }
      const errors: ValidationError[] = [];
      const required: Array<[string, 'string' | 'number']> = [
        ['algorithm', 'string'],
        ['iterations', 'number'],
        ['salt', 'string'],
        ['hash', 'string'],
      ];
      for (const [key, expected] of required) {
        if (value[key] === undefined) {
          errors.push({
            path: `${path}.${key}`,
            message: 'Required',
            expected,
            received: 'undefined',
          });
        } else if (typeof value[key] !== expected) {
          errors.push(createError(`${path}.${key}`, expected, value[key]));
        }
      }
      return errors;
    }

    case 'date':
      // The date field stores a `YYYY-MM-DD` string. Older docs may hold a
      // timestamp instead.
      if (typeof value === 'string') {
        return testDateString(value)
          ? []
          : [createError(path, 'date string (YYYY-MM-DD)', value)];
      }
      return validateTimestamp(value, path);

    case 'datetime':
      return validateTimestamp(value, path);

    case 'multiselect':
      if (!Array.isArray(value)) {
        return [createError(path, 'array', value)];
      }
      return value.flatMap((item, index) => {
        if (typeof item !== 'string') {
          return [createError(`${path}.${index}`, 'string', item)];
        }
        return options?.strict
          ? validateSelectOption(
              item,
              field as unknown as SelectField,
              `${path}.${index}`
            )
          : [];
      });

    case 'image':
    case 'file': {
      if (typeof value !== 'object' || Array.isArray(value)) {
        return [createError(path, 'object', value)];
      }
      const errors: ValidationError[] = [];
      if (value.src === undefined) {
        errors.push({
          path: `${path}.src`,
          message: 'Required',
          expected: 'string',
          received: 'undefined',
        });
      } else if (typeof value.src !== 'string') {
        errors.push(createError(`${path}.src`, 'string', value.src));
      } else if (UNSAFE_URL_RE.test(value.src)) {
        errors.push({
          path: `${path}.src`,
          message: 'Unsafe URL',
          expected: 'http(s) URL or path',
          received: value.src,
        });
      }

      // alt is optional, but if present must be string
      if (value.alt !== undefined && typeof value.alt !== 'string') {
        errors.push(createError(`${path}.alt`, 'string', value.alt));
      }
      return errors;
    }

    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return [createError(path, 'object', value)];
      }
      // An `_array` map would be read back as an array instead of an object.
      if (isArrayObject(value)) {
        return [createError(path, 'object', [])];
      }
      const objectField = field as ObjectField;
      return validateNestedFields(value, objectField.fields, path, options);
    }

    case 'array': {
      if (!Array.isArray(value)) {
        return [createError(path, 'array', value)];
      }
      const arrayField = field as ArrayField;
      const itemField = arrayField.of as FieldWithId;
      const errors: ValidationError[] = [];
      if (
        typeof arrayField.maxItems === 'number' &&
        value.length > arrayField.maxItems
      ) {
        errors.push({
          path,
          message: `Expected at most ${arrayField.maxItems} items, received ${value.length}`,
          expected: `array with at most ${arrayField.maxItems} items`,
          received: `array with ${value.length} items`,
        });
      }
      // Synthesize an 'id' for validation context if missing, though it's not used in path construction directly here.
      value.forEach((item, index) => {
        const itemPath = `${path}.${index}`;
        if (item === null) {
          errors.push(createError(itemPath, 'object', item));
          return;
        }
        errors.push(...validateValue(item, itemField, itemPath, options));
      });
      return errors;
    }

    case 'oneof': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return [createError(path, 'object', value)];
      }

      const typeName = value._type;
      // The CMS UI stores an empty object when no type is selected.
      if (!typeName && Object.keys(value).every((k) => k.startsWith('_'))) {
        return [];
      }

      const typeMap = getOneOfTypes(field as OneOfField, options?.types);
      if (!typeMap.has(typeName)) {
        const expectedStr = Array.from(typeMap.keys())
          .map((t) => `'${t}'`)
          .join(' | ');
        return [
          {
            path: `${path}._type`,
            message: `Invalid discriminator value. Expected ${expectedStr}`,
            expected: 'valid discriminator value',
            received: typeName,
          },
        ];
      }

      const matchedSchema = typeMap.get(typeName);
      if (!matchedSchema) {
        // A type name that can't be resolved without the `types` map.
        return [];
      }

      return validateNestedFields(value, matchedSchema.fields, path, options);
    }

    case 'richtext': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return [createError(path, 'object', value)];
      }
      // Schema: { version?: string, time?: object, blocks: array }
      if (value.blocks === undefined) {
        return [
          {
            path: `${path}.blocks`,
            message: 'Required',
            expected: 'array',
            received: 'undefined',
          },
        ];
      }
      return validateRichTextBlocks(
        value.blocks,
        field as RichTextField,
        `${path}.blocks`,
        options
      );
    }

    case 'reference':
      if (typeof value !== 'object' || Array.isArray(value)) {
        return [createError(path, 'object', value)];
      }
      return validateReference(value, path, options);

    case 'references': {
      if (!Array.isArray(value)) {
        return [createError(path, 'array', value)];
      }
      return value.flatMap((item, index) => {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
          return [createError(`${path}.${index}`, 'object', item)];
        }
        return validateReference(item, `${path}.${index}`, options);
      });
    }

    default:
      console.warn(`Unknown field type: ${(field as any).type}`);
      return [];
  }
}

/**
 * Returns a oneOf field's allowed types, keyed by name. A type maps to `null`
 * when it's a name that doesn't resolve to a schema in `types`.
 */
export function getOneOfTypes(
  field: OneOfField,
  types?: Record<string, Schema>
): Map<string, Schema | null> {
  const typeMap = new Map<string, Schema | null>();
  // `schema.glob()` patterns are resolved to schemas at project load.
  const fieldTypes = Array.isArray(field.types) ? field.types : [];
  for (const type of fieldTypes) {
    if (typeof type === 'string') {
      typeMap.set(type, types?.[type] ?? null);
    } else {
      typeMap.set(type.name, type);
    }
  }
  return typeMap;
}

/**
 * Validates a timestamp, which is either a timestamp object or a number of
 * epoch millis (how docs are read). `normalizeFields()` converts the number
 * before it's stored.
 */
function validateTimestamp(value: any, path: string): ValidationError[] {
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? []
      : [createError(path, 'timestamp', value)];
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return [createError(path, 'object', value)];
  }
  const errors: ValidationError[] = [];
  for (const key of ['seconds', 'nanoseconds']) {
    const part = value[key];
    if (part === undefined) {
      errors.push({
        path: `${path}.${key}`,
        message: 'Required',
        expected: 'number',
        received: 'undefined',
      });
    } else if (typeof part !== 'number' || !Number.isFinite(part)) {
      errors.push(createError(`${path}.${key}`, 'number', part));
    }
  }
  return errors;
}

/** Returns true if `value` is a real calendar date, formatted `YYYY-MM-DD`. */
function testDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** Validates a select value against the field's static options. */
function validateSelectOption(
  value: string,
  field: SelectField,
  path: string
): ValidationError[] {
  // Options from a `source` are only known at runtime.
  if (field.creatable || field.source || !field.options?.length) {
    return [];
  }
  const options = field.options.map((option) =>
    typeof option === 'string' ? option : option.value
  );
  if (!value || options.includes(value)) {
    return [];
  }
  return [
    {
      path,
      message: `Invalid option. Expected one of: ${options.join(', ')}`,
      expected: 'one of the field options',
      received: value,
    },
  ];
}

/** Validates a `{id, collection, slug}` reference object. */
function validateReference(
  value: any,
  path: string,
  options?: ValidateOptions
): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const key of ['id', 'collection', 'slug']) {
    if (value[key] === undefined) {
      errors.push({
        path: `${path}.${key}`,
        message: 'Required',
        expected: 'string',
        received: 'undefined',
      });
    } else if (typeof value[key] !== 'string') {
      errors.push(createError(`${path}.${key}`, 'string', value[key]));
    }
  }
  if (
    options?.strict &&
    errors.length === 0 &&
    value.id !== `${value.collection}/${value.slug}`
  ) {
    errors.push({
      path: `${path}.id`,
      message: 'Reference id must be "<collection>/<slug>"',
      expected: `${value.collection}/${value.slug}`,
      received: value.id,
    });
  }
  return errors;
}

/**
 * Validates rich text blocks. Goes deeper than the field's top-level shape
 * since the renderer and editor read block data directly, so a value of the
 * wrong type in a block breaks the page or the editor.
 */
function validateRichTextBlocks(
  blocks: any,
  field: RichTextField,
  path: string,
  options?: ValidateOptions
): ValidationError[] {
  if (!Array.isArray(blocks)) {
    return [createError(path, 'array', blocks)];
  }
  return blocks.flatMap((block, index) =>
    validateRichTextBlock(block, field, `${path}.${index}`, options)
  );
}

function validateRichTextBlock(
  block: any,
  field: RichTextField,
  path: string,
  options?: ValidateOptions
): ValidationError[] {
  if (typeof block !== 'object' || block === null || Array.isArray(block)) {
    return [createError(path, 'object', block)];
  }
  if (block.type === undefined) {
    return [
      {
        path: `${path}.type`,
        message: 'Required',
        expected: 'string',
        received: 'undefined',
      },
    ];
  }
  if (typeof block.type !== 'string') {
    return [createError(`${path}.type`, 'string', block.type)];
  }
  const data = block.data;
  const dataPath = `${path}.data`;
  if (data === undefined || data === null) {
    return [];
  }
  if (typeof data !== 'object' || Array.isArray(data)) {
    return [createError(dataPath, 'object', data)];
  }

  const errors: ValidationError[] = [];
  switch (block.type) {
    case 'heading':
      if (data.level !== undefined && !testHeadingLevel(data.level)) {
        errors.push(
          createError(`${dataPath}.level`, 'heading level (1-6)', data.level)
        );
      }
      errors.push(...validateRichTextInline(data, dataPath, 'text'));
      break;
    case 'paragraph':
    case 'quote':
      errors.push(...validateRichTextInline(data, dataPath, 'text'));
      break;
    case 'orderedList':
    case 'unorderedList':
      errors.push(...validateRichTextList(data.items, `${dataPath}.items`));
      break;
    case 'table':
      errors.push(
        ...validateRichTextTable(data.rows, field, `${dataPath}.rows`, options)
      );
      break;
    case 'image':
      if (typeof data.file !== 'object' || data.file === null) {
        if (data.file !== undefined) {
          errors.push(createError(`${dataPath}.file`, 'object', data.file));
        }
      } else if (typeof data.file.url !== 'string') {
        errors.push(
          createError(`${dataPath}.file.url`, 'string', data.file.url)
        );
      }
      break;
    case 'html':
      if (data.html !== undefined && typeof data.html !== 'string') {
        errors.push(createError(`${dataPath}.html`, 'string', data.html));
      }
      break;
    default:
      if (
        options?.strict &&
        !RICHTEXT_BUILTIN_BLOCKS.has(block.type) &&
        !getRichTextBlockComponents(field).includes(block.type)
      ) {
        errors.push({
          path: `${path}.type`,
          message: `Unknown rich text block type "${
            block.type
          }". Expected one of: ${[
            ...RICHTEXT_BUILTIN_BLOCKS,
            ...getRichTextBlockComponents(field),
          ].join(', ')}`,
          expected: 'known block type',
          received: block.type,
        });
      }
  }
  return errors;
}

function getRichTextBlockComponents(field: RichTextField): string[] {
  return (field.blockComponents || []).map((component: Schema | string) =>
    typeof component === 'string' ? component : component.name
  );
}

function testHeadingLevel(level: any): boolean {
  return /^[1-6]$/.test(String(level));
}

/** Validates the html string and inline components held by `data[key]`. */
function validateRichTextInline(
  data: any,
  path: string,
  key: string
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (data[key] !== undefined && typeof data[key] !== 'string') {
    errors.push(createError(`${path}.${key}`, 'string', data[key]));
  }
  const components = data.components;
  if (components === undefined || components === null) {
    return errors;
  }
  if (typeof components !== 'object' || Array.isArray(components)) {
    errors.push(createError(`${path}.components`, 'object', components));
    return errors;
  }
  for (const [id, component] of Object.entries<any>(components)) {
    const componentPath = `${path}.components.${id}`;
    if (typeof component !== 'object' || component === null) {
      errors.push(createError(componentPath, 'object', component));
    } else if (typeof component.type !== 'string') {
      errors.push(
        createError(`${componentPath}.type`, 'string', component.type)
      );
    }
  }
  return errors;
}

function validateRichTextList(items: any, path: string): ValidationError[] {
  if (items === undefined) {
    return [];
  }
  if (!Array.isArray(items)) {
    return [createError(path, 'array', items)];
  }
  return items.flatMap((item, index) => {
    const itemPath = `${path}.${index}`;
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return [createError(itemPath, 'object', item)];
    }
    return [
      ...validateRichTextInline(item, itemPath, 'content'),
      ...validateRichTextList(item.items, `${itemPath}.items`),
    ];
  });
}

function validateRichTextTable(
  rows: any,
  field: RichTextField,
  path: string,
  options?: ValidateOptions
): ValidationError[] {
  if (rows === undefined) {
    return [];
  }
  if (!Array.isArray(rows)) {
    return [createError(path, 'array', rows)];
  }
  return rows.flatMap((row, rowIndex) => {
    const rowPath = `${path}.${rowIndex}`;
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      return [createError(rowPath, 'object', row)];
    }
    if (!Array.isArray(row.cells)) {
      return [createError(`${rowPath}.cells`, 'array', row.cells)];
    }
    return row.cells.flatMap((cell: any, cellIndex: number) => {
      const cellPath = `${rowPath}.cells.${cellIndex}`;
      if (typeof cell !== 'object' || cell === null || Array.isArray(cell)) {
        return [createError(cellPath, 'object', cell)];
      }
      if (cell.blocks === undefined) {
        return [];
      }
      return validateRichTextBlocks(
        cell.blocks,
        field,
        `${cellPath}.blocks`,
        options
      );
    });
  });
}

/**
 * Helper to determine the type string of a value for error messages.
 */
function getType(value: any): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && Number.isNaN(value)) return 'nan';
  if (typeof value === 'number' && !Number.isFinite(value)) return 'infinity';
  return typeof value;
}

/**
 * Helper to create a standard validation error.
 */
function createError(
  path: string,
  expected: string,
  receivedValue: any
): ValidationError {
  const received = getType(receivedValue);
  return {
    path,
    message: `Expected ${expected}, received ${received}`,
    expected,
    received,
  };
}
