/**
 * Loads various files or configurations from the project.
 *
 * NOTE: When loaded through Vite's ssrLoadModule, `import.meta.glob()` calls
 * are resolved. In Node.js environments (e.g. scripts, CLI tools),
 * `import.meta.glob` is not available and SCHEMA_MODULES defaults to an empty
 * object. In that case, `getCollectionSchema()` falls back to importing the
 * schema file directly from disk using the provided `rootDir`.
 */

import {existsSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import * as schema from './schema.js';

export interface SchemaModule {
  default: schema.Schema;
}

export const SCHEMA_MODULES: Record<string, SchemaModule> =
  typeof import.meta.glob === 'function'
    ? import.meta.glob<SchemaModule>(
        [
          '/**/*.schema.ts',
          '!/appengine/**/*.schema.ts',
          '!/functions/**/*.schema.ts',
          '!/gae/**/*.schema.ts',
        ],
        {eager: true}
      )
    : {};

/**
 * Returns a map of all `schema.ts` files defined in the project as
 * fileId => schema. This is used by `generate-types.ts` to build the
 * `root-cms.d.ts` file.
 */
export function getProjectSchemas(): Record<string, schema.Schema> {
  const schemas: Record<string, schema.Schema> = {};

  for (const fileId in SCHEMA_MODULES) {
    const schemaModule = SCHEMA_MODULES[fileId];
    if (schemaModule.default) {
      // Resolve SchemaPatterns in oneOf fields so type generation works.
      const resolved = resolveOneOfPatterns(schemaModule.default);
      schemas[fileId] = resolved;
    }
  }
  return schemas;
}

/**
 * Resolves SchemaPattern objects in oneOf fields to arrays of Schema objects.
 * This is needed for type generation which expects `field.types` to be an array.
 */
export function resolveOneOfPatterns(schemaObj: schema.Schema): schema.Schema {
  const clone = structuredClone(schemaObj);

  function handleField(field: schema.Field) {
    if (field.type === 'oneof') {
      const oneOfField = field as schema.OneOfField;
      if (isSchemaPattern(oneOfField.types)) {
        const resolved = resolveSchemaPattern(oneOfField.types);
        // Convert names back to schema objects for type generation.
        oneOfField.types = resolved.names.map((name) => resolved.schemas[name]);
      }
    } else if (field.type === 'object' && 'fields' in field) {
      (field.fields || []).forEach(handleField);
    } else if (field.type === 'array' && 'of' in field && field.of) {
      handleField(field.of);
    }
  }

  (clone.fields || []).forEach(handleField);
  return clone;
}

/**
 * Returns a collection's schema definition as defined in
 * `/collections/<id>.schema.ts`.
 *
 * In Vite environments, schemas are loaded from `SCHEMA_MODULES` (populated
 * by `import.meta.glob`). In Node.js environments, if `rootDir` is provided,
 * falls back to importing the schema file directly from disk.
 */
export async function getCollectionSchema(
  collectionId: string,
  options?: {rootDir?: string}
): Promise<schema.Collection | null> {
  if (!testValidCollectionId(collectionId)) {
    throw new Error(`invalid collection id: ${collectionId}`);
  }

  const fileId = `/collections/${collectionId}.schema.ts`;
  const module = SCHEMA_MODULES[fileId];
  if (module && module.default) {
    const collection = module.default as schema.Collection;
    collection.id = collectionId;
    return convertOneOfTypes(collection);
  }

  // Fallback for Node.js environments where import.meta.glob is not
  // available (e.g., CLI tools, migration scripts). Directly import
  // the schema file from disk using the provided rootDir.
  const rootDir = options?.rootDir;
  if (rootDir) {
    const schemaPath = path.resolve(
      rootDir,
      `collections/${collectionId}.schema.ts`
    );
    if (existsSync(schemaPath)) {
      try {
        const mod = await import(pathToFileURL(schemaPath).href);
        if (mod.default) {
          const collection = mod.default as schema.Collection;
          collection.id = collectionId;
          return convertOneOfTypes(collection);
        }
      } catch (e) {
        // Schema file exists but failed to load.
        console.warn(`failed to load schema from ${schemaPath}:`, e);
      }
    }
  }

  if (!module) {
    console.warn(`collection schema not found: ${fileId}`);
  } else {
    console.warn(`collection schema not exported in: ${fileId}`);
  }
  return null;
}

function testValidCollectionId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id);
}

