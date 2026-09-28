import {schema} from '@blinkk/root-cms';
import {featureIconField} from '@/fields/featureIconField.js';

export default schema.define({
  name: 'TemplatePillars',
  label: 'Pillars',
  description:
    'Section header followed by 2-3 large cards, e.g. the parts of a product.',
  preview: {
    title: ['m{_index:02}: Pillars: {title}', 'm{_index:02}: Pillars'],
  },
  fields: [
    schema.string({
      id: 'id',
      label: 'ID',
      help: 'Used for deep linking, tracking, etc.',
    }),
    schema.multiselect({
      id: 'options',
      label: 'Module Options',
      help: 'Layout and display options.',
      options: [
        {value: 'theme:dark'},
        {value: 'theme:tint'},
        {value: 'spacing:compact'},
      ],
      creatable: true,
    }),
    schema.string({
      id: 'eyebrow',
      label: 'Eyebrow',
      translate: true,
    }),
    schema.string({
      id: 'title',
      label: 'Title',
      translate: true,
      variant: 'textarea',
    }),
    schema.string({
      id: 'body',
      label: 'Body copy',
      translate: true,
      variant: 'textarea',
    }),
    schema.array({
      id: 'pillars',
      label: 'Pillars',
      preview: ['{eyebrow}: {title}', '{title}'],
      of: schema.object({
        fields: [
          featureIconField(),
          schema.string({
            id: 'eyebrow',
            label: 'Eyebrow',
            help: 'e.g. "Build".',
            translate: true,
          }),
          schema.string({
            id: 'title',
            label: 'Title',
            translate: true,
            variant: 'textarea',
          }),
          schema.string({
            id: 'body',
            label: 'Body copy',
            translate: true,
            variant: 'textarea',
          }),
          schema.array({
            id: 'bullets',
            label: 'Bullets',
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
          schema.object({
            id: 'link',
            label: 'Link',
            fields: [
              schema.string({id: 'label', label: 'Label', translate: true}),
              schema.string({id: 'href', label: 'URL'}),
            ],
          }),
        ],
      }),
    }),
  ],
});
