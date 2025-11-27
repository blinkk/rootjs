import {describe, it, expect} from 'vitest';
import {z} from 'zod';
import {Schema} from '../core/schema.js';
import {schemaToZod} from '../core/zod.js';

describe('richtext validation', () => {
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