/**
 * Type guard to check if a value is a SchemaPattern.
 */
function isSchemaPattern(value: unknown): value is schema.SchemaPattern {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_schemaPattern' in value &&
    (value as schema.SchemaPattern)._schemaPattern === true
  );
}

/**
 * Build a map of schema name to schema for resolving string references.
 */
function buildSchemaNameMap(): Record<string, schema.Schema> {
  const nameMap: Record<string, schema.Schema> = {};
  for (const fileId in SCHEMA_MODULES) {
    const module = SCHEMA_MODULES[fileId];
    if (module.default && module.default.name) {
      nameMap[module.default.name] = module.default;
    }
  }
  return nameMap;
}

/**
 * Converts a glob pattern to a RegExp for matching file paths.
 * Supports basic glob syntax: * (any chars except /), ** (any chars including /).
 */
function globToRegex(pattern: string): RegExp {
  const regexStr = pattern
    // Escape special regex chars except * and /.
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // Convert ** to a placeholder.
    .replace(/\*\*/g, '{{DOUBLE_STAR}}')
    // Convert * to match any chars except /.
    .replace(/\*/g, '[^/]*')
    // Convert ** placeholder to match any chars including /.
    .replace(/\{\{DOUBLE_STAR\}\}/g, '.*');

  return new RegExp(`^${regexStr}$`);
}

/**
 * Resolves a SchemaPattern to an array of schema names.
 */
function resolveSchemaPattern(pattern: schema.SchemaPattern): {
  names: string[];
  schemas: Record<string, schema.Schema>;
} {
  const regex = globToRegex(pattern.pattern);
  const excludeSet = new Set(pattern.exclude || []);
  const names: string[] = [];
  const schemas: Record<string, schema.Schema> = {};

  for (const fileId in SCHEMA_MODULES) {
    if (!regex.test(fileId)) {
      continue;
    }
    const module = SCHEMA_MODULES[fileId];
    if (!module.default || !module.default.name) {
      continue;
    }
    const schemaName = module.default.name;
    if (excludeSet.has(schemaName)) {
      continue;
    }

    let schemaObj = module.default;

    // Apply field omissions if specified.
    if (pattern.omitFields && pattern.omitFields.length > 0) {
      const omitSet = new Set(pattern.omitFields);
      schemaObj = {
        ...schemaObj,
        fields: schemaObj.fields.filter(
          (f: schema.Field) => !omitSet.has(f.id || '')
        ),
      };
    }

    names.push(schemaName);
    schemas[schemaName] = schemaObj;
  }

  return {names, schemas};
}

/**
 * Converts all `oneof` field type definitions into a map keyed by the type
 * name. The field definitions are replaced with an array of type names.
 *
 * String references (used for self-referencing schemas) are resolved from the
 * project's schema modules. SchemaPatterns are resolved by matching file paths.
 */
function convertOneOfTypes(collection: schema.Collection): schema.Collection {
  const clone: schema.Collection = structuredClone(collection);
  const types: Record<string, schema.Schema> = clone.types || {};
  const schemaNameMap = buildSchemaNameMap();

  function handleOneOfField(field: schema.OneOfField) {
    // Handle SchemaPattern (from schema.glob()).
    if (isSchemaPattern(field.types)) {
      const resolved = resolveSchemaPattern(field.types);
      // Process nested oneOf fields in the resolved schemas.
      // Only process schemas that haven't been added to types yet to prevent
      // infinite recursion with self-referencing schemas (e.g., a Container
      // that can contain other Containers).
      for (const [name, schemaObj] of Object.entries(resolved.schemas)) {
        if (!types[name]) {
          types[name] = schemaObj;
          if (schemaObj.fields) {
            walk(schemaObj);
          }
        }
      }
      field.types = resolved.names;
      return;
    }

    const names: string[] = [];
    (field.types || []).forEach((sub: any) => {
      if (typeof sub === 'string') {
        names.push(sub);
        // Resolve string references from the project schemas.
        if (!types[sub] && schemaNameMap[sub]) {
          const resolvedSchema = schemaNameMap[sub];
          types[sub] = resolvedSchema;
          if (resolvedSchema.fields) {
            walk(resolvedSchema);
          }
        }
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
