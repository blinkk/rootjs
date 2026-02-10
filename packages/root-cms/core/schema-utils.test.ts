import {expect, test} from 'vitest';

import {
  isSchemaPattern,
  setRegistry,
  getRegistry,
  resolve,
} from './schema-utils.js';
import * as schema from './schema.js';

const TextBlock = schema.define({
  name: 'TextBlock',
  fields: [
    schema.string({
      id: 'text',
      translate: true,
    }),
    schema.boolean({
      id: 'enableMarkdown',
      label: 'enable markdown?',
    }),
  ],
});

const ImageBlock = schema.define({
  name: 'ImageBlock',
  fields: [
    schema.array({
      id: 'image',
      of: schema.object({
        fields: [
          schema.image({
            id: 'image',
          }),
        ],
      }),
    }),
  ],
});

test('isSchemaPattern returns true for SchemaPattern', () => {
  const pattern = schema.glob('/templates/*/*.schema.ts');
  expect(isSchemaPattern(pattern)).toBe(true);
});

test('isSchemaPattern returns false for non-SchemaPattern', () => {
  expect(isSchemaPattern(null)).toBe(false);
  expect(isSchemaPattern(undefined)).toBe(false);
  expect(isSchemaPattern('string')).toBe(false);
  expect(isSchemaPattern({})).toBe(false);
  expect(isSchemaPattern({_schemaPattern: false})).toBe(false);
  expect(isSchemaPattern([TextBlock])).toBe(false);
});

test('setRegistry auto-resolves SchemaPattern in oneOf fields', () => {
  const pagesSchema = schema.define({
    name: 'TestPage',
    fields: [
      schema.array({
        id: 'modules',
        of: schema.oneOf({
          types: schema.glob('/templates/*/*.schema.ts'),
        }),
      }),
    ],
  });

  setRegistry({
    '/templates/Text/Text.schema.ts': TextBlock,
    '/templates/Image/Image.schema.ts': ImageBlock,
    '/collections/Pages.schema.ts': pagesSchema,
  });

  // pagesSchema is mutated in-place — no need to call resolve().
  const arrayField = pagesSchema.fields[0] as schema.ArrayField;
  const oneOfField = arrayField.of as schema.OneOfField;
  expect(Array.isArray(oneOfField.types)).toBe(true);
  const types = oneOfField.types as schema.Schema[];
  expect(types).toHaveLength(2);
  expect(types.map((t) => t.name).sort()).toEqual(['ImageBlock', 'TextBlock']);
});

test('setRegistry auto-resolves with exclude option', () => {
  const pagesSchema = schema.define({
    name: 'TestPage',
    fields: [
      schema.array({
        id: 'modules',
        of: schema.oneOf({
          types: schema.glob('/templates/*/*.schema.ts', {
            exclude: ['TextBlock'],
          }),
        }),
      }),
    ],
  });

  setRegistry({
    '/templates/Text/Text.schema.ts': TextBlock,
    '/templates/Image/Image.schema.ts': ImageBlock,
    '/collections/Pages.schema.ts': pagesSchema,
  });

  const arrayField = pagesSchema.fields[0] as schema.ArrayField;
  const oneOfField = arrayField.of as schema.OneOfField;
  const types = oneOfField.types as schema.Schema[];
  expect(types).toHaveLength(1);
  expect(types[0].name).toBe('ImageBlock');
});

test('setRegistry auto-resolves with omitFields option', () => {
  const pagesSchema = schema.define({
    name: 'TestPage',
    fields: [
      schema.array({
        id: 'modules',
        of: schema.oneOf({
          types: schema.glob('/templates/*/*.schema.ts', {
            omitFields: ['text'],
          }),
        }),
      }),
    ],
  });

  setRegistry({
    '/templates/Text/Text.schema.ts': TextBlock,
    '/collections/Pages.schema.ts': pagesSchema,
  });

  const arrayField = pagesSchema.fields[0] as schema.ArrayField;
  const oneOfField = arrayField.of as schema.OneOfField;
  const types = oneOfField.types as schema.Schema[];
  expect(types).toHaveLength(1);
  expect(types[0].name).toBe('TextBlock');
  // The 'text' field should be omitted, leaving only 'enableMarkdown'.
  expect(types[0].fields.map((f) => f.id)).toEqual(['enableMarkdown']);
});

