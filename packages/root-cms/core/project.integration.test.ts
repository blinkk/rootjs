/**
 * Integration test for production bundle compatibility.
 *
 * This test ensures that the schema export works correctly when the package
 * is bundled with code splitting enabled. It verifies that there are no
 * circular dependency issues when schema files import from '@blinkk/root-cms'.
 */

import {describe, it, expect} from 'vitest';
import * as schema from './schema.js';

describe('Production Bundle Integration', () => {
  it('should export schema namespace without circular dependency errors', async () => {
    // Import the core module (which is the main entry point).
    const coreModule = await import('./core.js');

    // Verify schema namespace is exported and contains expected functions.
    expect(coreModule.schema).toBeDefined();
    expect(typeof coreModule.schema.collection).toBe('function');
    expect(typeof coreModule.schema.define).toBe('function');
    expect(typeof coreModule.schema.string).toBe('function');
    expect(typeof coreModule.schema.number).toBe('function');
    expect(typeof coreModule.schema.boolean).toBe('function');
    expect(typeof coreModule.schema.array).toBe('function');
    expect(typeof coreModule.schema.object).toBe('function');
    expect(typeof coreModule.schema.glob).toBe('function');
  });

  it('should be able to create a collection schema using schema.collection()', async () => {
    const coreModule = await import('./core.js');

    // This simulates what user schema files do.
    const testCollection = coreModule.schema.collection({
      name: 'TestCollection',
      description: 'Test collection for integration test',
      url: '/test/[slug]',
      fields: [
        coreModule.schema.string({
          id: 'title',
          label: 'Title',
        }),
        coreModule.schema.richtext({
          id: 'content',
          label: 'Content',
        }),
      ],
    });

    expect(testCollection).toBeDefined();
    expect(testCollection.name).toBe('TestCollection');
    expect(testCollection.description).toBe(
      'Test collection for integration test'
    );
    expect(testCollection.url).toBe('/test/[slug]');
    expect(testCollection.fields).toHaveLength(2);
    expect(testCollection.fields[0].type).toBe('string');
    expect(testCollection.fields[1].type).toBe('richtext');
  });

  it('should be able to dynamically import project module after core', async () => {
    // First, import and use core module.
    const coreModule = await import('./core.js');
    expect(coreModule.schema).toBeDefined();

    // Then, dynamically import project module (which uses import.meta.glob).
    // This should not cause circular dependency issues.
    const projectModule = await import('./project.js');
    expect(projectModule.SCHEMA_MODULES).toBeDefined();
    expect(typeof projectModule.getProjectSchemas).toBe('function');
    expect(typeof projectModule.getCollectionSchema).toBe('function');
  });

  it('should allow schema files to spread existing schemas', async () => {
    const coreModule = await import('./core.js');

    // Create a base schema.
    const baseSchema = coreModule.schema.define({
      name: 'BaseSchema',
      fields: [
        coreModule.schema.string({id: 'title'}),
        coreModule.schema.string({id: 'description'}),
      ],
    });

    // Create a new collection that extends the base schema.
    // This simulates the BlogPostsSandbox.schema.ts pattern.
    const extendedCollection = coreModule.schema.collection({
      ...baseSchema,
      name: 'ExtendedCollection',
      url: '/extended/[slug]',
    });

    expect(extendedCollection.name).toBe('ExtendedCollection');
    expect(extendedCollection.url).toBe('/extended/[slug]');
    expect(extendedCollection.fields).toHaveLength(2);
    expect(extendedCollection.fields[0].id).toBe('title');
    expect(extendedCollection.fields[1].id).toBe('description');
  });
});

