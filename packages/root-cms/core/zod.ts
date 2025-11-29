import {z} from 'zod';
import {Field, Schema} from './schema.js';

export type GetSchemaFn = (id: string) => Schema | undefined;

/**
 * Converts a Root CMS schema to a Zod schema.
 */
export function schemaToZod(
  schema: Schema,
  getSchema?: GetSchemaFn
): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of schema.fields) {
    if (field.id) {
      shape[field.id] = fieldToZod(field, getSchema);
    }
  }
  return z.object(shape);
}

/**
 * Converts a single Root CMS field to a Zod type.
 */
export function fieldToZod(
  field: Field,
  getSchema?: GetSchemaFn
): z.ZodTypeAny {
  let zodType: z.ZodTypeAny;

  switch (field.type) {
    case 'string':
      zodType = z.string();
      break;
    case 'number':
      zodType = z.number();
      break;
    case 'boolean':
      zodType = z.boolean();
      break;
    case 'date':
      // Dates are stored as strings in YYYY-MM-DD format
      zodType = z.string();
      break;
    case 'datetime':
      // Datetimes are stored as numbers (timestamps)
      zodType = z.number();
      break;
    case 'image':
      zodType = z.object({
        src: z.string(),
        width: z.number().optional(),
        height: z.number().optional(),
        alt: z.string().optional(),
      });
      break;
    case 'file':
      zodType = z.object({
        src: z.string(),
        size: z.number().optional(),
        type: z.string().optional(),
        name: z.string().optional(),
      });
      break;
    case 'select':
      zodType = z.string();
      break;
    case 'multiselect':
      zodType = z.array(z.string());
      break;
    case 'object': {
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const subField of field.fields) {
        if (subField.id) {
          shape[subField.id] = fieldToZod(subField, getSchema);
        }
      }
      zodType = z.object(shape);
      break;
    }
    case 'array':
      zodType = z.array(fieldToZod(field.of, getSchema));
      break;
    case 'oneof':
      if (getSchema) {
        const unionOptions: z.ZodObject<any>[] = [];
        for (const typeRef of field.types) {
          let subSchema: Schema | undefined;
          let typeName: string;

          if (typeof typeRef === 'string') {
            typeName = typeRef;
            subSchema = getSchema(typeRef);
          } else {
            typeName = typeRef.name;
            subSchema = typeRef;
          }

          if (subSchema) {
            // Recursively convert the sub-schema to Zod
            // We need to ensure it has the literal _type field
            const subZod = schemaToZod(subSchema, getSchema).extend({
              _type: z.literal(typeName),
            });
            unionOptions.push(subZod);
          } else {
            // If we can't resolve the schema, we can at least validate the _type
            unionOptions.push(
              z
                .object({
                  _type: z.literal(typeName),
                })
                .passthrough()
            );
          }
        }

        if (unionOptions.length > 0) {
          // Use discriminated union for strict validation
          // Note: z.discriminatedUnion requires at least 2 options usually,
          // but Zod might handle 1. If not, we can check length.
          if (unionOptions.length === 1) {
            zodType = unionOptions[0];
          } else {
            zodType = z.discriminatedUnion('_type', unionOptions as any);
          }
        } else {
          zodType = z.object({_type: z.string()}).passthrough();
        }
      } else {
        // Fallback if no getSchema provided
        zodType = z
          .object({
            _type: z.string(),
          })
          .passthrough();
      }
      break;
    case 'reference':
      zodType = z.object({
        id: z.string(),
        collection: z.string(),
      });
      break;
    case 'references':
      zodType = z.array(
        z.object({
          id: z.string(),
          collection: z.string(),
        })
      );
      break;
    case 'richtext':
      zodType = z
        .object({
          blocks: z.array(
            z.object({
              type: z.string(),
              data: z.any().optional(),
            })
          ),
        })
        .passthrough();
      break;
    default:
      zodType = z.any();
  }

  // Most fields in Root CMS are optional by default unless strictly required.
  // We'll make everything optional for now to match current behavior,
  // unless we add a 'required' property to the schema in the future.
  return zodType.optional();
}
