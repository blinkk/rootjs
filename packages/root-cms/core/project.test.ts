import {afterEach, describe, expect, test} from 'vitest';
import {
  convertOneOfTypes,
  getProjectSchemas,
  resolveOneOfPatterns,
  SchemaModule,
} from './project.js';
import * as schema from './schema.js';

describe('convertOneOfTypes', () => {
  test('registers inline oneof types from pattern-matched schemas', () => {
    // An inline schema that lives inside /modules/ModuleA.schema.ts but isn't
    // itself a top-level default export.
    const InlineChild = schema.define({
      name: 'InlineChild',
      fields: [schema.string({id: 'text'})],
    });
    const ModuleA = schema.define({
      name: 'ModuleA',
      fields: [schema.oneOf({id: 'inner', types: [InlineChild]})],
    });
    const schemaModules: Record<string, SchemaModule> = {
      '/modules/ModuleA.schema.ts': {default: ModuleA},
    };
    const collection = (): schema.Collection => ({
      id: 'pages',
      name: 'Pages',
      url: '/[...slug]',
      fields: [
        schema.array({
          id: 'modules',
          of: schema.oneOf({
            types: schema.glob('/modules/*.schema.ts'),
          }),
        }),
      ],
    });

    const first = convertOneOfTypes(collection(), schemaModules);
    expect(Object.keys(first.types || {})).toEqual(
      expect.arrayContaining(['ModuleA', 'InlineChild'])
    );

    // The source ModuleA must not have been mutated — its nested oneof types
    // should still be the original array of Schema objects.
    const moduleAOneOf = ModuleA.fields[0] as schema.OneOfField;
    expect(moduleAOneOf.types).toEqual([InlineChild]);

    // A second invocation against the same schemaModules must still produce
    // the full types map. Prior to the fix this regressed because SCHEMA_MODULES
    // was mutated in place and the inline types couldn't be recovered from the
    // top-level name map on the second pass.
    const second = convertOneOfTypes(collection(), schemaModules);
    expect(second.types?.InlineChild).toBeDefined();
    expect(second.types?.ModuleA).toBeDefined();
  });

  test('does not mutate source schemas resolved via string reference', () => {
    const InlineChild = schema.define({
      name: 'InlineChild',
      fields: [schema.string({id: 'text'})],
    });
    const Container = schema.define({
      name: 'Container',
      fields: [schema.oneOf({id: 'inner', types: [InlineChild]})],
    });
    const schemaModules: Record<string, SchemaModule> = {
      '/schemas/Container.schema.ts': {default: Container},
    };
    const collection: schema.Collection = {
      id: 'pages',
      name: 'Pages',
      url: '/[...slug]',
      fields: [schema.oneOf({id: 'root', types: ['Container']})],
    };

    const result = convertOneOfTypes(collection, schemaModules);
    expect(result.types?.Container).toBeDefined();
    expect(result.types?.InlineChild).toBeDefined();

    // Source Container must be left untouched.
    const containerOneOf = Container.fields[0] as schema.OneOfField;
    expect(containerOneOf.types).toEqual([InlineChild]);
  });
});

