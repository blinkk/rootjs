import {expect, test, vi} from 'vitest';

import * as schema from './schema.js';
import {validateFields} from './validation.js';

test('validates string fields', () => {
  const testSchema = schema.define({
    name: 'TestSchema',
    fields: [schema.string({id: 'title'}), schema.string({id: 'description'})],
  });

  // Valid data.
  expect(
    validateFields({title: 'Hello', description: 'World'}, testSchema)
  ).toMatchInlineSnapshot('[]');

  // Invalid data - number instead of string.
  expect(validateFields({title: 123}, testSchema)).toMatchInlineSnapshot(`
    [
      {
        "expected": "string",
        "message": "Expected string, received number",
        "path": "title",
        "received": "number",
      },
    ]
  `);

  // Partial validation - only validate provided fields.
  expect(validateFields({title: 'Hello'}, testSchema)).toMatchInlineSnapshot(
    '[]'
  );

  // Null value is acceptable.
  expect(validateFields({title: null}, testSchema)).toMatchInlineSnapshot(`
    [
      {
        "expected": "string",
        "message": "Expected string, received null",
        "path": "title",
        "received": "null",
      },
    ]
  `);
});

test('validates number fields', () => {
  const testSchema = schema.define({
    name: 'TestSchema',
    fields: [schema.number({id: 'count'}), schema.number({id: 'price'})],
  });

  // Valid data.
  expect(
    validateFields({count: 42, price: 99.99}, testSchema)
  ).toMatchInlineSnapshot('[]');

  // Invalid data - string instead of number.
  expect(validateFields({count: '42'}, testSchema)).toMatchInlineSnapshot(`
    [
      {
        "expected": "number",
        "message": "Expected number, received string",
        "path": "count",
        "received": "string",
      },
    ]
  `);

  // Invalid data - NaN.
  expect(validateFields({count: NaN}, testSchema)).toMatchInlineSnapshot(`
    [
      {
        "expected": "number",
        "message": "Expected number, received nan",
        "path": "count",
        "received": "nan",
      },
    ]
  `);
});

test('validates boolean fields', () => {
  const testSchema = schema.define({
    name: 'TestSchema',
    fields: [
      schema.boolean({id: 'published'}),
      schema.boolean({id: 'featured'}),
    ],
  });

  // Valid data.
  expect(
    validateFields({published: true, featured: false}, testSchema)
  ).toMatchInlineSnapshot('[]');

  // Invalid data - string instead of boolean.
  expect(validateFields({published: 'true'}, testSchema))
    .toMatchInlineSnapshot(`
      [
        {
          "expected": "boolean",
          "message": "Expected boolean, received string",
          "path": "published",
          "received": "string",
        },
      ]
    `);
});

test('validates date and datetime fields', () => {
  const testSchema = schema.define({
    name: 'TestSchema',
    fields: [
      schema.date({id: 'publishDate'}),
      schema.datetime({id: 'createdAt'}),
    ],
  });

  // Valid data - Firestore timestamp format.
  expect(
    validateFields(
      {
        publishDate: {
          type: 'firestore/timestamp/1.0',
          seconds: 1763658000,
          nanoseconds: 0,
        },
        createdAt: {
          type: 'firestore/timestamp/1.0',
          seconds: 1763675872,
          nanoseconds: 777000000,
        },
      },
      testSchema
    )
  ).toMatchInlineSnapshot('[]');

  // Valid data - minimal (type is optional).
  expect(
    validateFields(
      {
        publishDate: {
          seconds: 1763658000,
          nanoseconds: 0,
        },
      },
      testSchema
    )
  ).toMatchInlineSnapshot('[]');

  // Invalid data - string instead of object.
  expect(validateFields({publishDate: '2023-01-01'}, testSchema))
    .toMatchInlineSnapshot(`
      [
        {
          "expected": "object",
          "message": "Expected object, received string",
          "path": "publishDate",
          "received": "string",
        },
      ]
    `);

  // Invalid data - missing required fields.
  expect(
    validateFields({publishDate: {type: 'firestore/timestamp/1.0'}}, testSchema)
  ).toMatchInlineSnapshot(`
      [
        {
          "expected": "number",
          "message": "Required",
          "path": "publishDate.seconds",
          "received": "undefined",
        },
        {
          "expected": "number",
          "message": "Required",
          "path": "publishDate.nanoseconds",
          "received": "undefined",
        },
      ]
    `);
});

