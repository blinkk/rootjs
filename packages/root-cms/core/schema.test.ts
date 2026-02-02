import {expect, test, vi} from 'vitest';

import * as schema from './schema.js';

const ResponsiveImage = schema.define({
  name: 'ResponsiveImage',
  fields: [
    schema.image({
      id: 'image',
    }),
    schema.select({
      id: 'breakpoint',
      options: {
        values: [
          {label: 'mobile only', value: 'mobile'},
          {label: 'mobile and tablet', value: 'tablet-lt'},
          {label: 'tablet only', value: 'tablet'},
          {label: 'tablet and desktop', value: 'tablet-gt'},
          {label: 'desktop only', value: 'laptop-gt'},
        ],
      },
    }),
  ],
});

const ImageEmbed = schema.define({
  name: 'ImageEmbed',
  fields: [
    schema.array({
      id: 'image',
      of: schema.object({fields: ResponsiveImage.fields}),
    }),
  ],
});

const YouTubeEmbed = schema.define({
  name: 'YouTubeEmbed',
  fields: [
    schema.string({
      id: 'youtubeUrl',
      label: 'youtube url',
      help: 'input either the full youtube url or just the video id.',
    }),
    schema.image({
      id: 'thumbnail',
      help: 'optional. if not provided, the youtube thumbnail will be used.',
    }),
  ],
});

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

const ImageBlock = {...ImageEmbed, name: 'ImageBlock'};

const ImageGalleryBlock = schema.define({
  name: 'ImageGalleryBlock',
  fields: [
    schema.array({
      id: 'images',
      of: schema.image({}),
    }),
  ],
});

const YouTubeBlock = {...YouTubeEmbed, name: 'YouTubeBlock'};

