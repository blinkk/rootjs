/**
 * Converts doc data from outside the CMS UI (mainly AI output) into the shape
 * the CMS stores, using the collection schema to tell what each value should
 * be. Models differ in how close they get to that shape, so instead of
 * rejecting a value whose meaning is clear (e.g. `"42"` for a number field, or
 * an Editor.js `header` block), it's repaired here and the repair is reported
 * back. Anything still invalid afterwards is left for the validators to reject.
 *
 * The expected flow for a write is:
 *
 *   prepareFieldsForWrite()    Normalize and validate plain JSON fields.
 *   marshalFieldsForStorage()  Convert the fields to their stored shape.
 *
 * `RootCMSClient` writes go through the same functions, so a value is treated
 * the same whether it came from Root AI, a proposal or a script.
 *
 * Browser-import safety: this module runs in the browser and on the server, so
 * it can't import server-only modules. Firestore timestamps are created through
 * the `toTimestamp` option.
 */
import {getLocalizedValueLocales} from '../shared/localized-values.js';
import {
  isArrayObject,
  marshalData,
  repairArrayObject,
  toArrayObject,
  unmarshalData,
} from '../shared/marshal.js';
import type {
  ArrayField,
  Field,
  ObjectField,
  OneOfField,
  Schema,
} from './schema.js';
import {
  getOneOfTypes,
  validateFields,
  validateStorageSafety,
  validateValue,
} from './validation.js';
import type {ValidationError} from './validation.js';

/** Version stored on rich text data that the CMS editor didn't create. */
const RICHTEXT_VERSION = 'lexical-0.31.2';

/** Field types whose value is stored as a JSON object or array. */
const JSON_FIELD_TYPES = new Set([
  'array',
  'file',
  'image',
  'multiselect',
  'object',
  'oneof',
  'reference',
  'references',
  'richtext',
]);

/** A change made to a value so that it matches the schema. */
export interface FieldRepair {
  /** The path of the repaired value, e.g. "content.modules.0.title". */
  path: string;
  /** Human-readable description of the repair. */
  message: string;
}

export interface NormalizeOptions {
  /** The collection's hoisted schemas. See `ValidateOptions.types`. */
  types?: Record<string, Schema>;
  /**
   * Creates a timestamp from epoch millis, e.g. `Timestamp.fromMillis`. By
   * default datetime values are converted to `{seconds, nanoseconds}`, which
   * is valid but isn't what a write should store.
   */
  toTimestamp?: (millis: number) => unknown;
}

interface NormalizeContext extends NormalizeOptions {
  repairs: FieldRepair[];
}

export interface PrepareOptions {
  /** The collection schema. */
  schema: Schema;
  /**
   * The current fields. Errors that these fields have too aren't reported, so
   * that an edit isn't blocked by an unrelated problem that already exists.
   */
  before?: Record<string, any> | null;
  /** See `NormalizeOptions.toTimestamp`. */
  toTimestamp?: (millis: number) => unknown;
  /** See `ValidateOptions.strict`. Defaults to true. */
  strict?: boolean;
}

export interface PrepareResult<T = Record<string, any>> {
  /** The normalized value. */
  fields: T;
  /** The repairs that were made. */
  repairs: FieldRepair[];
  /** Validation errors in the normalized value. */
  errors: ValidationError[];
}

/**
 * Normalizes `fields` and validates the result. Writes should only proceed
 * when the returned `errors` are empty.
 */
export function prepareFieldsForWrite(
  fields: Record<string, any>,
  options: PrepareOptions
): PrepareResult {
  const {schema, before, toTimestamp, strict = true} = options;
  const types = getSchemaTypes(schema);
  const check = (data: Record<string, any>, context: NormalizeOptions) => {
    const normalized = normalizeFields(data, schema, context);
    const errors = validateFields(normalized.fields, schema, {strict});
    return {...normalized, errors};
  };
  const result = check(fields, {types, toTimestamp});
  if (before && result.errors.length > 0) {
    result.errors = omitExistingErrors(result.errors, check(before, {}).errors);
  }
  return result;
}

/**
 * Normalizes and validates a single value against `field`. Used for values
 * that aren't a whole doc, such as an array item.
 */