describe('resolveOneOfPatterns', () => {
  test('resolves schema.glob() patterns to schema objects', () => {
    const ModuleA = schema.define({
      name: 'ModuleA',
      fields: [schema.string({id: 'title'})],
    });
    const schemaModules: Record<string, SchemaModule> = {
      '/modules/ModuleA.schema.ts': {default: ModuleA},
    };
    const Container = schema.define({
      name: 'Container',
      fields: [
        schema.array({
          id: 'modules',
          of: schema.oneOf({types: schema.glob('/modules/*.schema.ts')}),
        }),
      ],
    });

    const resolved = resolveOneOfPatterns(Container, schemaModules);
    const arrayField = resolved.fields[0] as schema.ArrayField;
    const oneOf = arrayField.of as schema.OneOfField;
    expect(Array.isArray(oneOf.types)).toBe(true);
    const types = oneOf.types as schema.Schema[];
    expect(types.map((t) => t.name)).toEqual(['ModuleA']);
    // The resolved schema is a clone; the source module must be untouched.
    expect(types[0]).not.toBe(ModuleA);
    expect(ModuleA.fields).toHaveLength(1);
  });

  test('clones each referenced schema once per pass', () => {
    const ModuleA = schema.define({
      name: 'ModuleA',
      fields: [schema.string({id: 'title'})],
    });
    const schemaModules: Record<string, SchemaModule> = {
      '/modules/ModuleA.schema.ts': {default: ModuleA},
    };
    // Two separate pattern occurrences referencing the same schema.
    const Container = schema.define({
      name: 'Container',
      fields: [
        schema.array({
          id: 'main',
          of: schema.oneOf({types: schema.glob('/modules/*.schema.ts')}),
        }),
        schema.array({
          id: 'sidebar',
          of: schema.oneOf({types: schema.glob('/modules/*.schema.ts')}),
        }),
      ],
    });

    const resolved = resolveOneOfPatterns(Container, schemaModules);
    const main = (resolved.fields[0] as schema.ArrayField)
      .of as schema.OneOfField;
    const sidebar = (resolved.fields[1] as schema.ArrayField)
      .of as schema.OneOfField;
    // Consumers treat resolved schemas as read-only, so both occurrences
    // share a single clone instead of materializing one clone per occurrence.
    expect((main.types as schema.Schema[])[0]).toBe(
      (sidebar.types as schema.Schema[])[0]
    );
  });

  test('applies omitFields per pattern occurrence', () => {
    const ModuleA = schema.define({
      name: 'ModuleA',
      fields: [schema.string({id: 'title'}), schema.string({id: 'internal'})],
    });
    const schemaModules: Record<string, SchemaModule> = {
      '/modules/ModuleA.schema.ts': {default: ModuleA},
    };
    const Container = schema.define({
      name: 'Container',
      fields: [
        schema.array({
          id: 'main',
          of: schema.oneOf({types: schema.glob('/modules/*.schema.ts')}),
        }),
        schema.array({
          id: 'trimmed',
          of: schema.oneOf({
            types: schema.glob('/modules/*.schema.ts', {
              omitFields: ['internal'],
            }),
          }),
        }),
      ],
    });

    const resolved = resolveOneOfPatterns(Container, schemaModules);
    const main = (resolved.fields[0] as schema.ArrayField)
      .of as schema.OneOfField;
    const trimmed = (resolved.fields[1] as schema.ArrayField)
      .of as schema.OneOfField;
    const mainType = (main.types as schema.Schema[])[0];
    const trimmedType = (trimmed.types as schema.Schema[])[0];
    expect(mainType.fields.map((f) => f.id)).toEqual(['title', 'internal']);
    expect(trimmedType.fields.map((f) => f.id)).toEqual(['title']);
    // Different omitFields must not share a clone.
    expect(mainType).not.toBe(trimmedType);
  });
});

describe('schema resolution node budget', () => {
  afterEach(() => {
    delete process.env.ROOT_CMS_MAX_SCHEMA_NODES;
  });

  /** Builds a schema with enough nodes to trip a small budget. */
  function fatSchema(name: string, numFields: number): schema.Schema {
    const fields: schema.Field[] = [];
    for (let i = 0; i < numFields; i++) {
      fields.push(schema.string({id: `field${i}`, label: `Field ${i}`}));
    }
    return schema.define({name, fields});
  }

  test('convertOneOfTypes fails fast with an actionable error', () => {
    process.env.ROOT_CMS_MAX_SCHEMA_NODES = '50';
    const schemaModules: Record<string, SchemaModule> = {
      '/modules/Fat.schema.ts': {default: fatSchema('Fat', 100)},
    };
    const collection: schema.Collection = {
      id: 'pages',
      name: 'Pages',
      url: '/[...slug]',
      fields: [
        schema.array({
          id: 'modules',
          of: schema.oneOf({types: schema.glob('/modules/*.schema.ts')}),
        }),
      ],
    };
    expect(() => convertOneOfTypes(collection, schemaModules)).toThrowError(
      /schema resolution exceeded 50 nodes/
    );
  });

  test('resolveOneOfPatterns fails fast with an actionable error', () => {
    process.env.ROOT_CMS_MAX_SCHEMA_NODES = '50';
    const schemaModules: Record<string, SchemaModule> = {
      '/modules/Fat.schema.ts': {default: fatSchema('Fat', 100)},
    };
    const Container = schema.define({
      name: 'Container',
      fields: [
        schema.array({
          id: 'modules',
          of: schema.oneOf({types: schema.glob('/modules/*.schema.ts')}),
        }),
      ],
    });
    expect(() => resolveOneOfPatterns(Container, schemaModules)).toThrowError(
      /ROOT_CMS_MAX_SCHEMA_NODES/
    );
  });

  test('budget does not trip on reasonable schemas', () => {
    const schemaModules: Record<string, SchemaModule> = {
      '/modules/Fat.schema.ts': {default: fatSchema('Fat', 100)},
    };
    const collection: schema.Collection = {
      id: 'pages',
      name: 'Pages',
      url: '/[...slug]',
      fields: [
        schema.array({
          id: 'modules',
          of: schema.oneOf({types: schema.glob('/modules/*.schema.ts')}),
        }),
      ],
    };
    expect(() => convertOneOfTypes(collection, schemaModules)).not.toThrow();
  });
});

describe('getProjectSchemas', () => {
  test('memoizes the resolved schema map per module instance', () => {
    const first = getProjectSchemas();
    const second = getProjectSchemas();
    expect(second).toBe(first);
  });
});