test('setRegistry auto-resolves string references in oneOf types', () => {
  const pagesSchema = schema.define({
    name: 'TestPage',
    fields: [
      schema.object({
        id: 'hero',
        fields: [
          schema.oneOf({
            id: 'asset',
            types: ['TextBlock', 'ImageBlock'],
          }),
        ],
      }),
    ],
  });

  setRegistry({
    '/templates/Text/Text.schema.ts': TextBlock,
    '/templates/Image/Image.schema.ts': ImageBlock,
    '/collections/Pages.schema.ts': pagesSchema,
  });

  const objectField = pagesSchema.fields[0] as schema.ObjectField;
  const oneOfField = objectField.fields[0] as schema.OneOfField;
  const types = oneOfField.types as schema.Schema[];
  expect(types).toHaveLength(2);
  expect(types[0].name).toBe('TextBlock');
  expect(types[1].name).toBe('ImageBlock');
});

test('setRegistry auto-resolves nested object fields', () => {
  const pagesSchema = schema.define({
    name: 'TestPage',
    fields: [
      schema.object({
        id: 'content',
        fields: [
          schema.array({
            id: 'blocks',
            of: schema.oneOf({
              types: schema.glob('/templates/*/*.schema.ts'),
            }),
          }),
        ],
      }),
    ],
  });

  setRegistry({
    '/templates/Text/Text.schema.ts': TextBlock,
    '/collections/Pages.schema.ts': pagesSchema,
  });

  const objectField = pagesSchema.fields[0] as schema.ObjectField;
  const arrayField = objectField.fields[0] as schema.ArrayField;
  const oneOfField = arrayField.of as schema.OneOfField;
  const types = oneOfField.types as schema.Schema[];
  expect(types).toHaveLength(1);
  expect(types[0].name).toBe('TextBlock');
});

test('setRegistry populates the internal registry', () => {
  // setRegistry accepts SchemaModule-style objects (with .default).
  setRegistry({
    '/templates/Text/Text.schema.ts': {default: TextBlock},
    '/templates/Image/Image.schema.ts': {default: ImageBlock},
  });

  const registry = getRegistry();
  expect(registry).not.toBeNull();
  expect(registry!['/templates/Text/Text.schema.ts']).toBe(TextBlock);
  expect(registry!['/templates/Image/Image.schema.ts']).toBe(ImageBlock);
});

test('setRegistry accepts plain Schema objects', () => {
  setRegistry({
    '/templates/Text/Text.schema.ts': TextBlock,
    '/templates/Image/Image.schema.ts': ImageBlock,
  });

  const registry = getRegistry();
  expect(registry).not.toBeNull();
  expect(registry!['/templates/Text/Text.schema.ts']).toBe(TextBlock);
});

test('resolve still works for dynamically created schemas', () => {
  setRegistry({
    '/templates/Text/Text.schema.ts': {default: TextBlock},
    '/templates/Image/Image.schema.ts': {default: ImageBlock},
  });

  // A schema created *after* setRegistry, not in the registry itself.
  const dynamicSchema = schema.define({
    name: 'DynamicPage',
    fields: [
      schema.array({
        id: 'modules',
        of: schema.oneOf({
          types: schema.glob('/templates/*/*.schema.ts'),
        }),
      }),
    ],
  });

  const resolved = resolve(dynamicSchema);

  // The clone should be resolved.
  const arrayField = resolved.fields[0] as schema.ArrayField;
  const oneOfField = arrayField.of as schema.OneOfField;
  const types = oneOfField.types as schema.Schema[];
  expect(types).toHaveLength(2);
  expect(types.map((t) => t.name).sort()).toEqual(['ImageBlock', 'TextBlock']);

  // The original should NOT be mutated (resolve returns a clone).
  const origArrayField = dynamicSchema.fields[0] as schema.ArrayField;
  const origOneOfField = origArrayField.of as schema.OneOfField;
  expect(isSchemaPattern(origOneOfField.types)).toBe(true);
});

test('resolve leaves schemas without SchemaPatterns unchanged', () => {
  setRegistry({});

  const mySchema = schema.define({
    name: 'SimpleSchema',
    fields: [
      schema.string({id: 'title', translate: true}),
      schema.object({
        id: 'meta',
        fields: [schema.string({id: 'description'})],
      }),
    ],
  });

  const resolved = resolve(mySchema);

  expect(resolved.name).toBe('SimpleSchema');
  expect(resolved.fields).toHaveLength(2);
  expect(resolved.fields[0].type).toBe('string');
});
