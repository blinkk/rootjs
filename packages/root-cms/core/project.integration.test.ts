/**
 * Integration test for production bundle compatibility.
 *
 * This test ensures that the schema export works correctly when the package
 * is bundled with code splitting enabled. It verifies that there are no
 * circular dependency issues when schema files import from '@blinkk/root-cms'.
 */

import {describe, it, expect} from 'vitest';

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
