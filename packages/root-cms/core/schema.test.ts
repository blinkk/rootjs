import {expect, test} from 'vitest';

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

test('uid field', () => {
  expect(
    schema.uid({
      id: 'testUid',
      label: 'Test UID',
      tag: 'element',
    })
  ).toMatchInlineSnapshot(`
    {
      "id": "testUid",
      "label": "Test UID",
      "tag": "element",
      "type": "uid",
    }
  `);
});

test('uid field with all options', () => {
  expect(
    schema.uid({
      id: 'pageUid',
      label: 'Page Element UID',
      help: 'Unique identifier for page elements',
      tag: 'page-element',
      buttonLabel: 'Generate ID',
      default: 'default-uid-123',
    })
  ).toMatchInlineSnapshot(`
    {
      "buttonLabel": "Generate ID",
      "default": "default-uid-123",
      "help": "Unique identifier for page elements",
      "id": "pageUid",
      "label": "Page Element UID",
      "tag": "page-element",
      "type": "uid",
    }
  `);
});