test('validates select fields', () => {
  const testSchema = schema.define({
    name: 'TestSchema',
    fields: [
      schema.select({
        id: 'category',
        options: ['news', 'blog', 'event'],
      }),
    ],
  });

  // Valid data.
  expect(validateFields({category: 'news'}, testSchema)).toMatchInlineSnapshot(
    '[]'
  );

  // Invalid data - number instead of string.
  expect(validateFields({category: 123}, testSchema)).toMatchInlineSnapshot(`
    [
      {
        "expected": "string",
        "message": "Expected string, received number",
        "path": "category",
        "received": "number",
      },
    ]
  `);
});

test('validates multiselect fields', () => {
  const testSchema = schema.define({
    name: 'TestSchema',
    fields: [
      schema.multiselect({
        id: 'tags',
        options: ['typescript', 'javascript', 'python'],
      }),
    ],
  });

  // Valid data.
  expect(
    validateFields({tags: ['typescript', 'javascript']}, testSchema)
  ).toMatchInlineSnapshot('[]');

  // Invalid data - string instead of array.
  expect(validateFields({tags: 'typescript'}, testSchema))
    .toMatchInlineSnapshot(`
      [
        {
          "expected": "array",
          "message": "Expected array, received string",
          "path": "tags",
          "received": "string",
        },
      ]
    `);

  // Invalid data - array with non-string items.
  expect(validateFields({tags: ['typescript', 123]}, testSchema))
    .toMatchInlineSnapshot(`
      [
        {
          "expected": "string",
          "message": "Expected string, received number",
          "path": "tags.1",
          "received": "number",
        },
      ]
    `);
});

test('validates image fields', () => {
  const testSchema = schema.define({
    name: 'TestSchema',
    fields: [schema.image({id: 'thumbnail'}), schema.image({id: 'hero'})],
  });

  // Valid data.
  expect(
    validateFields(
      {thumbnail: {src: '/image.jpg', alt: 'Alt text'}},
      testSchema
    )
  ).toMatchInlineSnapshot('[]');

  // Valid data - without alt.
  expect(
    validateFields({thumbnail: {src: '/image.jpg'}}, testSchema)
  ).toMatchInlineSnapshot('[]');

  // Invalid data - string instead of object.
  expect(validateFields({thumbnail: '/image.jpg'}, testSchema))
    .toMatchInlineSnapshot(`
      [
        {
          "expected": "object",
          "message": "Expected object, received string",
          "path": "thumbnail",
          "received": "string",
        },
      ]
    `);

  // Invalid data - missing src.
  expect(validateFields({thumbnail: {alt: 'Alt text'}}, testSchema))
    .toMatchInlineSnapshot(`
      [
        {
          "expected": "string",
          "message": "Required",
          "path": "thumbnail.src",
          "received": "undefined",
        },
      ]
    `);

  // Invalid data - invalid alt type.
  expect(validateFields({thumbnail: {src: '/image.jpg', alt: 123}}, testSchema))
    .toMatchInlineSnapshot(`
      [
        {
          "expected": "string",
          "message": "Expected string, received number",
          "path": "thumbnail.alt",
          "received": "number",
        },
      ]
    `);
});

