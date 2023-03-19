/**
 * Loads various files or configurations from the project.
 *
 * NOTE: This file needs to be loaded through vite's ssrLoadModule so that
 * `import.meta.glob()` calls are resolved.
 */

import {Schema} from './schema.js';

export interface SchemaModule {
  default: Schema;
}

const SCHEMA_MODULES = import.meta.glob<SchemaModule>('/**/*.schema.ts', {
  eager: true,
});

export function getProjectSchemas(): Record<string, Schema> {
  const schemas: Record<string, Schema> = {};
  for (const fileId in SCHEMA_MODULES) {
    const schemaModule = SCHEMA_MODULES[fileId];
    if (schemaModule.default) {
      schemas[fileId] = schemaModule.default;
    }
  }
  return schemas;
}
