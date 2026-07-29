/**
 * Loads various files or configurations from the project.
 *
 * NOTE: This file needs to be loaded through vite's ssrLoadModule so that
 * virtual modules are resolved.
 */

import * as schema from './schema.js';

export interface SchemaModule {
  default: schema.Schema;
}

// The virtual module is resolved by rootPodsVitePlugin when loaded through
// Vite's ssrLoadModule. Outside Vite (e.g. tests, CLI), it falls back to {}.
let _SCHEMA_MODULES: Record<string, SchemaModule> = {};
try {
  // @ts-expect-error — virtual module provided by rootPodsVitePlugin
  const mod = await import('virtual:root/schemas');
  _SCHEMA_MODULES = mod.SCHEMA_MODULES || {};
} catch {
  // Virtual module unavailable outside Vite; keep the empty fallback.
}

export const SCHEMA_MODULES = _SCHEMA_MODULES as Record<string, SchemaModule>;

/**
 * Default ceiling on the number of objects a single schema resolution pass is
 * allowed to materialize (clones of pattern/string-referenced schemas). Legit
 * projects resolve to a few hundred thousand nodes at most; runaway schema
 * graphs (e.g. schema files that import other schema modules and embed their
 * fields/types, multiplying the graph each time it is cloned) will otherwise
 * grind through gigabytes of heap and eventually OOM the server. Overridable
 * via the `ROOT_CMS_MAX_SCHEMA_NODES` env var.
 */
const DEFAULT_MAX_RESOLUTION_NODES = 2_000_000;

function maxResolutionNodes(): number {
  const raw = process.env.ROOT_CMS_MAX_SCHEMA_NODES;
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return DEFAULT_MAX_RESOLUTION_NODES;
}

/**
 * Memoized node counts for raw schema objects. Keyed by object identity so a
 * schema module edit (which re-evaluates the module and produces a new object)
 * naturally invalidates its entry.
 */
const nodeCountCache = new WeakMap<object, number>();

/**
 * Counts the objects/arrays reachable from a schema object. Shared subtrees
 * are counted once (matching what `structuredClone()` materializes, since the
 * clone preserves sharing). Cycle-safe.
 */
function countSchemaNodes(root: unknown): number {
  if (typeof root !== 'object' || root === null) {
    return 0;
  }
  const cached = nodeCountCache.get(root);
  if (cached !== undefined) {
    return cached;
  }
  let count = 0;
  const seen = new Set<object>();
  const stack: object[] = [root];
  seen.add(root);
  while (stack.length > 0) {
    const current = stack.pop()!;
    count++;
    const values = Array.isArray(current) ? current : Object.values(current);
    for (const value of values) {
      if (typeof value === 'object' && value !== null && !seen.has(value)) {
        seen.add(value);
        stack.push(value);
      }
    }
  }
  nodeCountCache.set(root, count);
  return count;
}

/**
 * Tracks how many nodes a single top-level resolution pass has materialized,
 * and dedupes clones so each referenced schema is cloned at most once per
 * pass (keyed by name + omitFields).
 */
interface ResolutionContext {
  /** Human-readable description of what started the pass (for errors). */
  origin: string;
  nodesUsed: number;
  nodeLimit: number;
  cloneCache: Map<string, schema.Schema>;
}

function createResolutionContext(origin: string): ResolutionContext {
  return {
    origin,
    nodesUsed: 0,
    nodeLimit: maxResolutionNodes(),
    cloneCache: new Map(),
  };
}

function chargeResolutionBudget(
  ctx: ResolutionContext,
  nodes: number,
  detail: string
) {
  ctx.nodesUsed += nodes;
  if (ctx.nodesUsed > ctx.nodeLimit) {
    throw new Error(
      `schema resolution exceeded ${ctx.nodeLimit} nodes while resolving ` +
        `"${detail}" (started from "${ctx.origin}"). This usually means ` +
        'schema files import other schema modules and embed their ' +
        'fields/types, which multiplies the schema graph every time it is ' +
        'cloned. Prefer schema.glob() patterns or string-name references ' +
        'over importing schema modules directly. If the project schema ' +
        'graph is legitimately this large, raise the limit with the ' +
        'ROOT_CMS_MAX_SCHEMA_NODES environment variable.'
    );
  }
}

