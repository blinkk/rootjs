import {schema} from '@blinkk/root-cms';

export default schema.collection({
  name: 'Guides',
  description:
    'Non-technical guides to Root.js features, written for decision makers.',
  url: '/guides/[...slug]',
  // Editors set the order of the guides on the `/guides/` index by dragging
  // docs in the collection's "Custom order" view.
  customSorting: true,
  preview: {
    title: 'meta.title',
    image: 'meta.image',
    defaultImage: {
      src: 'https://lh3.googleusercontent.com/c2ECbvhJtxf3xbPIjaXCSpmvAsJkkhzJwG98T9RPvWy4s30jZKClom8pvWTnupRYOnyI3qGhNXPOwqoN6sqljkDO62LIKRtR988',
    },
  },

  fields: [
    schema.object({
      id: 'meta',
      label: 'Meta',
      fields: [
        schema.string({
          id: 'title',
          label: 'Title',
          translate: true,
        }),
        schema.string({
          id: 'description',
          label: 'Description',
          help: 'Description for SEO, social shares and the guides index.',
          translate: true,
          variant: 'textarea',
        }),
        schema.image({
          id: 'image',
          label: 'Image',
          help: 'Meta image for social shares and the guides index card.',
        }),
        schema.reference({
          id: 'nextGuide',
          label: 'Next guide',
          help: 'Suggested guide to read next.',
          collections: ['Guides'],
        }),
      ],
    }),

    schema.object({
      id: 'content',
      label: 'Content',
      fields: [
        schema.string({
          id: 'eyebrow',
          label: 'Eyebrow',
          help: 'Short label above the title, e.g. "Publishing".',
          translate: true,
        }),
        schema.string({
          id: 'title',
          label: 'Title',
          variant: 'textarea',
          translate: true,
        }),
        schema.richtext({
          id: 'intro',
          label: 'Intro',
          help: 'Opening paragraph(s): the problem and what Root.js offers.',
          translate: true,
        }),
        schema.image({
          id: 'heroImage',
          label: 'Hero image',
          help: 'Product screenshot shown below the intro.',
        }),
        schema.array({
          id: 'takeaways',
          label: 'Key takeaways',
          help: 'Short, scannable benefits shown in an "At a glance" box.',
          preview: ['{text}'],
          of: schema.object({
            fields: [
              schema.string({
                id: 'text',
                label: 'Text',
                translate: true,
              }),
            ],
          }),
        }),
        schema.array({
          id: 'sections',
          label: 'Sections',
          help: 'Each section is added to the table of contents.',
          preview: ['{title} (#{id})', '{title}', '#{id}'],
          of: schema.object({
            fields: [
              schema.string({
                id: 'id',
                label: 'ID',
                help: 'Section ID (for deeplinking).',
              }),
              schema.string({
                id: 'title',
                label: 'Title',
                variant: 'textarea',
                translate: true,
              }),
              schema.richtext({
                id: 'body',
                label: 'Body',
                translate: true,
              }),
              schema.image({
                id: 'image',
                label: 'Screenshot',
              }),
              schema.string({
                id: 'caption',
                label: 'Screenshot caption',
                translate: true,
              }),
            ],
          }),
        }),
        schema.array({
          id: 'faq',
          label: 'Frequently asked questions',
          preview: ['{question}'],
          of: schema.object({
            fields: [
              schema.string({
                id: 'question',
                label: 'Question',
                translate: true,
              }),
              schema.string({
                id: 'answer',
                label: 'Answer',
                variant: 'textarea',
                translate: true,
              }),
            ],
          }),
        }),
      ],
    }),
  ],
});
