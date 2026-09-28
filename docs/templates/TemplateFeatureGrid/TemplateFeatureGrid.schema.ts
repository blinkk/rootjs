import {schema} from '@blinkk/root-cms';
import {featureIconField} from '@/fields/featureIconField.js';

export default schema.define({
  name: 'TemplateFeatureGrid',
  label: 'Feature Grid',
  description: 'Section header followed by a grid of icon + title + tagline.',
  preview: {
    title: [
      'm{_index:02}: Feature Grid: {title}',
      'm{_index:02}: Feature Grid',
    ],
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
      help: 'Layout and display options. Defaults to 3 columns.',
      options: [
        {value: 'columns:2'},
        {value: 'columns:4'},
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
      id: 'items',
      label: 'Items',
      preview: ['{title}'],
      of: schema.object({
        fields: [
          featureIconField(),
          schema.string({
            id: 'title',
            label: 'Title',
            translate: true,
          }),
          schema.string({
            id: 'body',
            label: 'Body copy',
            help: 'One or two sentences.',
            translate: true,
            variant: 'textarea',
          }),
          schema.string({
            id: 'href',
            label: 'URL',
            help: 'Optional. Makes the whole item a link, e.g. to a guide.',
          }),
        ],
      }),
    }),
  ],
});