test('validates file fields', () => {
  const testSchema = schema.define({
    name: 'TestSchema',
    fields: [schema.file({id: 'document'})],
  });

  // Valid data.
  expect(
    validateFields({document: {src: '/doc.pdf'}}, testSchema)
  ).toMatchInlineSnapshot('[]');

  // Invalid data - array instead of object.
  expect(validateFields({document: ['/doc.pdf']}, testSchema))
    .toMatchInlineSnapshot(`
      [
        {
          "expected": "object",
          "message": "Expected object, received array",
          "path": "document",
          "received": "array",
        },
      ]
    `);
});

test('validates object fields', () => {
  const testSchema = schema.define({
    name: 'TestSchema',
    fields: [
      schema.object({
        id: 'meta',
        fields: [
          schema.string({id: 'title'}),
          schema.string({id: 'description'}),
        ],
      }),
    ],
  });

  // Valid data.
  expect(
    validateFields({meta: {title: 'Hello', description: 'World'}}, testSchema)
  ).toMatchInlineSnapshot('[]');

  // Invalid data - string instead of object.
  expect(validateFields({meta: 'not an object'}, testSchema))
    .toMatchInlineSnapshot(`
      [
        {
          "expected": "object",
          "message": "Expected object, received string",
          "path": "meta",
          "received": "string",
        },
      ]
    `);

  // Invalid data - nested field has wrong type.
  expect(validateFields({meta: {title: 123}}, testSchema))
    .toMatchInlineSnapshot(`
      [
        {
          "expected": "string",
          "message": "Expected string, received number",
          "path": "meta.title",
          "received": "number",
        },
      ]
    `);

  // Partial validation - only validate provided nested fields.
  expect(
    validateFields({meta: {title: 'Hello'}}, testSchema)
  ).toMatchInlineSnapshot('[]');
});

test('validates array fields with object items', () => {
  const testSchema = schema.define({
    name: 'TestSchema',
    fields: [
      schema.array({
        id: 'items',
        of: schema.object({
          fields: [
            schema.string({id: 'name'}),
            schema.number({id: 'quantity'}),
          ],
        }),
      }),
    ],
  });

  // Valid data.
  expect(
    validateFields(
      {
        items: [
          {name: 'Apple', quantity: 5},
          {name: 'Orange', quantity: 3},
        ],
      },
      testSchema
    )
  ).toMatchInlineSnapshot('[]');

  // Invalid data - string instead of array.
  expect(validateFields({items: 'not an array'}, testSchema))
    .toMatchInlineSnapshot(`
      [
        {
          "expected": "array",
          "message": "Expected array, received string",
          "path": "items",
          "received": "string",
        },
      ]
    `);

  // Invalid data - array item has wrong type.
  expect(
    validateFields({items: [{name: 'Apple', quantity: 'five'}]}, testSchema)
  ).toMatchInlineSnapshot(`
    [
      {
        "expected": "number",
        "message": "Expected number, received string",
        "path": "items.0.quantity",
        "received": "string",
      },
    ]
  `);

  // Multiple errors in array.
  expect(
    validateFields(
      {
        items: [
          {name: 123, quantity: 'five'},
          {name: 'Orange', quantity: 3},
        ],
      },
      testSchema
    )
  ).toMatchInlineSnapshot(`
    [
      {
        "expected": "string",
        "message": "Expected string, received number",
        "path": "items.0.name",
        "received": "number",
      },
      {
        "expected": "number",
        "message": "Expected number, received string",
        "path": "items.0.quantity",
        "received": "string",
      },
    ]
  `);
});

test('validates array fields with image items', () => {
  const testSchema = schema.define({
    name: 'TestSchema',
    fields: [
      schema.array({
        id: 'gallery',
        of: schema.image({}),
      }),
    ],
  });

  // Valid data.
  expect(
    validateFields(
      {gallery: [{src: '/img1.jpg'}, {src: '/img2.jpg', alt: 'Image 2'}]},
      testSchema
    )
  ).toMatchInlineSnapshot('[]');

  // Invalid data - missing src in array item.
  expect(validateFields({gallery: [{alt: 'Image'}]}, testSchema))
    .toMatchInlineSnapshot(`
      [
        {
          "expected": "string",
          "message": "Required",
          "path": "gallery.0.src",
          "received": "undefined",
        },
      ]
    `);
});

