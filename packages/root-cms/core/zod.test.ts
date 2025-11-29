import {describe, it, expect} from 'vitest';
import {Schema, Field} from './schema.js';
import {schemaToZod, fieldToZod} from './zod.js';

describe('zod conversion', () => {
  describe('fieldToZod', () => {
    it('converts string field', () => {
      const field: Field = {type: 'string', id: 'foo'};
      const zodType = fieldToZod(field);
      expect(zodType.safeParse('bar').success).toBe(true);
      expect(zodType.safeParse(123).success).toBe(false);
    });

    it('converts number field', () => {
      const field: Field = {type: 'number', id: 'foo'};
      const zodType = fieldToZod(field);
      expect(zodType.safeParse(123).success).toBe(true);
      expect(zodType.safeParse('bar').success).toBe(false);
    });

    it('converts boolean field', () => {
      const field: Field = {type: 'boolean', id: 'foo'};
      const zodType = fieldToZod(field);
      expect(zodType.safeParse(true).success).toBe(true);
      expect(zodType.safeParse('bar').success).toBe(false);
    });

    it('converts image field', () => {
      const field: Field = {type: 'image', id: 'foo'};
      const zodType = fieldToZod(field);
      expect(zodType.safeParse({src: 'foo.jpg'}).success).toBe(true);
      expect(zodType.safeParse({src: 123}).success).toBe(false);
      expect(zodType.safeParse('foo').success).toBe(false);
    });

    it('converts object field', () => {
      const field: Field = {
        type: 'object',
        id: 'foo',
        fields: [{type: 'string', id: 'bar'}],
      };
      const zodType = fieldToZod(field);
      expect(zodType.safeParse({bar: 'baz'}).success).toBe(true);
      expect(zodType.safeParse({bar: 123}).success).toBe(false);
    });

    it('converts array field', () => {
      const field: Field = {
        type: 'array',
        id: 'foo',
        of: {
          type: 'object',
          fields: [{type: 'string', id: 'val'}],
        },
      };
      const zodType = fieldToZod(field);
      expect(zodType.safeParse([{val: 'a'}, {val: 'b'}]).success).toBe(true);
      expect(zodType.safeParse([{val: 'a'}, {val: 123}]).success).toBe(false);
    });
  });

  describe('schemaToZod', () => {
    it('converts a full schema', () => {
      const schema: Schema = {
        name: 'MyDoc',
        fields: [
          {type: 'string', id: 'title'},
          {type: 'number', id: 'count'},
        ],
      };

      const zodSchema = schemaToZod(schema);

      const validDoc = {
        title: 'Hello',
        count: 123,
      };
      expect(zodSchema.safeParse(validDoc).success).toBe(true);

      const invalidDoc = {
        title: 123,
        count: 'many',
      };
      const result = zodSchema.safeParse(invalidDoc);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBe(2);
      }
    });

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
      // The data is unmarshalled later.
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

    it('validates richtext structure', () => {
      const schema: Schema = {
        name: 'Page',
        fields: [
          {
            type: 'richtext',
            id: 'content',
          },
        ],
      };

      const zodSchema = schemaToZod(schema);

      // Valid EditorJS data
      const validData = {
        content: {
          time: 1630000000000,
          blocks: [
            {
              type: 'paragraph',
              data: {
                text: 'Hello world',
              },
            },
          ],
          version: '2.22.2',
        },
      };

      // Currently this might fail if we don't have passthrough()
      const result = zodSchema.safeParse(validData);
      if (!result.success) {
        console.log(
          'Validation failed:',
          JSON.stringify(result.error.issues, null, 2)
        );
      }
      expect(result.success).toBe(true);

      // Invalid data (string)
      const invalidDataString = {
        content: 'Hello world',
      };
      const resultString = zodSchema.safeParse(invalidDataString);
      expect(resultString.success).toBe(false);

      // Invalid data (array directly)
      const invalidDataArray = {
        content: [
          {
            type: 'paragraph',
            data: {
              text: 'Hello world',
            },
          },
        ],
      };
      const resultArray = zodSchema.safeParse(invalidDataArray);
      expect(resultArray.success).toBe(false);
    });
  });
});