/**
 * Clones a referenced schema for resolution, charging the pass budget and
 * deduping so the same schema (with the same omitFields) is cloned at most
 * once per pass.
 */
function cloneReferencedSchema(
  ctx: ResolutionContext,
  name: string,
  raw: schema.Schema,
  omitFields?: string[]
): schema.Schema {
  const cacheKey =
    omitFields && omitFields.length > 0
      ? `${name}|${[...omitFields].sort().join(',')}`
      : name;
  const cached = ctx.cloneCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  chargeResolutionBudget(ctx, countSchemaNodes(raw), name);
  const cloned = structuredClone(raw);
  if (omitFields && omitFields.length > 0) {
    const omitSet = new Set(omitFields);
    cloned.fields = cloned.fields.filter(
      (f: schema.Field) => !omitSet.has(f.id || '')
    );
  }
  ctx.cloneCache.set(cacheKey, cloned);
  return cloned;
}

/**
 * Cached result of `getProjectSchemas()`. Resolving patterns for every schema
 * file is expensive (each `schema.glob()` clones all matching schemas), and
 * the CMS app calls `getProjectSchemas()` on every `/cms` page render. The
 * cache lives for the lifetime of this module instance: in dev, editing any
 * schema file invalidates `virtual:root/schemas` and re-evaluates this module
 * (clearing the cache); in prod builds and one-shot CLI runs (generate-types)
 * the schemas cannot change within the process.
 */
let cachedProjectSchemas: Record<string, schema.Schema> | null = null;

/**
 * Returns a map of all `schema.ts` files defined in the project as
 * fileId => schema. This is used by `generate-types.ts` to build the
 * `root-cms.d.ts` file and by the CMS app to list collections.
 */
export function getProjectSchemas(): Record<string, schema.Schema> {
  if (!cachedProjectSchemas) {
    const schemas: Record<string, schema.Schema> = {};
    // Share one resolution context (budget + clone cache) across the whole
    // pass: consumers treat the resolved schemas as read-only, so schemas
    // referenced from multiple files can share a single clone.
    const ctx = createResolutionContext('getProjectSchemas()');
    for (const fileId in SCHEMA_MODULES) {
      const schemaModule = SCHEMA_MODULES[fileId];
      if (schemaModule.default) {
        // Resolve SchemaPatterns in oneOf fields so type generation works.
        schemas[fileId] = resolveOneOfPatternsInternal(
          schemaModule.default,
          SCHEMA_MODULES,
          ctx
        );
      }
    }
    cachedProjectSchemas = schemas;
  }
  return cachedProjectSchemas;
}

/**
 * Resolves SchemaPattern objects in oneOf fields to arrays of Schema objects.
 * This is needed for type generation which expects `field.types` to be an array.
 */
export function resolveOneOfPatterns(
  schemaObj: schema.Schema,
  schemaModules: Record<string, SchemaModule> = SCHEMA_MODULES
): schema.Schema {
  const ctx = createResolutionContext(
    `resolveOneOfPatterns(${schemaObj.name || 'schema'})`
  );
  return resolveOneOfPatternsInternal(schemaObj, schemaModules, ctx);
}