test('validates oneOf fields', () => {
  const ImageBlock = schema.define({
    name: 'ImageBlock',
    fields: [schema.image({id: 'image'})],
  });

  const TextBlock = schema.define({
    name: 'TextBlock',
    fields: [schema.string({id: 'text'})],
  });

  const testSchema = schema.define({
    name: 'TestSchema',
    fields: [
      schema.oneOf({
        id: 'content',
        types: [ImageBlock, TextBlock],
      }),
    ],
  });

  // Valid data - ImageBlock.
  expect(
    validateFields(
      {content: {_type: 'ImageBlock', image: {src: '/img.jpg'}}},
      testSchema
    )
  ).toMatchInlineSnapshot('[]');

  // Valid data - TextBlock.
  expect(
    validateFields({content: {_type: 'TextBlock', text: 'Hello'}}, testSchema)
  ).toMatchInlineSnapshot('[]');

  // Invalid data - missing _type.
  expect(validateFields({content: {text: 'Hello'}}, testSchema))
    .toMatchInlineSnapshot(`
      [
        {
          "expected": "valid discriminator value",
          "message": "Invalid discriminator value. Expected 'ImageBlock' | 'TextBlock'",
          "path": "content._type",
          "received": undefined,
        },
      ]
    `);

  // Invalid data - unknown type.
  expect(
    validateFields(
      {content: {_type: 'UnknownBlock', text: 'Hello'}},
      testSchema
    )
  ).toMatchInlineSnapshot(`
    [
      {
        "expected": "valid discriminator value",
        "message": "Invalid discriminator value. Expected 'ImageBlock' | 'TextBlock'",
        "path": "content._type",
        "received": "UnknownBlock",
      },
    ]
  `);

  // Invalid data - wrong field type for the selected type.
  expect(validateFields({content: {_type: 'TextBlock', text: 123}}, testSchema))
    .toMatchInlineSnapshot(`
      [
        {
          "expected": "string",
          "message": "Expected string, received number",
          "path": "content.text",
          "received": "number",
        },
      ]
    `);

  // Invalid data - string instead of object.
  expect(validateFields({content: 'ImageBlock'}, testSchema))
    .toMatchInlineSnapshot(`
      [
        {
          "expected": "object",
          "message": "Expected object, received string",
          "path": "content",
          "received": "string",
        },
      ]
    `);
});

test('validates richtext fields', () => {
  const testSchema = schema.define({
    name: 'TestSchema',
    fields: [schema.richtext({id: 'body'})],
  });

  // Valid data.
  expect(
    validateFields(
      {
        body: {
          version: '2.31.0',
          time: {
            type: 'firestore/timestamp/1.0',
            seconds: 1763675872,
            nanoseconds: 777000000,
          },
          blocks: [{type: 'paragraph', data: {text: 'Hello'}}],
        },
      },
      testSchema
    )
  ).toMatchInlineSnapshot('[]');

  // Valid data - minimal (only blocks required).
  expect(
    validateFields(
      {
        body: {
          blocks: [{type: 'paragraph', data: {text: 'Hello'}}],
        },
      },
      testSchema
    )
  ).toMatchInlineSnapshot('[]');

  // Invalid data - string instead of object.
  expect(validateFields({body: 'Hello world'}, testSchema))
    .toMatchInlineSnapshot(`
      [
        {
          "expected": "object",
          "message": "Expected object, received string",
          "path": "body",
          "received": "string",
        },
      ]
    `);

  // Invalid data - missing blocks.
  expect(validateFields({body: {version: '2.31.0'}}, testSchema))
    .toMatchInlineSnapshot(`
    [
      {
        "expected": "array",
        "message": "Required",
        "path": "body.blocks",
        "received": "undefined",
      },
    ]
  `);

  // Invalid data - blocks missing required type field.
  expect(
    validateFields({body: {blocks: [{data: {text: 'Hello'}}]}}, testSchema)
  ).toMatchInlineSnapshot(`
    [
      {
        "expected": "string",
        "message": "Required",
        "path": "body.blocks.0.type",
        "received": "undefined",
      },
    ]
  `);
});

