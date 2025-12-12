import {z} from 'genkit';

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
 * Converts a Root CMS Schema to a Zod schema.
 *
 * This function creates a Zod schema that validates the structure of field data
 * according to the Root CMS schema definition. All fields are made optional to
 * support partial validation.
 *
 * @param schema - The Root CMS schema to convert.
 * @returns A Zod schema object.
 */
export function schemaToZod(schema: Schema): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of schema.fields) {
    if (!field.id) {
      continue;
    }

    const zodField = fieldToZod(field);
    // Make all fields optional for partial validation.
    shape[field.id] = zodField.optional();
  }

  return z.object(shape);
}

/**
 * Converts a single field definition to a Zod schema.
 */
function fieldToZod(field: FieldWithId): z.ZodTypeAny {
  switch (field.type) {
    case 'string':
      return z.string();

    case 'number':
      return z.number();

    case 'boolean':
      return z.boolean();

    case 'date':
    case 'datetime':
      return z.object({
        type: z.string().optional(),
        seconds: z.number(),
        nanoseconds: z.number(),
      });

    case 'select':
      return z.string();

    case 'multiselect':
      return z.array(z.string());

    case 'image':
    case 'file':
      return z.object({
        src: z.string(),
        alt: z.string().optional(),
      });

    case 'object': {
      const objectField = field as ObjectField;
      const shape: Record<string, z.ZodTypeAny> = {};

      for (const nestedField of objectField.fields) {
        if (!nestedField.id) {
          continue;
        }
        const zodField = fieldToZod(nestedField);
        // Make nested fields optional for partial validation.
        shape[nestedField.id] = zodField.optional();
      }

      return z.object(shape);
    }

    case 'array': {
      const arrayField = field as ArrayField;
      const itemSchema = fieldToZod(arrayField.of as FieldWithId);
      return z.array(itemSchema);
    }

    case 'oneof': {
      const oneOfField = field as OneOfField;
      const schemas: z.ZodObject<any>[] = [];

      for (const type of oneOfField.types) {
        if (typeof type === 'string') {
          // Type reference - we can't build the schema without the full type definition.
          // For now, we'll just accept objects with _type property.
          continue;
        }

        const typeShape: Record<string, z.ZodTypeAny> = {
          _type: z.literal(type.name),
        };

        for (const typeField of type.fields) {
          if (!typeField.id) {
            continue;
          }
          const zodField = fieldToZod(typeField);
          // Make fields optional for partial validation.
          typeShape[typeField.id] = zodField.optional();
        }

        schemas.push(z.object(typeShape));
      }

      if (schemas.length === 0) {
        // Fallback if no schemas could be built.
        return z.object({_type: z.string()});
      }

      if (schemas.length === 1) {
        return schemas[0];
      }

      // Use discriminated union with _type as the discriminator.
      return z.discriminatedUnion('_type', schemas as any);
    }

    case 'richtext':
      return z.object({
        version: z.string().optional(),
        time: z
          .object({
            type: z.string().optional(),
            seconds: z.number().optional(),
            nanoseconds: z.number().optional(),
          })
          .optional(),
        blocks: z.array(
          z.object({
            type: z.string(),
            data: z.any(),
          })
        ),
      });

    case 'reference':
      return z.object({
        id: z.string(),
        collection: z.string(),
        slug: z.string(),
      });

    case 'references':
      return z.array(
        z.object({
          id: z.string(),
          collection: z.string(),
          slug: z.string(),
        })
      );

    default:
      // Unknown field type - accept any value.
      console.warn(`Unknown field type: ${(field as any).type}`);
      return z.any();
  }
}

/**
 * Validates field data against a schema using Zod.
 *
 * This function validates `fieldsData` against the provided `schema`. It
 * supports both partial validation (validates only fields present in the data)
 * and full document validation.
 *
 * @param fieldsData - The data to validate.
 * @param schema - The schema defining the expected structure.
 * @returns An array of validation errors. Empty array if validation passes.
 *
 * @example
 * ```typescript
 * const schema = {
 *   name: 'Page',
 *   fields: [
 *     {id: 'title', type: 'string'},
 *     {id: 'published', type: 'boolean'}
 *   ]
 * };
 *
 * const errors = validateFields({title: 'Hello', published: 'yes'}, schema);
 * // Returns: [{path: 'published', message: 'Expected boolean', ...}]
 * ```
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
        received: typeof fieldsData,
      },
    ];
  }

  // Convert the schema to Zod and validate.
  const zodSchema = schemaToZod(schema);
  const result = zodSchema.safeParse(fieldsData);

  if (result.success) {
    return [];
  }

  // Convert Zod errors to ValidationError format.
  return zodErrorsToValidationErrors(result.error);
}

/**
 * Converts Zod errors to ValidationError format.
 */
function zodErrorsToValidationErrors(zodError: z.ZodError): ValidationError[] {
  // In Zod 4, errors are called 'issues'.
  return zodError.issues.map((error) => {
    const path = error.path.join('.');
    const message = error.message;

    // Determine expected and received values based on error code.
    let expected: string | undefined;
    let received: any;

    if (error.code === 'invalid_type') {
      expected = error.expected;
      received = error.received;
    } else if (error.code === 'invalid_union_discriminator') {
      // In Zod 4, invalid_union_discriminator has different structure.
      expected = 'valid discriminator value';
      received = undefined;
    } else if (error.code === 'invalid_literal') {
      expected = String(error.expected);
      received = error.received;
    }

    return {
      path,
      message,
      expected,
      received,
    };
  });
}
