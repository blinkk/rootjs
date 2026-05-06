/**
 * Integration test for production bundle compatibility.
 *
 * This test ensures that the schema export works correctly when the package
 * is bundled with code splitting enabled. It verifies that there are no
 * circular dependency issues when schema files import from '@blinkk/root-cms'.
 */

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it, expect} from 'vitest';
import * as schema from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Production Bundle Integration', () => {
  it('should export schema namespace without circular dependency errors', async () => {
    // Import the core module (which is the main entry point)
    const coreModule = await import('./core.js');

    // Verify schema namespace is exported and contains expected functions
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

    // This simulates what user schema files do
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
    // First, import and use core module
    const coreModule = await import('./core.js');
    expect(coreModule.schema).toBeDefined();

    // Then, dynamically import project module (which uses import.meta.glob)
    // This should not cause circular dependency issues
    const projectModule = await import('./project.js');
    expect(projectModule.SCHEMA_MODULES).toBeDefined();
    expect(typeof projectModule.getProjectSchemas).toBe('function');
    expect(typeof projectModule.getCollectionSchema).toBe('function');
  });

  it('should allow schema files to spread existing schemas', async () => {
    const coreModule = await import('./core.js');

    // Create a base schema
    const baseSchema = coreModule.schema.define({
      name: 'BaseSchema',
      fields: [
        coreModule.schema.string({id: 'title'}),
        coreModule.schema.string({id: 'description'}),
      ],
    });

    // Create a new collection that extends the base schema
    // This simulates the BlogPostsSandbox.schema.ts pattern
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

describe('getCollectionSchema', () => {
  it('returns null when schema not found in SCHEMA_MODULES and no rootDir', async () => {
    const projectModule = await import('./project.js');

    // Without rootDir, should return null for non-existent collection.
    const result = await projectModule.getCollectionSchema('NonExistent');
    expect(result).toBeNull();
  });

  it('returns null when schema not found and rootDir has no matching file', async () => {
    const projectModule = await import('./project.js');

    const result = await projectModule.getCollectionSchema('NonExistent', {
      rootDir: '/nonexistent/path',
    });
    expect(result).toBeNull();
  });

  it('loads schema from filesystem when rootDir is provided', async () => {
    const projectModule = await import('./project.js');

    // Use the testdata directory as rootDir.
    const testRootDir = path.resolve(__dirname, 'testdata');
    const result = await projectModule.getCollectionSchema('TestPages', {
      rootDir: testRootDir,
    });

    expect(result).not.toBeNull();
    expect(result!.name).toBe('TestPages');
    expect(result!.id).toBe('TestPages');
    expect(result!.fields).toHaveLength(2);
    expect(result!.fields[0].id).toBe('title');
    expect(result!.fields[0].type).toBe('string');
    expect(result!.fields[1].id).toBe('count');
    expect(result!.fields[1].type).toBe('number');
  });

  it('throws error for invalid collection id', async () => {
    const projectModule = await import('./project.js');

    await expect(
      projectModule.getCollectionSchema('invalid/id')
    ).rejects.toThrow('invalid collection id');
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