describe('SchemaPattern Resolution', () => {
  it('should export glob function from core module', async () => {
    const coreModule = await import('./core.js');

    expect(typeof coreModule.schema.glob).toBe('function');
  });

  it('should create valid SchemaPattern with glob', async () => {
    const coreModule = await import('./core.js');

    const pattern = coreModule.schema.glob('/templates/*/*.schema.ts');

    expect(pattern._schemaPattern).toBe(true);
    expect(pattern.pattern).toBe('/templates/*/*.schema.ts');
  });

  it('should support glob with exclude option', async () => {
    const coreModule = await import('./core.js');

    const pattern = coreModule.schema.glob('/templates/*/*.schema.ts', {
      exclude: ['DeprecatedTemplate'],
    });

    expect(pattern.exclude).toEqual(['DeprecatedTemplate']);
  });

  it('should support glob with omitFields option', async () => {
    const coreModule = await import('./core.js');

    const pattern = coreModule.schema.glob('/blocks/*/*.schema.ts', {
      omitFields: ['id'],
    });

    expect(pattern.omitFields).toEqual(['id']);
  });

  it('should allow oneOf field to use SchemaPattern', async () => {
    const coreModule = await import('./core.js');

    const collection = coreModule.schema.collection({
      name: 'TestPages',
      url: '/test/[...slug]',
      fields: [
        coreModule.schema.array({
          id: 'modules',
          label: 'Modules',
          of: coreModule.schema.oneOf({
            types: coreModule.schema.glob('/templates/*/*.schema.ts'),
          }),
        }),
      ],
    });

    expect(collection.name).toBe('TestPages');
    const arrayField = collection.fields[0] as schema.ArrayField;
    const oneOfField = arrayField.of as schema.OneOfField;
    const pattern = oneOfField.types as schema.SchemaPattern;
    expect(pattern._schemaPattern).toBe(true);
  });

  it('should support self-referencing container schemas via glob', async () => {
    const coreModule = await import('./core.js');

    // This is the key use case: a Container that can nest other Containers.
    const containerSchema = coreModule.schema.define({
      name: 'Container',
      description: 'Can contain nested templates including other Containers.',
      fields: [
        coreModule.schema.string({id: 'id'}),
        coreModule.schema.array({
          id: 'children',
          of: coreModule.schema.oneOf({
            // Self-reference via pattern - no circular import issues!
            types: coreModule.schema.glob('/templates/*/*.schema.ts'),
          }),
        }),
      ],
    });

    expect(containerSchema.name).toBe('Container');
    const arrayField = containerSchema.fields[1] as schema.ArrayField;
    const oneOfField = arrayField.of as schema.OneOfField;
    const pattern = oneOfField.types as schema.SchemaPattern;
    expect(pattern._schemaPattern).toBe(true);
  });

  it('should work with multiple glob patterns in same collection', async () => {
    const coreModule = await import('./core.js');

    // A page that uses templates for main content and blocks for sidebars.
    const collection = coreModule.schema.collection({
      name: 'AdvancedPages',
      url: '/advanced/[slug]',
      fields: [
        coreModule.schema.array({
          id: 'mainContent',
          of: coreModule.schema.oneOf({
            types: coreModule.schema.glob('/templates/*/*.schema.ts'),
          }),
        }),
        coreModule.schema.array({
          id: 'sidebar',
          of: coreModule.schema.oneOf({
            types: coreModule.schema.glob('/blocks/*/*.schema.ts', {
              omitFields: ['id'],
            }),
          }),
        }),
      ],
    });

    expect(collection.fields).toHaveLength(2);

    const mainField = collection.fields[0] as schema.ArrayField;
    const mainOneOf = mainField.of as schema.OneOfField;
    const mainPattern = mainOneOf.types as schema.SchemaPattern;
    expect(mainPattern._schemaPattern).toBe(true);

    const sidebarField = collection.fields[1] as schema.ArrayField;
    const sidebarOneOf = sidebarField.of as schema.OneOfField;
    const sidebarPattern = sidebarOneOf.types as schema.SchemaPattern;
    expect(sidebarPattern._schemaPattern).toBe(true);
    expect(sidebarPattern.omitFields).toEqual(['id']);
  });
});