test('define schema', () => {
  expect(
    schema.define({
      name: 'TestBlogSchema',
      fields: [
        // doc.meta
        schema.object({
          id: 'meta',
          fields: [
            schema.string({
              id: 'title',
              label: 'page title',
              translate: true,
            }),
            schema.string({
              id: 'description',
              label: 'meta description',
              translate: true,
            }),
            schema.image({
              id: 'image',
              label: 'meta image',
              help: 'for social shares',
            }),
            schema.select({
              id: 'category',
              label: 'category',
              help: 'select a category for the blog post.',
              options: {
                values: [
                  {label: 'engineering', value: 'engineering'},
                  {label: 'event', value: 'event'},
                  {label: 'update', value: 'update'},
                ],
              },
            }),
            schema.multiselect({
              id: 'tags',
              label: 'tags',
              help: 'select one or more tags for the blog post.',
              options: {
                values: [
                  {label: 'engineering', value: 'engineering'},
                  {label: 'event', value: 'event'},
                  {label: 'update', value: 'update'},
                ],
              },
            }),
          ],
        }),

        // doc.hero
        schema.object({
          id: 'hero',
          fields: [
            schema.oneOf({
              id: 'asset',
              types: [
                // Shared/reusable schema types.
                ImageEmbed,
                YouTubeEmbed,
                // Inline schema definition.
                schema.define({name: 'NoHeroAsset', fields: []}),
              ],
            }),
          ],
        }),

        // doc.content
        schema.object({
          id: 'content',
          fields: [
            schema.array({
              id: 'blocks',
              of: schema.oneOf({
                types: [TextBlock, ImageBlock, ImageGalleryBlock, YouTubeBlock],
              }),
            }),
          ],
        }),
      ],
    })
  ).toMatchInlineSnapshot(`
    {
      "fields": [
        {
          "fields": [
            {
              "id": "title",
              "label": "page title",
              "translate": true,
              "type": "string",
            },
            {
              "id": "description",
              "label": "meta description",
              "translate": true,
              "type": "string",
            },
            {
              "help": "for social shares",
              "id": "image",
              "label": "meta image",
              "type": "image",
            },
            {
              "help": "select a category for the blog post.",
              "id": "category",
              "label": "category",
              "options": {
                "values": [
                  {
                    "label": "engineering",
                    "value": "engineering",
                  },
                  {
                    "label": "event",
                    "value": "event",
                  },
                  {
                    "label": "update",
                    "value": "update",
                  },
                ],
              },
              "type": "select",
            },
            {
              "help": "select one or more tags for the blog post.",
              "id": "tags",
              "label": "tags",
              "options": {
                "values": [
                  {
                    "label": "engineering",
                    "value": "engineering",
                  },
                  {
                    "label": "event",
                    "value": "event",
                  },
                  {
                    "label": "update",
                    "value": "update",
                  },
                ],
              },
              "type": "multiselect",
            },
          ],
          "id": "meta",
          "type": "object",
        },
        {
          "fields": [
            {
              "id": "asset",
              "type": "oneof",
              "types": [
                {
                  "fields": [
                    {
                      "id": "image",
                      "of": {
                        "fields": [
                          {
                            "id": "image",
                            "type": "image",
                          },
                          {
                            "id": "breakpoint",
                            "options": {
                              "values": [
                                {
                                  "label": "mobile only",
                                  "value": "mobile",
                                },
                                {
                                  "label": "mobile and tablet",
                                  "value": "tablet-lt",
                                },
                                {
                                  "label": "tablet only",
                                  "value": "tablet",
                                },
                                {
                                  "label": "tablet and desktop",
                                  "value": "tablet-gt",
                                },
                                {
                                  "label": "desktop only",
                                  "value": "laptop-gt",
                                },
                              ],
                            },
                            "type": "select",
                          },
                        ],
                        "type": "object",
                      },
                      "type": "array",
                    },
                  ],
                  "name": "ImageEmbed",
                },
                {
                  "fields": [
                    {
                      "help": "input either the full youtube url or just the video id.",
                      "id": "youtubeUrl",
                      "label": "youtube url",
                      "type": "string",
                    },
                    {
                      "help": "optional. if not provided, the youtube thumbnail will be used.",
                      "id": "thumbnail",
                      "type": "image",
                    },
                  ],
                  "name": "YouTubeEmbed",
                },
                {
                  "fields": [],
                  "name": "NoHeroAsset",
                },
              ],
            },
          ],
          "id": "hero",
          "type": "object",
        },
        {
          "fields": [
            {
              "id": "blocks",
              "of": {
                "type": "oneof",
                "types": [
                  {
                    "fields": [
                      {
                        "id": "text",
                        "translate": true,
                        "type": "string",
                      },
                      {
                        "id": "enableMarkdown",
                        "label": "enable markdown?",
                        "type": "boolean",
                      },
                    ],
                    "name": "TextBlock",
                  },
                  {
                    "fields": [
                      {
                        "id": "image",
                        "of": {
                          "fields": [
                            {
                              "id": "image",
                              "type": "image",
                            },
                            {
                              "id": "breakpoint",
                              "options": {
                                "values": [
                                  {
                                    "label": "mobile only",
                                    "value": "mobile",
                                  },
                                  {
                                    "label": "mobile and tablet",
                                    "value": "tablet-lt",
                                  },
                                  {
                                    "label": "tablet only",
                                    "value": "tablet",
                                  },
                                  {
                                    "label": "tablet and desktop",
                                    "value": "tablet-gt",
                                  },
                                  {
                                    "label": "desktop only",
                                    "value": "laptop-gt",
                                  },
                                ],
                              },
                              "type": "select",
                            },
                          ],
                          "type": "object",
                        },
                        "type": "array",
                      },
                    ],
                    "name": "ImageBlock",
                  },
                  {
                    "fields": [
                      {
                        "id": "images",
                        "of": {
                          "type": "image",
                        },
                        "type": "array",
                      },
                    ],
                    "name": "ImageGalleryBlock",
                  },
                  {
                    "fields": [
                      {
                        "help": "input either the full youtube url or just the video id.",
                        "id": "youtubeUrl",
                        "label": "youtube url",
                        "type": "string",
                      },
                      {
                        "help": "optional. if not provided, the youtube thumbnail will be used.",
                        "id": "thumbnail",
                        "type": "image",
                      },
                    ],
                    "name": "YouTubeBlock",
                  },
                ],
              },
              "type": "array",
            },
          ],
          "id": "content",
          "type": "object",
        },
      ],
      "name": "TestBlogSchema",
    }
  `);
});