export function prepareValueForWrite(
  value: any,
  field: Field,
  options: NormalizeOptions & {before?: any}
): PrepareResult<any> {
  const check = (data: any, context: NormalizeOptions) => {
    const normalized = normalizeValueWithRepairs(data, field, context);
    const validateOptions = {types: options.types, strict: true};
    return {
      ...normalized,
      errors: [
        ...validateValue(normalized.value, field, '', validateOptions),
        ...validateStorageSafety(normalized.value, ''),
      ],
    };
  };
  const {before, ...normalizeOptions} = options;
  const {value: fields, repairs, errors} = check(value, normalizeOptions);
  const existing =
    before === undefined || errors.length === 0
      ? []
      : check(before, {types: options.types}).errors;
  return {fields, repairs, errors: omitExistingErrors(errors, existing)};
}

/** Normalizes doc `fields` against the schema. The input isn't mutated. */
export function normalizeFields(
  fields: Record<string, any>,
  schema: Schema,
  options?: NormalizeOptions
): {fields: Record<string, any>; repairs: FieldRepair[]} {
  const context: NormalizeContext = {
    types: getSchemaTypes(schema),
    ...options,
    repairs: [],
  };
  if (!isPlainObject(fields)) {
    return {fields, repairs: []};
  }
  return {
    fields: normalizeNestedFields(fields, schema.fields, '', context),
    repairs: context.repairs,
  };
}

/**
 * Normalizes a single value against `field`, returning the repairs made. The
 * input isn't mutated.
 */
function normalizeValueWithRepairs(
  value: any,
  field: Field,
  options: NormalizeOptions
): {value: any; repairs: FieldRepair[]} {
  const context: NormalizeContext = {...options, repairs: []};
  return {
    value: normalizeValue(value, field, '', context),
    repairs: context.repairs,
  };
}

function getSchemaTypes(schema: Schema): Record<string, Schema> | undefined {
  return (schema as {types?: Record<string, Schema>}).types;
}

/**
 * Removes errors that also exist in `existing`. Array indices are ignored
 * since an edit can move existing items around, and errors are counted so that
 * a new error is still caught when it has the same message as an existing one.
 */