test('validates reference fields', () => {
  const testSchema = schema.define({
    name: 'TestSchema',
    fields: [schema.reference({id: 'author'})],
  });

  // Valid data.
  expect(
    validateFields(
      {
        author: {
          id: 'Authors/john-doe',
          collection: 'Authors',
          slug: 'john-doe',
        },
      },
      testSchema
    )
  ).toMatchInlineSnapshot('[]');

  // Invalid data - string instead of object.
  expect(validateFields({author: 'Authors/john-doe'}, testSchema))
    .toMatchInlineSnapshot(`
    [
      {
        "expected": "object",
        "message": "Expected object, received string",
        "path": "author",
        "received": "string",
      },
    ]
  `);

  // Invalid data - missing required fields.
  expect(validateFields({author: {id: 'Authors/john-doe'}}, testSchema))
    .toMatchInlineSnapshot(`
    [
      {
        "expected": "string",
        "message": "Required",
        "path": "author.collection",
        "received": "undefined",
      },
      {
        "expected": "string",
        "message": "Required",
        "path": "author.slug",
        "received": "undefined",
      },
    ]
  `);
});

test('validates references fields', () => {
  const testSchema = schema.define({
    name: 'TestSchema',
    fields: [schema.references({id: 'relatedPosts'})],
  });

  // Valid data.
  expect(
    validateFields(
      {
        relatedPosts: [
          {id: 'Posts/post-1', collection: 'Posts', slug: 'post-1'},
          {id: 'Posts/post-2', collection: 'Posts', slug: 'post-2'},
        ],
      },
      testSchema
    )
  ).toMatchInlineSnapshot('[]');

  // Invalid data - string instead of array.
  expect(validateFields({relatedPosts: 'Posts/post-1'}, testSchema))
    .toMatchInlineSnapshot(`
    [
      {
        "expected": "array",
        "message": "Expected array, received string",
        "path": "relatedPosts",
        "received": "string",
      },
    ]
  `);

  // Invalid data - array with non-object items.
  expect(
    validateFields({relatedPosts: ['Posts/post-1', 'Posts/post-2']}, testSchema)
  ).toMatchInlineSnapshot(`
    [
      {
        "expected": "object",
        "message": "Expected object, received string",
        "path": "relatedPosts.0",
        "received": "string",
      },
      {
        "expected": "object",
        "message": "Expected object, received string",
        "path": "relatedPosts.1",
        "received": "string",
      },
    ]
  `);
});

test('validates complex nested structures', () => {
  const testSchema = schema.define({
    name: 'BlogPost',
    fields: [
      schema.object({
        id: 'meta',
        fields: [schema.string({id: 'title'}), schema.image({id: 'image'})],
      }),
      schema.array({
        id: 'content',
        of: schema.oneOf({
          types: [
            schema.define({
              name: 'TextBlock',
              fields: [schema.string({id: 'text'})],
            }),
            schema.define({
              name: 'ImageBlock',
              fields: [schema.image({id: 'image'})],
            }),
          ],
        }),
      }),
    ],
  });

  // Valid data.
  expect(
    validateFields(
      {
        meta: {title: 'Hello', image: {src: '/img.jpg'}},
        content: [
          {_type: 'TextBlock', text: 'Hello'},
          {_type: 'ImageBlock', image: {src: '/img.jpg'}},
        ],
      },
      testSchema
    )
  ).toMatchInlineSnapshot('[]');

  // Invalid nested fields.
  expect(
    validateFields(
      {
        meta: {title: 123, image: '/img.jpg'},
        content: [
          {_type: 'TextBlock', text: 123},
          {_type: 'ImageBlock', image: '/img.jpg'},
        ],
      },
      testSchema
    )
  ).toMatchInlineSnapshot(`
    [
      {
        "expected": "string",
        "message": "Expected string, received number",
        "path": "meta.title",
        "received": "number",
      },
      {
        "expected": "object",
        "message": "Expected object, received string",
        "path": "meta.image",
        "received": "string",
      },
      {
        "expected": "string",
        "message": "Expected string, received number",
        "path": "content.0.text",
        "received": "number",
      },
      {
        "expected": "object",
        "message": "Expected object, received string",
        "path": "content.1.image",
        "received": "string",
      },
    ]
  `);
});

