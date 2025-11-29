import {Field, Schema} from './schema.js';

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validates a document against a schema.
 */
export function validateDoc(doc: any, schema: Schema): ValidationResult {
  const errors: ValidationError[] = [];
  const fields = schema.fields || [];
  const docFields = doc.fields || {};

  for (const field of fields) {
    if (!field.id) {
      continue;
    }
    const value = docFields[field.id];
    const fieldErrors = validateField(value, field);
    for (const error of fieldErrors) {
      errors.push({
        path: field.id,
        message: error,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a single field value against its field definition.
 */
export function validateField(value: any, field: Field): string[] {
  const errors: string[] = [];

  // Handle undefined/null values
  if (value === undefined || value === null) {
    // TODO(stevenle): Handle required fields if we add support for them.
    // For now, most fields are optional in Root CMS.
    return errors;
  }

  if (field.type === 'string') {
    if (typeof value !== 'string') {
      errors.push(`Expected string, got ${typeof value}`);
    }
  } else if (field.type === 'number') {
    if (typeof value !== 'number') {
      errors.push(`Expected number, got ${typeof value}`);
    }
  } else if (field.type === 'boolean') {
    if (typeof value !== 'boolean') {
      errors.push(`Expected boolean, got ${typeof value}`);
    }
  } else if (field.type === 'date') {
    if (typeof value !== 'string') {
      errors.push(`Expected string (date), got ${typeof value}`);
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      errors.push(`Expected date in YYYY-MM-DD format, got "${value}"`);
    }
  } else if (field.type === 'datetime') {
    if (typeof value !== 'number') {
      errors.push(`Expected number (timestamp), got ${typeof value}`);
    }
  } else if (field.type === 'image') {
    if (typeof value !== 'object') {
      errors.push(`Expected object (image), got ${typeof value}`);
    } else {
      if (!value.src || typeof value.src !== 'string') {
        errors.push('Image missing "src" string');
      }
    }
  } else if (field.type === 'file') {
    if (typeof value !== 'object') {
      errors.push(`Expected object (file), got ${typeof value}`);
    } else {
      if (!value.src || typeof value.src !== 'string') {
        errors.push('File missing "src" string');
      }
    }
  } else if (field.type === 'select') {
    if (typeof value !== 'string') {
      errors.push(`Expected string (select), got ${typeof value}`);
    }
    // TODO: Validate against options?
  } else if (field.type === 'multiselect') {
    if (!Array.isArray(value)) {
      errors.push(`Expected array (multiselect), got ${typeof value}`);
    } else {
      for (const item of value) {
        if (typeof item !== 'string') {
          errors.push(
            `Expected string in multiselect array, got ${typeof item}`
          );
        }
      }
    }
  } else if (field.type === 'object') {
    if (typeof value !== 'object') {
      errors.push(`Expected object, got ${typeof value}`);
    } else {
      for (const subField of field.fields) {
        if (!subField.id) {
          continue;
        }
        const subValue = value[subField.id];
        const subErrors = validateField(subValue, subField);
        for (const error of subErrors) {
          errors.push(`${subField.id}: ${error}`);
        }
      }
    }
  } else if (field.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`Expected array, got ${typeof value}`);
    } else {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        const itemErrors = validateField(item, field.of);
        for (const error of itemErrors) {
          errors.push(`[${i}]${error.startsWith('[') ? '' : '.'}${error}`);
        }
      }
    }
  } else if (field.type === 'oneof') {
    if (typeof value !== 'object') {
      errors.push(`Expected object (oneof), got ${typeof value}`);
    } else {
      if (!value._type) {
        errors.push('OneOf object missing "_type"');
      } else {
        // Find the matching schema for the type
        // The `field.types` can be strings or Schema objects.
        // If they are strings, we can't easily validate the fields here without
        // access to the full schema registry.
        // However, `project.getCollectionSchema` resolves strings to objects.
        // So if we are passed a fully resolved schema, we can validate.
        // If `field.types` contains strings, we skip deep validation for now.
        const typeName = value._type;
        const typeSchema = field.types.find((t) => {
          if (typeof t === 'string') {
            return t === typeName;
          }
          return t.name === typeName;
        });

        if (!typeSchema) {
          errors.push(`Unknown OneOf type: "${typeName}"`);
        } else if (typeof typeSchema === 'object') {
          // Validate fields of the oneof type
          for (const subField of typeSchema.fields) {
            if (!subField.id) {
              continue;
            }
            const subValue = value[subField.id];
            const subErrors = validateField(subValue, subField);
            for (const error of subErrors) {
              errors.push(`${typeName}.${subField.id}: ${error}`);
            }
          }
        }
      }
    }
  } else if (field.type === 'reference') {
    if (typeof value !== 'object') {
      errors.push(`Expected object (reference), got ${typeof value}`);
    } else {
      if (!value.id || typeof value.id !== 'string') {
        errors.push('Reference missing "id" string');
      }
      if (!value.collection || typeof value.collection !== 'string') {
        errors.push('Reference missing "collection" string');
      }
    }
  } else if (field.type === 'references') {
    if (!Array.isArray(value)) {
      errors.push(`Expected array (references), got ${typeof value}`);
    } else {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item !== 'object') {
          errors.push(
            `Expected object in references array, got ${typeof item}`
          );
        } else {
          if (!item.id || typeof item.id !== 'string') {
            errors.push(`[${i}]: Reference missing "id" string`);
          }
          if (!item.collection || typeof item.collection !== 'string') {
            errors.push(`[${i}]: Reference missing "collection" string`);
          }
        }
      }
    }
  } else if (field.type === 'richtext') {
    if (typeof value !== 'object') {
      errors.push(`Expected object (richtext), got ${typeof value}`);
    } else {
      if (!Array.isArray(value.blocks)) {
        errors.push('RichText missing "blocks" array');
      }
    }
  }

  return errors;
}