function resolveOneOfPatternsInternal(
  schemaObj: schema.Schema,
  schemaModules: Record<string, SchemaModule>,
  ctx: ResolutionContext
): schema.Schema {
  chargeResolutionBudget(
    ctx,
    countSchemaNodes(schemaObj),
    schemaObj.name || 'schema'
  );
  const clone = structuredClone(schemaObj);

  function handleField(field: schema.Field) {
    if (field.type === 'oneof') {
      const oneOfField = field as schema.OneOfField;
      if (isSchemaPattern(oneOfField.types)) {
        const pattern = oneOfField.types;
        const matched = matchSchemaPattern(pattern, schemaModules);
        // Convert names back to schema objects for type generation.
        oneOfField.types = matched.names.map((name) =>
          cloneReferencedSchema(
            ctx,
            name,
            matched.byName[name],
            pattern.omitFields
          )
        );
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
 */
export function getCollectionSchema(
  collectionId: string
): schema.Collection | null {
  if (!testValidCollectionId(collectionId)) {
    throw new Error(`invalid collection id: ${collectionId}`);
  }

  const fileId = `/collections/${collectionId}.schema.ts`;
  const module = SCHEMA_MODULES[fileId];
  if (!module?.default) {
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
function buildSchemaNameMap(
  schemaModules: Record<string, SchemaModule> = SCHEMA_MODULES
): Record<string, schema.Schema> {
  const nameMap: Record<string, schema.Schema> = {};
  for (const fileId in schemaModules) {
    const module = schemaModules[fileId];
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
 * Matches a SchemaPattern against the project's schema modules, returning the
 * matched schema names and their raw (uncloned) schema objects.
 *
 * Matching allocates nothing beyond the name list — callers clone lazily via
 * `cloneReferencedSchema()`, which lets them skip schemas they have already
 * registered and dedupe clones across pattern occurrences. (Cloning is
 * required before any mutation: the raw objects are the live entries in
 * `SCHEMA_MODULES`, and mutating them corrupts subsequent calls.)
 */
function matchSchemaPattern(
  pattern: schema.SchemaPattern,
  schemaModules: Record<string, SchemaModule> = SCHEMA_MODULES
): {
  names: string[];
  byName: Record<string, schema.Schema>;
} {
  const regex = globToRegex(pattern.pattern);
  const excludeSet = new Set(pattern.exclude || []);
  const names: string[] = [];
  const byName: Record<string, schema.Schema> = {};

  for (const fileId in schemaModules) {
    if (!regex.test(fileId)) {
      continue;
    }
    const module = schemaModules[fileId];
    if (!module.default || !module.default.name) {
      continue;
    }
    const schemaName = module.default.name;
    if (excludeSet.has(schemaName)) {
      continue;
    }
    names.push(schemaName);
    byName[schemaName] = module.default;
  }

  return {names, byName};
}

/**
 * Converts all `oneof` field type definitions into a map keyed by the type
 * name. The field definitions are replaced with an array of type names.
 *
 * String references (used for self-referencing schemas) are resolved from the
 * project's schema modules. SchemaPatterns are resolved by matching file paths.
 *
 * Schemas pulled in via SchemaPattern or string-name reference are always
 * deep-cloned before being walked. The walk rewrites `oneof` fields in place,
 * and skipping the clone would mutate the shared entries in `SCHEMA_MODULES`
 * and corrupt subsequent calls (e.g. when building multiple collections).
 */
export function convertOneOfTypes(
  collection: schema.Collection,
  schemaModules: Record<string, SchemaModule> = SCHEMA_MODULES
): schema.Collection {
  const ctx = createResolutionContext(
    `convertOneOfTypes(${collection.id || collection.name || 'collection'})`
  );
  chargeResolutionBudget(
    ctx,
    countSchemaNodes(collection),
    collection.id || collection.name || 'collection'
  );
  const clone: schema.Collection = structuredClone(collection);
  const types: Record<string, schema.Schema> = clone.types || {};
  const schemaNameMap = buildSchemaNameMap(schemaModules);

  function handleOneOfField(field: schema.OneOfField) {
    // Handle SchemaPattern (from schema.glob()).
    if (isSchemaPattern(field.types)) {
      const pattern = field.types;
      const matched = matchSchemaPattern(pattern, schemaModules);
      // Process nested oneOf fields in the resolved schemas.
      // Only clone + process schemas that haven't been added to types yet:
      // this prevents infinite recursion with self-referencing schemas
      // (e.g. a Container that can contain other Containers), and avoids
      // re-cloning the same schema for every pattern occurrence.
      for (const name of matched.names) {
        if (!types[name]) {
          const schemaObj = cloneReferencedSchema(
            ctx,
            name,
            matched.byName[name],
            pattern.omitFields
          );
          types[name] = schemaObj;
          if (schemaObj.fields) {
            walk(schemaObj);
          }
        }
      }
      field.types = matched.names;
      return;
    }

    const names: string[] = [];
    (field.types || []).forEach((sub: any) => {
      if (typeof sub === 'string') {
        names.push(sub);
        // Resolve string references from the project schemas.
        if (!types[sub] && schemaNameMap[sub]) {
          const resolvedSchema = cloneReferencedSchema(
            ctx,
            sub,
            schemaNameMap[sub]
          );
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