function omitExistingErrors(
  errors: ValidationError[],
  existing: ValidationError[]
): ValidationError[] {
  const toKey = (error: ValidationError) =>
    `${error.path.replace(/\.\d+(?=\.|$)/g, '.*')}\n${error.message}`;
  const counts = new Map<string, number>();
  for (const error of existing) {
    const key = toKey(error);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return errors.filter((error) => {
    const key = toKey(error);
    const count = counts.get(key) || 0;
    if (count > 0) {
      counts.set(key, count - 1);
      return false;
    }
    return true;
  });
}

function normalizeNestedFields(
  data: Record<string, any>,
  fields: Field[],
  path: string,
  context: NormalizeContext
): Record<string, any> {
  const out = {...data};
  const prefix = path ? `${path}.` : '';
  for (const field of fields) {
    if (!field.id) {
      continue;
    }
    if (out[field.id] !== undefined) {
      out[field.id] = normalizeValue(
        out[field.id],
        field,
        `${prefix}${field.id}`,
        context
      );
    }
    const metadataKey = `@${field.id}`;
    const localizedValues = out[metadataKey]?.localizedValues;
    if (isPlainObject(localizedValues)) {
      const normalized = {...localizedValues};
      for (const locale of getLocalizedValueLocales(localizedValues)) {
        if (normalized[locale] !== null) {
          normalized[locale] = normalizeValue(
            normalized[locale],
            field,
            `${prefix}${metadataKey}.localizedValues.${locale}`,
            context
          );
        }
      }
      out[metadataKey] = {...out[metadataKey], localizedValues: normalized};
    }
  }
  return out;
}

function normalizeValue(
  input: any,
  field: Field,
  path: string,
  context: NormalizeContext
): any {
  const repair = (message: string) => context.repairs.push({path, message});
  let value = input;

  // Some models stringify JSON values.
  if (JSON_FIELD_TYPES.has(field.type) && typeof value === 'string') {
    const parsed = parseJsonString(value);
    if (parsed !== undefined) {
      value = parsed;
      repair('Parsed stringified JSON.');
    }
  }

  // Models copy the `_array` notation from stored docs. Plain arrays are
  // expected here, and it's restored on save for the fields that use it. For
  // array fields, also repair a map that isn't a valid ArrayObject, e.g. one
  // with no `_array` or that uses array indices as keys.
  if (field.type === 'array') {
    const repaired = repairArrayObject(value);
    if (repaired) {
      value = repaired.items;
      if (repaired.repaired) {
        repair('Rebuilt the array, its keys did not match `_array`.');
      }
    }
  } else if (isArrayObject(value)) {
    value = unmarshalData(value, {preserveArrayKeys: true});
    repair('Converted `_array` notation to a plain array.');
  }

  switch (field.type) {
    case 'string':
    case 'select':
      if (typeof value === 'number' || typeof value === 'boolean') {
        repair(`Converted ${typeof value} to string.`);
        return String(value);
      }
      return value;

    case 'number':
      if (typeof value === 'string' && value.trim()) {
        const num = Number(value);
        if (Number.isFinite(num)) {
          repair('Converted string to number.');
          return num;
        }
      }
      if (isPlainObject(value)) {
        const millis = parseDateTimeMillis(value);
        if (millis !== undefined) {
          repair('Converted timestamp to epoch milliseconds.');
          return millis;
        }
      }
      return value;

    case 'boolean':
      if (value === 'true' || value === 'false') {
        repair('Converted string to boolean.');
        return value === 'true';
      }
      return value;

    case 'date':
      return normalizeDate(value, repair);

    case 'datetime':
      return normalizeDateTime(value, context);

    case 'multiselect':
      if (typeof value === 'string' && value) {
        repair('Wrapped the value in an array.');
        return [value];
      }
      return value;

    case 'image':
    case 'file':
      if (typeof value === 'string' && value) {
        repair('Converted URL to an object with a `src`.');
        return {src: value};
      }
      return value;

    case 'object':
      return isPlainObject(value)
        ? normalizeNestedFields(
            value,
            (field as ObjectField).fields,
            path,
            context
          )
        : value;

    case 'array':
      return Array.isArray(value)
        ? value.map((item, index) =>
            normalizeValue(
              item,
              (field as ArrayField).of,
              `${path}.${index}`,
              context
            )
          )
        : value;

    case 'oneof': {
      if (!isPlainObject(value)) {
        return value;
      }
      const type = getOneOfTypes(field as OneOfField, context.types).get(
        value._type
      );
      return type
        ? normalizeNestedFields(value, type.fields, path, context)
        : value;
    }

    case 'richtext':
      return normalizeRichText(value, path, context);

    case 'reference':
      return normalizeReference(value, repair);

    case 'references':
      return Array.isArray(value)
        ? value.map((item) => normalizeReference(item, repair))
        : value;

    default:
      return value;
  }
}

/** Returns the parsed value of a string holding a JSON object or array. */
function parseJsonString(value: string): any {
  const trimmed = value.trim();
  if (!/^(\{[\s\S]*\}|\[[\s\S]*\])$/.test(trimmed)) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function normalizeDate(value: any, repair: (message: string) => void): any {
  // A date string is already what's stored.
  if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}[T ]/.test(value)) {
    return value;
  }
  const millis = parseDateTimeMillis(value);
  if (millis === undefined) {
    return value;
  }
  repair('Converted to a YYYY-MM-DD date string.');
  return new Date(millis).toISOString().slice(0, 10);
}

function normalizeDateTime(value: any, context: NormalizeContext): any {
  const millis = parseDateTimeMillis(value);
  if (millis === undefined) {
    return value;
  }
  if (context.toTimestamp) {
    return context.toTimestamp(millis);
  }
  return {
    seconds: Math.floor(millis / 1000),
    nanoseconds: (((millis % 1000) + 1000) % 1000) * 1e6,
  };
}

/**
 * Parses every shape a timestamp reaches this module in, returning epoch
 * millis: a number (how docs are read), a numeric or ISO string, a `Date`, a
 * Firestore `Timestamp`, or a serialized timestamp object.
 *
 * A number from 1e9 up to 1e10 is taken as epoch seconds (the years 2001 to
 * 2286), since as millis it would be a date in the first months of 1970.
 */
function parseDateTimeMillis(value: any): number | undefined {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return undefined;
    }
    return value >= 1e9 && value < 1e10 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    if (/^\d+$/.test(value.trim())) {
      return parseDateTimeMillis(Number(value));
    }
    const millis = Date.parse(value);
    return Number.isNaN(millis) ? undefined : millis;
  }
  if (typeof value?.toMillis === 'function') {
    return value.toMillis();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.getTime();
  }
  if (!isPlainObject(value)) {
    return undefined;
  }
  const seconds = value.seconds ?? value._seconds;
  const nanoseconds = value.nanoseconds ?? value._nanoseconds ?? 0;
  if (typeof seconds === 'number' && typeof nanoseconds === 'number') {
    return seconds * 1000 + Math.floor(nanoseconds / 1e6);
  }
  return undefined;
}

