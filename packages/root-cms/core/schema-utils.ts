/**
 * Internal utilities used by schema.ts and project.ts. These are intentionally
 * not exported from the public `@blinkk/root-cms` package.
 */

import type {Field, OneOfField, Schema, SchemaPattern} from './schema.js';

/**
 * Type guard to check if a value is a SchemaPattern (from `schema.glob()`).
 */
export function isSchemaPattern(value: unknown): value is SchemaPattern {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_schemaPattern' in value &&
    (value as SchemaPattern)._schemaPattern === true
  );
}

/**
 * Converts a glob pattern to a RegExp for matching file paths.
 * Supports basic glob syntax: `*` (any chars except `/`), `**` (any chars
 * including `/`).
 */
export function globToRegex(pattern: string): RegExp {
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
 * Internal registry of all schemas, keyed by file path. Populated by
 * `setRegistry()` which is called automatically from `project.ts` when
 * the project is loaded through Vite.
 */
let _registry: Record<string, Schema> | null = null;

/**
 * Populates the internal schema registry and automatically resolves all
 * `SchemaPattern` and string references in `oneOf` fields in-place. This is
 * called automatically by the project module when schemas are loaded through
 * Vite's `import.meta.glob`.
 *
 * After this call, every schema in the registry will have its `oneOf.types`
 * resolved to `Schema[]` arrays, so consumers that import schemas directly
 * (e.g., `import PagesSchema from '@/collections/Pages.schema.js'`) get
 * fully resolved schemas without any extra steps.
 *
 * @param modules - A record of file paths to schema modules (with a `default`
 *   export) or plain schema objects.
 */
export function setRegistry(
  modules: Record<string, {default?: Schema} | Schema>
) {
  _registry = {};
  for (const [path, mod] of Object.entries(modules)) {
    const schemaObj =
      mod && typeof mod === 'object' && 'default' in mod
        ? (mod as {default?: Schema}).default
        : (mod as Schema);
    if (schemaObj) {
      _registry[path] = schemaObj;
    }
  }

  // Auto-resolve all SchemaPattern and string references in-place so that
  // schemas are ready to use immediately after import.
  resolveRegistryInPlace(_registry);
}

/**
 * Returns the internal schema registry, or `null` if not yet populated.
 */
export function getRegistry(): Record<string, Schema> | null {
  return _registry;
}

/**
 * Resolves all `SchemaPattern` and string references in the given registry
 * in-place. Each schema's own field tree is walked shallowly — resolved
 * schemas from the registry are referenced directly (not recursed into),
 * since they each get their own pass. This naturally avoids infinite recursion
 * for self-referencing schemas (e.g., a Container that can contain itself).
 */
function resolveRegistryInPlace(registry: Record<string, Schema>) {
  // Build a name-based lookup for resolving string references.
  const nameMap: Record<string, Schema> = {};
  for (const s of Object.values(registry)) {
    if (s.name) {
      nameMap[s.name] = s;
    }
  }

  function resolvePattern(pattern: SchemaPattern): Schema[] {
    const regex = globToRegex(pattern.pattern);
    const excludeSet = new Set(pattern.exclude || []);
    const result: Schema[] = [];

    for (const [fileId, s] of Object.entries(registry)) {
      if (!regex.test(fileId) || !s.name || excludeSet.has(s.name)) {
        continue;
      }
      let resolved = s;
      if (pattern.omitFields && pattern.omitFields.length > 0) {
        const omitSet = new Set(pattern.omitFields);
        resolved = {
          ...s,
          fields: s.fields.filter((f: Field) => !omitSet.has(f.id || '')),
        };
      }
      result.push(resolved);
    }

    return result;
  }

  // Shallow walk: resolve oneOf types within each schema's own fields but
  // don't recurse into the resolved schema objects — they will be (or already
  // have been) resolved independently.
  function handleField(field: Field) {
    if (field.type === 'oneof') {
      const oneOfField = field as OneOfField;
      if (isSchemaPattern(oneOfField.types)) {
        oneOfField.types = resolvePattern(oneOfField.types);
      } else if (Array.isArray(oneOfField.types)) {
        const hasStrings = (oneOfField.types as unknown[]).some(
          (t) => typeof t === 'string'
        );
        if (hasStrings) {
          oneOfField.types = (oneOfField.types as Array<Schema | string>).map(
            (t) => {
              if (typeof t === 'string') {
                return nameMap[t] ?? t;
              }
              return t;
            }
          ) as Schema[];
        }
      }
    } else if (field.type === 'object' && 'fields' in field) {
      (field.fields || []).forEach(handleField);
    } else if (field.type === 'array' && 'of' in field && field.of) {
      handleField(field.of);
    }
  }

  for (const s of Object.values(registry)) {
    (s.fields || []).forEach(handleField);
  }
}

/**
 * Resolves all `SchemaPattern` references in a schema, returning a new schema
 * with all `oneOf` field types fully resolved to inline `Schema` objects.
 *
 * In most cases this is **not needed** because schemas are automatically
 * resolved in-place when the project module loads. This function is useful
 * when working with schemas that were created dynamically outside of the
 * project's schema files.
 */
export function resolve(schemaObj: Schema): Schema {
  if (!_registry) {
    throw new Error(
      'No schema registry available. Ensure the project module has been ' +
        'loaded (which auto-populates the registry).'
    );
  }
  const clone: Schema = structuredClone(schemaObj);
  // Resolve in a temporary single-entry registry backed by the real one.
  const tempRegistry: Record<string, Schema> = {..._registry};
  // Add the schema itself (in case it's not already in the registry).
  const tempKey = `/__dynamic/${schemaObj.name || 'schema'}.schema.ts`;
  tempRegistry[tempKey] = clone;
  resolveRegistryInPlace(tempRegistry);
  return clone;
}
