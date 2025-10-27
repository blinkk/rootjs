import {schema} from '@blinkk/root-cms';
import ButtonSchema from '@/components/Button/Button.schema.js';

export default schema.define({
  name: 'TemplateHeadline',
  preview: {
    title: ['m{_index:02}: {title}'],
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
      customBlocks: [
        schema.define({
          name: 'HtmlBlock',
          label: 'HTML Embed',
          fields: [
            schema.string({
              id: 'html',
              label: 'HTML code',
              help: 'Please use caution when inserting HTML code.',
              variant: 'textarea',
            }),
          ],
          preview: {title: 'html'},
        }),
        schema.define({
          name: 'YouTubeBlock',
          label: 'YouTube Embed',
          fields: [
            schema.string({
              id: 'html',
              variant: 'textarea',
            }),
          ],
        }),
      ],
    }),
    schema.array({
      id: 'buttons',
      label: 'Buttons',
      preview: ['{label}'],
      of: schema.object({fields: ButtonSchema.fields}),
    }),
  ],
});
