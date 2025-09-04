/**
 * Loads various files or configurations from the project.
 *
 * NOTE: This file needs to be loaded through vite's ssrLoadModule so that
 * `import.meta.glob()` calls are resolved.
 */

import * as schema from './schema.js';

export interface SchemaModule {
  default: schema.Schema;
}

export const SCHEMA_MODULES = import.meta.glob<SchemaModule>(
  [
    '/**/*.schema.ts',
    '!/appengine/**/*.schema.ts',
    '!/functions/**/*.schema.ts',
    '!/gae/**/*.schema.ts',
  ],
  {eager: true}
);

/**
 * Returns a map of all `schema.ts` files defined in the project as
 * fileId => schema. This is used by `generate-types.ts` to build the
 * `root-cms.d.ts` file.
 */
export async function getProjectSchemas(): Promise<
  Record<string, schema.Schema>
> {
  const schemas: Record<string, schema.Schema> = {};
  for (const fileId in SCHEMA_MODULES) {
    const schemaModule = SCHEMA_MODULES[fileId];
    if (schemaModule.default) {
      schemas[fileId] = schemaModule.default;
    }
  }
  return schemas;
}

/**
 * Returns a collection's schema definition as defined in
 * `/collections/<id>.schema.ts`.
 */
export async function getCollectionSchema(
  collectionId: string
): Promise<schema.Collection | null> {
  if (!testValidCollectionId(collectionId)) {
    throw new Error(`invalid collection id: ${collectionId}`);
  }

  const fileId = `/collections/${collectionId}.schema.ts`;
  const module = SCHEMA_MODULES[fileId];
  if (!module.default) {
    console.warn(`collection schema not exported in: ${fileId}`);
    return null;
  }
  const collection = module.default as schema.Collection;
  collection.id = collectionId;

  // Convert `schema.oneOf()` object types to an array of strings and move the
  // type schema to `collection.types`.
  return convertOneOfTypes(collection);
}

function testValidCollectionId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id);
}

/**
 * Converts all `oneof` field type definitions into a map keyed by the type
 * name. The field definitions are replaced with an array of type names.
 */
function convertOneOfTypes(collection: schema.Collection): schema.Collection {
  const clone: schema.Collection = structuredClone(collection);
  const types: Record<string, schema.Schema> = clone.types || {};

  function handleOneOfField(field: schema.OneOfField) {
    const names: string[] = [];
    (field.types || []).forEach((sub: any) => {
      if (typeof sub === 'string') {
        names.push(sub);
        return;
      }
      if (sub.name) {
        names.push(sub.name);
        // Avoid circular loops by checking if the type has already been
        // registered before recursively calling walk().
        if (!types[sub.name]) {
          types[sub.name] = sub;
          if (sub.fields) {
            walk(sub);
          }
        }
      }
    });
    field.types = names;
  }

  function handleField(field: schema.Field) {
    if (field.type === 'oneof') {
      handleOneOfField(field);
    } else if (field.type === 'object') {
      walk(field);
    } else if (field.type === 'array' && field.of) {
      handleField(field.of);
    }
  }

  function walk(schema: any) {
    const fields = schema?.fields || [];
    fields.forEach(handleField);
  }
  walk(clone);
  clone.types = types;
  return clone;
}