function normalizeReference(
  value: any,
  repair: (message: string) => void
): any {
  if (typeof value !== 'string' || !/^[^/]+\/.+$/.test(value)) {
    return value;
  }
  repair('Converted doc id to a reference object.');
  const index = value.indexOf('/');
  const collection = value.slice(0, index);
  const slug = value.slice(index + 1).replace(/\//g, '--');
  return {id: `${collection}/${slug}`, collection, slug};
}

function normalizeRichText(
  input: any,
  path: string,
  context: NormalizeContext
): any {
  const repair = (message: string) => context.repairs.push({path, message});
  let value = input;
  if (typeof value === 'string') {
    repair('Converted text to rich text paragraphs.');
    value = {
      blocks: value
        .split(/\n{2,}/)
        .map((text) => text.trim())
        .filter(Boolean)
        .map((text) => ({type: 'paragraph', data: {text}})),
    };
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const blocks = toPlainArray(value.blocks);
  if (!Array.isArray(blocks)) {
    return value;
  }
  // Rich text is only stored as-is when it has a `time` and `version`, without
  // them the `blocks` are converted to the `_array` notation.
  return {
    ...value,
    time: typeof value.time === 'number' ? value.time : Date.now(),
    version:
      typeof value.version === 'string' ? value.version : RICHTEXT_VERSION,
    blocks: normalizeRichTextBlocks(blocks, `${path}.blocks`, context),
  };
}

function normalizeRichTextBlocks(
  blocks: any[],
  path: string,
  context: NormalizeContext
): any[] {
  return blocks.map((block, index) =>
    normalizeRichTextBlock(block, `${path}.${index}`, context)
  );
}

/** Repairs a rich text block, including the Editor.js equivalents of a block. */
function normalizeRichTextBlock(
  input: any,
  path: string,
  context: NormalizeContext
): any {
  const repair = (message: string) => context.repairs.push({path, message});
  if (typeof input === 'string') {
    repair('Converted text to a paragraph block.');
    return {type: 'paragraph', data: {text: input}};
  }
  if (!isPlainObject(input)) {
    return input;
  }

  const block = {...input};
  if (block.data === undefined) {
    const {type, id, ...rest} = block;
    if (Object.keys(rest).length > 0) {
      repair('Moved block values into `data`.');
      return normalizeRichTextBlock(
        {type, ...(id === undefined ? {} : {id}), data: rest},
        path,
        context
      );
    }
    return block;
  }
  if (!isPlainObject(block.data)) {
    return block;
  }

  const data = {...block.data};
  block.data = data;
  if (block.type === 'header') {
    repair('Converted a `header` block to a `heading` block.');
    block.type = 'heading';
  } else if (block.type === 'list') {
    repair('Converted a `list` block to a typed list block.');
    block.type = data.style === 'ordered' ? 'orderedList' : 'unorderedList';
  }

  switch (block.type) {
    case 'heading':
      if (typeof data.level === 'string' && /^\d+$/.test(data.level)) {
        data.level = Number(data.level);
      }
      if (typeof data.level === 'number' && Number.isFinite(data.level)) {
        const level = Math.min(Math.max(Math.trunc(data.level), 1), 6);
        if (level !== data.level) {
          repair(`Changed heading level ${data.level} to ${level}.`);
          data.level = level;
        }
      }
      break;
    case 'orderedList':
    case 'unorderedList': {
      const items = toPlainArray(data.items);
      if (Array.isArray(items)) {
        data.items = items.map((item) => normalizeRichTextListItem(item));
      }
      break;
    }
    case 'table':
      normalizeRichTextTable(data, path, context);
      break;
    case 'image':
      if (typeof data.file === 'string') {
        repair('Converted the image URL to a `file` object.');
        data.file = {url: data.file};
      } else if (data.file === undefined && typeof data.url === 'string') {
        repair('Converted the image URL to a `file` object.');
        data.file = {url: data.url};
        delete data.url;
      }
      break;
  }
  return block;
}

function normalizeRichTextListItem(input: any): any {
  if (typeof input === 'string') {
    return {content: input, items: []};
  }
  if (!isPlainObject(input)) {
    return input;
  }
  const item = {...input};
  if (item.content === undefined && typeof item.text === 'string') {
    item.content = item.text;
    delete item.text;
  }
  const items = toPlainArray(item.items);
  if (Array.isArray(items)) {
    item.items = items.map((child) => normalizeRichTextListItem(child));
  }
  return item;
}

/**
 * Converts an Editor.js table (`content`, a list of rows of html strings) to
 * rows of cells. Also needed because arrays can't be stored inside of arrays.
 */
function normalizeRichTextTable(
  data: Record<string, any>,
  path: string,
  context: NormalizeContext
) {
  if (data.rows === undefined && Array.isArray(data.content)) {
    context.repairs.push({path, message: 'Converted table content to rows.'});
    data.rows = data.content.map((row: any, rowIndex: number) => ({
      cells: (Array.isArray(row) ? row : [row]).map((cell: any) => ({
        type: data.withHeadings && rowIndex === 0 ? 'header' : 'data',
        blocks: [{type: 'paragraph', data: {text: String(cell ?? '')}}],
      })),
    }));
    delete data.content;
    delete data.withHeadings;
  }
  const rows = toPlainArray(data.rows);
  if (!Array.isArray(rows)) {
    return;
  }
  data.rows = rows.map((row: any, rowIndex: number) => {
    const cells = isPlainObject(row) ? toPlainArray(row.cells) : undefined;
    if (!Array.isArray(cells)) {
      return row;
    }
    return {
      ...row,
      cells: cells.map((cell: any, cellIndex: number) => {
        const blocks = isPlainObject(cell)
          ? toPlainArray(cell.blocks)
          : undefined;
        if (!Array.isArray(blocks)) {
          return cell;
        }
        return {
          ...cell,
          blocks: normalizeRichTextBlocks(
            blocks,
            `${path}.data.rows.${rowIndex}.cells.${cellIndex}.blocks`,
            context
          ),
        };
      }),
    };
  });
}

function toPlainArray(value: any): any {
  return isArrayObject(value)
    ? unmarshalData(value, {preserveArrayKeys: true})
    : value;
}

function isPlainObject(value: any): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface MarshalOptions {
  /** Identifies timestamps, which are stored as-is. */
  isTimestamp?: (value: any) => boolean;
}

/**
 * Converts plain JSON `fields` to their stored shape. Unlike `marshalData()`,
 * this uses the schema to only convert array fields to the `_array` notation:
 * multiselect, references and rich text values are stored as plain arrays and
 * the CMS UI can't read them otherwise.
 */
export function marshalFieldsForStorage(
  fields: Record<string, any>,
  schema: Schema,
  options?: MarshalOptions
): Record<string, any> {
  return marshalNestedFields(
    fields,
    schema.fields,
    getSchemaTypes(schema),
    options
  );
}

/** Converts a value of `field` to its stored shape. */
export function marshalValueForStorage(
  value: any,
  field: Field,
  types?: Record<string, Schema>,
  options?: MarshalOptions
): any {
  if (value === null || value === undefined) {
    return value;
  }
  if (options?.isTimestamp?.(value)) {
    return value;
  }
  switch (field.type) {
    case 'array':
      return Array.isArray(value)
        ? toArrayObject(value, (item) =>
            marshalValueForStorage(
              item,
              (field as ArrayField).of,
              types,
              options
            )
          )
        : value;
    case 'object':
      return isPlainObject(value)
        ? marshalNestedFields(
            value,
            (field as ObjectField).fields,
            types,
            options
          )
        : value;
    case 'oneof': {
      if (!isPlainObject(value)) {
        return value;
      }
      const type = getOneOfTypes(field as OneOfField, types).get(value._type);
      return marshalNestedFields(value, type?.fields || [], types, options);
    }
    case 'multiselect':
    case 'references':
    case 'richtext':
      return value;
    default:
      return marshalData(value, options);
  }
}

function marshalNestedFields(
  data: Record<string, any>,
  fields: Field[],
  types?: Record<string, Schema>,
  options?: MarshalOptions
): Record<string, any> {
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) {
      continue;
    }
    const field = fieldsById.get(key);
    const metadataField = key.startsWith('@')
      ? fieldsById.get(key.slice(1))
      : undefined;
    if (field) {
      out[key] = marshalValueForStorage(value, field, types, options);
    } else if (metadataField && isPlainObject(value?.localizedValues)) {
      const localizedValues: Record<string, any> = {};
      for (const [locale, localeValue] of Object.entries(
        value.localizedValues
      )) {
        localizedValues[locale] = locale.startsWith('@')
          ? marshalData(localeValue, options)
          : marshalValueForStorage(localeValue, metadataField, types, options);
      }
      out[key] = {...marshalData(value, options), localizedValues};
    } else {
      out[key] = marshalData(value, options);
    }
  }
  return out;
}
