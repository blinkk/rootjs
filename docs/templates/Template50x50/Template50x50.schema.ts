import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'Template50x50',
  label: '50/50 Section',
  description: 'Two-column section with independent left and right blocks.',
  presets: [
    schema.preset({
      id: 'copyImage',
      label: 'Copy + Image',
      description: 'Copy on the left, image on the right.',
      data: {
        leftSection: {
          _type: 'CopyBlock',
          eyebrow: 'Highlight',
          title: 'A short, descriptive title',
          titleSize: 'h2',
        },
        rightSection: {
          _type: 'ImageBlock',
        },
      },
    }),
    schema.preset({
      id: 'imageCopy',
      label: 'Image + Copy',
      description: 'Image on the left, copy on the right.',
      data: {
        options: ['layout:mobile-reverse'],
        leftSection: {
          _type: 'ImageBlock',
        },
        rightSection: {
          _type: 'CopyBlock',
          eyebrow: 'Highlight',
          title: 'A short, descriptive title',
          titleSize: 'h2',
        },
      },
    }),
  ],
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
        {value: 'layout:align-center'},
        {value: 'layout:mobile-reverse'},
        {value: 'CopyBlock:mobile-text-center'},
      ],
      creatable: true,
    }),
    schema.oneOf({
      id: 'leftSection',
      label: 'Left Section',
      types: schema.glob('/blocks/*/*.schema.ts', {omitFields: ['id']}),
    }),
    schema.oneOf({
      id: 'rightSection',
      label: 'Right Section',
      types: schema.glob('/blocks/*/*.schema.ts', {omitFields: ['id']}),
    }),
  ],
});
