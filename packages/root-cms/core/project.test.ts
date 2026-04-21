import {describe, expect, test} from 'vitest';
import {convertOneOfTypes, SchemaModule} from './project.js';
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
      fields: [
        schema.oneOf({id: 'root', types: ['Container']}),
      ],
    };

    const result = convertOneOfTypes(collection, schemaModules);
    expect(result.types?.Container).toBeDefined();
    expect(result.types?.InlineChild).toBeDefined();

    // Source Container must be left untouched.
    const containerOneOf = Container.fields[0] as schema.OneOfField;
    expect(containerOneOf.types).toEqual([InlineChild]);
  });
});
