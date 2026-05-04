import {schema} from '@blinkk/root-cms';
import ButtonSchema from '@/components/Button/Button.schema.js';

export default schema.define({
  name: 'TemplateHeadline',
  label: 'Headline',
  description: 'Title block with optional eyebrow, body and buttons.',
  preview: {
    title: ['m{_index:02}: {title}'],
  },
  presets: [
    schema.preset({
      id: 'hero',
      label: 'Hero headline',
      description: 'Eyebrow, large title, body, and a primary CTA button.',
      data: {
        options: ['title:h1'],
        eyebrow: 'Announcing',
        title: 'A bold new headline',
        buttons: [
          {options: ['variant:primary'], label: 'Get started', href: '/start'},
        ],
      },
    }),
    schema.preset({
      id: 'section',
      label: 'Section heading',
      description: 'Compact section title with supporting body copy.',
      data: {
        title: 'Section title',
      },
    }),
    schema.preset({
      id: 'cta',
      label: 'CTA pair',
      description: 'Title plus two buttons (primary and secondary).',
      data: {
        title: 'Ready to dive in?',
        buttons: [
          {options: ['variant:primary'], label: 'Get started', href: '/start'},
          {options: ['variant:outline'], label: 'Learn more', href: '/docs'},
        ],
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
      options: [{value: 'title:h1'}],
      creatable: true,
    }),
    schema.string({
      id: 'eyebrow',
      label: 'Eyebrow',
      help: 'Small text above the title.',
      translate: true,
      variant: 'textarea',
    }),
    schema.string({
      id: 'title',
      label: 'Title',
      help: 'Main headline title.',
      translate: true,
      variant: 'textarea',
    }),
    schema.richtext({
      id: 'body',
      label: 'Body copy',
      help: 'Headline body copy.',
      translate: true,
    }),
    schema.array({
      id: 'buttons',
      label: 'Buttons',
      preview: ['{label}'],
      of: schema.object({fields: ButtonSchema.fields}),
    }),
  ],
});