test('validate timezone', () => {
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  const datetimeField = schema.datetime({
    id: 'datetime',
    timezone: 'Invalid/Timezone',
  });
  expect(datetimeField.timezone).toBeUndefined();
  expect(consoleWarnSpy).toHaveBeenCalledTimes(1);

  consoleWarnSpy.mockRestore();
});

test('allSchemas creates a SchemaPattern', () => {
  const pattern = schema.allSchemas('/templates/*/*.schema.ts');

  expect(pattern._schemaPattern).toBe(true);
  expect(pattern.pattern).toBe('/templates/*/*.schema.ts');
  expect(pattern.exclude).toBeUndefined();
  expect(pattern.omitFields).toBeUndefined();
});

test('allSchemas with options', () => {
  const pattern = schema.allSchemas('/blocks/*/*.schema.ts', {
    exclude: ['DeprecatedBlock', 'InternalBlock'],
    omitFields: ['id', 'internalNotes'],
  });

  expect(pattern._schemaPattern).toBe(true);
  expect(pattern.pattern).toBe('/blocks/*/*.schema.ts');
  expect(pattern.exclude).toEqual(['DeprecatedBlock', 'InternalBlock']);
  expect(pattern.omitFields).toEqual(['id', 'internalNotes']);
});

test('allSchemas returns a valid SchemaPattern object', () => {
  const pattern = schema.allSchemas('/templates/*/*.schema.ts');

  expect(pattern._schemaPattern).toBe(true);
  expect(pattern.pattern).toBe('/templates/*/*.schema.ts');
});

test('oneOf accepts SchemaPattern as types', () => {
  const field = schema.oneOf({
    id: 'modules',
    types: schema.allSchemas('/templates/*/*.schema.ts'),
  });

  expect(field.type).toBe('oneof');
  expect(field.id).toBe('modules');
  const pattern = field.types as schema.SchemaPattern;
  expect(pattern._schemaPattern).toBe(true);
});

test('oneOf with allSchemas can be used in collection definition', () => {
  const collection = schema.collection({
    name: 'Pages',
    url: '/[...slug]',
    fields: [
      schema.array({
        id: 'modules',
        label: 'Modules',
        of: schema.oneOf({
          types: schema.allSchemas('/templates/*/*.schema.ts'),
        }),
      }),
    ],
  });

  expect(collection.name).toBe('Pages');
  expect(collection.fields).toHaveLength(1);
  const arrayField = collection.fields[0] as schema.ArrayField;
  expect(arrayField.type).toBe('array');
  const oneOfField = arrayField.of as schema.OneOfField;
  expect(oneOfField.type).toBe('oneof');
  const pattern = oneOfField.types as schema.SchemaPattern;
  expect(pattern._schemaPattern).toBe(true);
});

test('allSchemas can be used for self-referencing container schemas', () => {
  // This simulates a Container schema that can contain other Containers.
  const containerSchema = schema.define({
    name: 'Container',
    description: 'A container that can hold nested templates.',
    fields: [
      schema.string({id: 'id', label: 'ID'}),
      schema.array({
        id: 'children',
        label: 'Children',
        of: schema.oneOf({
          // Container references all templates including itself via pattern.
          types: schema.allSchemas('/templates/*/*.schema.ts'),
        }),
      }),
    ],
  });

  expect(containerSchema.name).toBe('Container');
  expect(containerSchema.fields).toHaveLength(2);
  const arrayField = containerSchema.fields[1] as schema.ArrayField;
  const oneOfField = arrayField.of as schema.OneOfField;
  const pattern = oneOfField.types as schema.SchemaPattern;
  expect(pattern._schemaPattern).toBe(true);
  expect(pattern.pattern).toBe('/templates/*/*.schema.ts');
});
