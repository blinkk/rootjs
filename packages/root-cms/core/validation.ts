import type {
  ArrayField,
  FieldWithId,
  ObjectField,
  OneOfField,
  Schema,
} from './schema.js';

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
  schema: Schema
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

  const errors: ValidationError[] = [];

  for (const field of schema.fields) {
    if (!field.id) {
      continue;
    }

    // Only validate if the field is present in the data (partial validation).
    // Note: We might want to support required fields in the future.
    if (!(field.id in fieldsData)) {
      continue;
    }

    const value = fieldsData[field.id];
    errors.push(...validateValue(value, field, field.id));
  }

  return errors;
}

/**
 * Validates a single value against a field definition.
 */
function validateValue(
  value: any,
  field: FieldWithId,
  path: string
): ValidationError[] {
  // Handle undefined (optional) values.
  // Note: null is considered a value and should be validated against the type.
  if (value === undefined) {
    return [];
  }

  switch (field.type) {
    case 'string':
    case 'select': // Select is stored as a string.
      if (typeof value !== 'string') {
        return [createError(path, 'string', value)];
      }
      return [];

    case 'number':
      if (typeof value !== 'number') {
        return [createError(path, 'number', value)];
      }
      if (isNaN(value)) {
        return [createError(path, 'number', value)];
      }
      return [];

    case 'boolean':
      if (typeof value !== 'boolean') {
        return [createError(path, 'boolean', value)];
      }
      return [];

    case 'date':
    case 'datetime': {
      // Basic check for object structure matching Firestore Timestamp-like or object with seconds.
      if (typeof value !== 'object' || Array.isArray(value)) {
        return [createError(path, 'object', value)];
      }

      const errors: ValidationError[] = [];
      const seconds = value.seconds;
      const nanoseconds = value.nanoseconds;

      if (seconds === undefined) {
        errors.push({
          path: `${path}.seconds`,
          message: 'Required',
          expected: 'number',
          received: 'undefined',
        });
      } else if (typeof seconds !== 'number') {
        errors.push(createError(`${path}.seconds`, 'number', seconds));
      }

      if (nanoseconds === undefined) {
        errors.push({
          path: `${path}.nanoseconds`,
          message: 'Required',
          expected: 'number',
          received: 'undefined',
        });
      } else if (typeof nanoseconds !== 'number') {
        errors.push(createError(`${path}.nanoseconds`, 'number', nanoseconds));
      }

      return errors;
    }

    case 'multiselect':
      if (!Array.isArray(value)) {
        return [createError(path, 'array', value)];
      }
      return value.flatMap((item, index) => {
        if (typeof item !== 'string') {
          return [createError(`${path}.${index}`, 'string', item)];
        }
        return [];
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
      }

      // alt is optional, but if present must be string
      if (value.alt !== undefined && typeof value.alt !== 'string') {
        errors.push(createError(`${path}.alt`, 'string', value.alt));
      }
      return errors;
    }

    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) {
        return [createError(path, 'object', value)];
      }
      const objectField = field as ObjectField;
      const errors: ValidationError[] = [];
      for (const nestedField of objectField.fields) {
        if (!nestedField.id || !(nestedField.id in value)) {
          continue;
        }
        errors.push(
          ...validateValue(
            value[nestedField.id],
            nestedField,
            `${path}.${nestedField.id}`
          )
        );
      }
      return errors;
    }

    case 'array': {
      if (!Array.isArray(value)) {
        return [createError(path, 'array', value)];
      }
      const arrayField = field as ArrayField;
      const itemField = arrayField.of as FieldWithId;
      // Synthesize an 'id' for validation context if missing, though it's not used in path construction directly here.
      return value.flatMap((item, index) => {
        return validateValue(item, itemField, `${path}.${index}`);
      });
    }

    case 'oneof': {
      if (typeof value !== 'object' || Array.isArray(value)) {
        return [createError(path, 'object', value)];
      }

      const oneOfField = field as OneOfField;
      const typeName = value._type;

      // Build a map of available types.
      const typeMap = new Map<string, Schema>();
      const typeNames: string[] = [];

      for (const type of oneOfField.types) {
        if (typeof type === 'string') {
          // Type references are not fully supported for validation here without lookup.
          // Instead, just store the name.
          typeNames.push(type);
          continue;
        }
        typeMap.set(type.name, type);
        typeNames.push(type.name);
      }

      // 1. Check if _type matches one of the allowed schemas.
      if (!typeNames.includes(typeName)) {
        // Create a formatted list of expected types roughly matching Zod's enum output styles or just listing them.
        // Previous error was: "Invalid discriminator value. Expected 'ImageBlock' | 'TextBlock'"
        const expectedStr = typeNames.map((t) => `'${t}'`).join(' | ');
        return [
          {
            path: `${path}._type`,
            message: `Invalid discriminator value. Expected ${expectedStr}`,
            expected: 'valid discriminator value',
            received: typeName,
          },
        ];
      }

      // 2. Validate against the matched schema fields.
      const matchedSchema = typeMap.get(typeName);
      if (!matchedSchema) {
        // Should not happen given the check above, unless it was a string reference we skipped.
        return [];
      }

      const errors: ValidationError[] = [];
      for (const nestedField of matchedSchema.fields) {
        if (!nestedField.id || !(nestedField.id in value)) {
          continue;
        }
        errors.push(
          ...validateValue(
            value[nestedField.id],
            nestedField,
            `${path}.${nestedField.id}`
          )
        );
      }
      return errors;
    }

    case 'richtext': {
      if (typeof value !== 'object' || Array.isArray(value)) {
        return [createError(path, 'object', value)];
      }
      // Schema: { version?: string, time?: object, blocks: array }
      const errors: ValidationError[] = [];

      if (value.blocks === undefined) {
        errors.push({
          path: `${path}.blocks`,
          message: 'Required',
          expected: 'array',
          received: 'undefined',
        });
      } else if (!Array.isArray(value.blocks)) {
        errors.push(createError(`${path}.blocks`, 'array', value.blocks));
      } else {
        // Validate blocks structure: each block must have { type: string, data: any }
        value.blocks.forEach((block: any, index: number) => {
          if (typeof block !== 'object' || block === null) {
            errors.push(
              createError(`${path}.blocks.${index}`, 'object', block)
            );
            return;
          }
          if (block.type === undefined) {
            errors.push({
              path: `${path}.blocks.${index}.type`,
              message: 'Required',
              expected: 'string',
              received: 'undefined',
            });
          } else if (typeof block.type !== 'string') {
            errors.push(
              createError(`${path}.blocks.${index}.type`, 'string', block.type)
            );
          }
        });
      }
      return errors;
    }

    case 'reference': {
      // Schema: { id, collection, slug } all required strings
      if (typeof value !== 'object' || Array.isArray(value)) {
        return [createError(path, 'object', value)];
      }
      const errors: ValidationError[] = [];
      const requiredFields = ['id', 'collection', 'slug'];
      for (const req of requiredFields) {
        if (value[req] === undefined) {
          errors.push({
            path: `${path}.${req}`,
            message: 'Required',
            expected: 'string',
            received: 'undefined',
          });
        } else if (typeof value[req] !== 'string') {
          errors.push(createError(`${path}.${req}`, 'string', value[req]));
        }
      }
      return errors;
    }

    case 'references': {
      if (!Array.isArray(value)) {
        return [createError(path, 'array', value)];
      }
      return value.flatMap((item, index) => {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
          return [createError(`${path}.${index}`, 'object', item)];
        }
        // Each item acts like a reference (id, collection, slug).
        const errors: ValidationError[] = [];
        const requiredFields = ['id', 'collection', 'slug'];
        for (const req of requiredFields) {
          if (item[req] === undefined) {
            errors.push({
              path: `${path}.${index}.${req}`,
              message: 'Required',
              expected: 'string',
              received: 'undefined',
            });
          } else if (typeof item[req] !== 'string') {
            errors.push(
              createError(`${path}.${index}.${req}`, 'string', item[req])
            );
          }
        }
        return errors;
      });
    }

    default:
      console.warn(`Unknown field type: ${(field as any).type}`);
      return [];
  }
}

/**
 * Helper to determine the type string of a value for error messages.
 */
function getType(value: any): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && Number.isNaN(value)) return 'nan';
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