describe('Auto-Resolution Integration', () => {
  it('should auto-resolve schemas when project module is loaded (dev mode)', async () => {
    // In dev mode, when project.ts is loaded via Vite, it calls setRegistry
    // which auto-resolves all schemas in-place.
    const projectModule = await import('./project.js');

    // Verify the registry is populated.
    expect(projectModule.SCHEMA_MODULES).toBeDefined();
    expect(typeof projectModule.SCHEMA_MODULES).toBe('object');
  });

  it('should provide resolved schemas via getProjectSchemas', async () => {
    const coreModule = await import('./core.js');

    // Create test schemas with glob patterns.
    const testTemplate = coreModule.schema.define({
      name: 'TestTemplate',
      fields: [coreModule.schema.string({id: 'title'})],
    });

    const testCollection = coreModule.schema.define({
      name: 'TestCollection',
      fields: [
        coreModule.schema.array({
          id: 'modules',
          of: coreModule.schema.oneOf({
            types: coreModule.schema.glob('/templates/*/*.schema.ts'),
          }),
        }),
      ],
    });

    // Manually set registry for testing (simulating what project.ts does).
    const {setRegistry} = await import('./schema-utils.js');
    setRegistry({
      '/templates/Test/Test.schema.ts': testTemplate,
      '/collections/Test.schema.ts': testCollection,
    });

    // After setRegistry, the collection's oneOf field should be resolved.
    const arrayField = testCollection.fields[0] as schema.ArrayField;
    const oneOfField = arrayField.of as schema.OneOfField;

    // Verify it's now an array of schemas, not a SchemaPattern.
    expect(Array.isArray(oneOfField.types)).toBe(true);
    const types = oneOfField.types as schema.Schema[];
    expect(types).toHaveLength(1);
    expect(types[0].name).toBe('TestTemplate');
  });

  it('should work in both dev and prod modes', async () => {
    const coreModule = await import('./core.js');
    const {setRegistry, getRegistry} = await import('./schema-utils.js');

    // Simulate a production environment where schemas are bundled.
    const prodSchema1 = coreModule.schema.define({
      name: 'ProdTemplate1',
      fields: [coreModule.schema.string({id: 'content'})],
    });

    const prodSchema2 = coreModule.schema.define({
      name: 'ProdTemplate2',
      fields: [coreModule.schema.string({id: 'text'})],
    });

    const prodCollection = coreModule.schema.define({
      name: 'ProdCollection',
      fields: [
        coreModule.schema.array({
          id: 'items',
          of: coreModule.schema.oneOf({
            types: coreModule.schema.glob('/templates/*/*.schema.ts'),
          }),
        }),
      ],
    });

    // In production, setRegistry would be called by the bundled project module.
    setRegistry({
      '/templates/ProdTemplate1/ProdTemplate1.schema.ts': {
        default: prodSchema1,
      },
      '/templates/ProdTemplate2/ProdTemplate2.schema.ts': {
        default: prodSchema2,
      },
      '/collections/Prod.schema.ts': prodCollection,
    });

    // Verify registry is populated.
    const registry = getRegistry();
    expect(registry).not.toBeNull();
    expect(Object.keys(registry!)).toHaveLength(3);

    // Verify collection schema is auto-resolved.
    const arrayField = prodCollection.fields[0] as schema.ArrayField;
    const oneOfField = arrayField.of as schema.OneOfField;
    expect(Array.isArray(oneOfField.types)).toBe(true);
    const types = oneOfField.types as schema.Schema[];
    expect(types).toHaveLength(2);
    expect(types.map((t) => t.name).sort()).toEqual([
      'ProdTemplate1',
      'ProdTemplate2',
    ]);
  });

  it('should handle string references in oneOf types', async () => {
    const coreModule = await import('./core.js');
    const {setRegistry} = await import('./schema-utils.js');

    const template1 = coreModule.schema.define({
      name: 'StringRefTemplate1',
      fields: [coreModule.schema.string({id: 'title'})],
    });

    const template2 = coreModule.schema.define({
      name: 'StringRefTemplate2',
      fields: [coreModule.schema.string({id: 'content'})],
    });

    // Schema using string references instead of SchemaPattern.
    const collectionWithStringRefs = coreModule.schema.define({
      name: 'StringRefCollection',
      fields: [
        coreModule.schema.object({
          id: 'hero',
          fields: [
            coreModule.schema.oneOf({
              id: 'type',
              // Using string references to schema names.
              types: ['StringRefTemplate1', 'StringRefTemplate2'],
            }),
          ],
        }),
      ],
    });

    setRegistry({
      '/templates/T1/T1.schema.ts': template1,
      '/templates/T2/T2.schema.ts': template2,
      '/collections/StringRef.schema.ts': collectionWithStringRefs,
    });

    // Verify string references were resolved to actual schemas.
    const objectField = collectionWithStringRefs
      .fields[0] as schema.ObjectField;
    const oneOfField = objectField.fields[0] as schema.OneOfField;
    expect(Array.isArray(oneOfField.types)).toBe(true);
    const types = oneOfField.types as schema.Schema[];
    expect(types).toHaveLength(2);
    expect(types[0]).toBe(template1);
    expect(types[1]).toBe(template2);
  });

  it('should handle exclude option when auto-resolving', async () => {
    const coreModule = await import('./core.js');
    const {setRegistry} = await import('./schema-utils.js');

    const includedTemplate = coreModule.schema.define({
      name: 'IncludedTemplate',
      fields: [coreModule.schema.string({id: 'data'})],
    });

    const excludedTemplate = coreModule.schema.define({
      name: 'ExcludedTemplate',
      fields: [coreModule.schema.string({id: 'data'})],
    });

    const collectionWithExclude = coreModule.schema.define({
      name: 'ExcludeCollection',
      fields: [
        coreModule.schema.array({
          id: 'items',
          of: coreModule.schema.oneOf({
            types: coreModule.schema.glob('/templates/*/*.schema.ts', {
              exclude: ['ExcludedTemplate'],
            }),
          }),
        }),
      ],
    });

    setRegistry({
      '/templates/Included/Included.schema.ts': includedTemplate,
      '/templates/Excluded/Excluded.schema.ts': excludedTemplate,
      '/collections/Exclude.schema.ts': collectionWithExclude,
    });

    const arrayField = collectionWithExclude.fields[0] as schema.ArrayField;
    const oneOfField = arrayField.of as schema.OneOfField;
    const types = oneOfField.types as schema.Schema[];

    // Should only have the included template.
    expect(types).toHaveLength(1);
    expect(types[0].name).toBe('IncludedTemplate');
  });

  it('should handle omitFields option when auto-resolving', async () => {
    const coreModule = await import('./core.js');
    const {setRegistry} = await import('./schema-utils.js');

    const fullTemplate = coreModule.schema.define({
      name: 'FullTemplate',
      fields: [
        coreModule.schema.string({id: 'title'}),
        coreModule.schema.string({id: 'description'}),
        coreModule.schema.string({id: 'metadata'}),
      ],
    });

    const collectionWithOmit = coreModule.schema.define({
      name: 'OmitCollection',
      fields: [
        coreModule.schema.array({
          id: 'items',
          of: coreModule.schema.oneOf({
            types: coreModule.schema.glob('/templates/*/*.schema.ts', {
              omitFields: ['metadata'],
            }),
          }),
        }),
      ],
    });

    setRegistry({
      '/templates/Full/Full.schema.ts': fullTemplate,
      '/collections/Omit.schema.ts': collectionWithOmit,
    });

    const arrayField = collectionWithOmit.fields[0] as schema.ArrayField;
    const oneOfField = arrayField.of as schema.OneOfField;
    const types = oneOfField.types as schema.Schema[];

    expect(types).toHaveLength(1);
    // The resolved schema should have metadata field omitted.
    expect(types[0].fields.map((f) => f.id)).toEqual(['title', 'description']);
  });
});
