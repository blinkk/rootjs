import {describe, it, expect} from 'vitest';
import {z} from 'zod';
import {Schema} from '../core/schema.js';
import {schemaToZod} from '../core/zod.js';

describe('reproduction', () => {
  it('validates the reported invalid structure', () => {
    const schema: Schema = {
      name: 'Page',
      fields: [
        {
          type: 'array',
          id: 'modules',
          of: {
            type: 'oneof',
            types: ['TemplateHeadline', 'Spacer', '50x50'],
          },
        },
      ],
    };

    const zodSchema = schemaToZod(schema);

    const invalidData = {
      modules: {
        _array: ['t3Yrrb', 'cR9Yur', 'MjyCsw'],
        t3Yrrb: {
          type: 'TemplateHeadline',
          headline: 'Lorem ipsum',
        },
        MjyCsw: {
          type: '50x50',
          right: {
            headline: 'Right Column',
            body: 'For placement only. This content will be replaced.',
          },
          left: {
            headline: 'Left Column',
            body: 'For placement only. This content will be replaced.',
          },
        },
        cR9Yur: {
          height: 80,
          type: 'Spacer',
        },
      },
    };

    const result = zodSchema.safeParse(invalidData);
    // This SHOULD fail because modules is an object, but schema expects array.
    expect(result.success).toBe(false);

    if (!result.success) {
      // Check specific errors
      // Expecting error at "modules": Expected array, received object
      const issue = result.error.issues.find((i) => i.path[0] === 'modules');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('Expected array');
    }
  });

  it('validates oneof with wrong type field', () => {
    const schema: Schema = {
      name: 'Page',
      fields: [
        {
          type: 'array',
          id: 'modules',
          of: {
            type: 'oneof',
            types: ['TemplateHeadline'],
          },
        },
      ],
    };

    const zodSchema = schemaToZod(schema);

    const invalidData = {
      modules: [
        {
          type: 'TemplateHeadline', // Should be _type
          headline: 'Lorem ipsum',
        },
      ],
    };

    const result = zodSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      // Expecting error at "modules.0._type": Required
      const issue = result.error.issues.find((i) => i.path.includes('_type'));
      expect(issue).toBeDefined();
    }
  });

  it('validates oneof fields strictly with getSchema', () => {
    const subSchema: Schema = {
      name: 'TemplateHeadline',
      fields: [{type: 'string', id: 'headline'}],
    };
    const schema: Schema = {
      name: 'Page',
      fields: [
        {
          type: 'oneof',
          id: 'module',
          types: ['TemplateHeadline'],
        },
      ],
    };

    const getSchema = (id: string) =>
      id === 'TemplateHeadline' ? subSchema : undefined;
    const zodSchema = schemaToZod(schema, getSchema);

    // Valid
    expect(
      zodSchema.safeParse({
        module: {_type: 'TemplateHeadline', headline: 'foo'},
      }).success
    ).toBe(true);

    // Invalid field type
    const invalidResult = zodSchema.safeParse({
      module: {_type: 'TemplateHeadline', headline: 123},
    });
    expect(invalidResult.success).toBe(false);
    if (!invalidResult.success) {
      const issue = invalidResult.error.issues.find((i) =>
        i.path.includes('headline')
      );
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('Expected string');
    }
  });
});