test('validates nested oneOf fields', () => {
  const ButtonBlock = schema.define({
    name: 'ButtonBlock',
    fields: [schema.string({id: 'label'}), schema.string({id: 'url'})],
  });

  const VideoBlock = schema.define({
    name: 'VideoBlock',
    fields: [schema.string({id: 'videoId'})],
  });

  const Section = schema.define({
    name: 'Section',
    fields: [
      schema.array({
        id: 'items',
        of: schema.oneOf({
          types: [ButtonBlock, VideoBlock],
        }),
      }),
    ],
  });

  const testSchema = schema.define({
    name: 'Page',
    fields: [
      schema.array({
        id: 'content',
        of: schema.oneOf({types: [Section]}),
      }),
    ],
  });

  // Valid deep structure.
  expect(
    validateFields(
      {
        content: [
          {
            _type: 'Section',
            items: [
              {_type: 'ButtonBlock', label: 'Click me', url: '/'},
              {_type: 'VideoBlock', videoId: '123'},
            ],
          },
        ],
      },
      testSchema
    )
  ).toMatchInlineSnapshot('[]');

  // Invalid deep structure - wrong discriminator.
  expect(
    validateFields(
      {
        content: [
          {
            _type: 'Section',
            items: [{_type: 'InvalidBlock', label: 'Click me', url: '/'}],
          },
        ],
      },
      testSchema
    )
  ).toMatchInlineSnapshot(`
    [
      {
        "expected": "valid discriminator value",
        "message": "Invalid discriminator value. Expected 'ButtonBlock' | 'VideoBlock'",
        "path": "content.0.items.0._type",
        "received": "InvalidBlock",
      },
    ]
  `);
});

test('fallback validation for unknown types', () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  const testSchema = schema.define({
    name: 'TestSchema',
    fields: [
      // @ts-expect-error - explicitly testing unknown type
      {id: 'raw', type: 'unknown-type'},
    ],
  });

  // Since we don't know the type, we accept anything.
  expect(validateFields({raw: 'anything'}, testSchema)).toMatchInlineSnapshot(
    '[]'
  );
  expect(warnSpy).toHaveBeenCalledWith('Unknown field type: unknown-type');

  warnSpy.mockRestore();
});

test('partial validation', () => {
  const testSchema = schema.define({
    name: 'TestSchema',
    fields: [schema.string({id: 'title'}), schema.string({id: 'description'})],
  });

  // Partial data is valid.
  expect(validateFields({title: 'Hello'}, testSchema)).toMatchInlineSnapshot(
    '[]'
  );
  expect(
    validateFields({description: 'World'}, testSchema)
  ).toMatchInlineSnapshot('[]');
});

test('partial validation ignores missing fields', () => {
  const testSchema = schema.define({
    name: 'TestSchema',
    fields: [schema.string({id: 'title'}), schema.number({id: 'count'})],
  });

  // Validate errors only for present fields.
  expect(validateFields({title: 'Hello', count: 'not-a-number'}, testSchema))
    .toMatchInlineSnapshot(`
      [
        {
          "expected": "number",
          "message": "Expected number, received string",
          "path": "count",
          "received": "string",
        },
      ]
    `);
});
