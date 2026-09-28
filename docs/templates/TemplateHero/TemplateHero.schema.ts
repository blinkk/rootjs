import {schema} from '@blinkk/root-cms';
import ButtonSchema from '@/components/Button/Button.schema.js';

export default schema.define({
  name: 'TemplateHero',
  label: 'Hero',
  description:
    'Large centered headline with buttons, an optional install command and a product screenshot. Use `layout:banner` for a compact call-to-action card.',
  preview: {
    title: ['m{_index:02}: Hero: {title}', 'm{_index:02}: Hero'],
    image: '{image.src}',
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
        {value: 'layout:banner'},
        {value: 'theme:dark'},
        {value: 'theme:tint'},
        {value: 'spacing:compact'},
        {value: 'title:h2'},
      ],
      creatable: true,
    }),
    schema.string({
      id: 'eyebrow',
      label: 'Eyebrow',
      help: 'Small text above the title.',
      translate: true,
    }),
    schema.string({
      id: 'title',
      label: 'Title',
      translate: true,
      variant: 'textarea',
    }),
    schema.richtext({
      id: 'body',
      label: 'Body copy',
      translate: true,
    }),
    schema.array({
      id: 'buttons',
      label: 'Buttons',
      preview: ['{label}'],
      of: schema.object({fields: ButtonSchema.fields}),
    }),
    schema.string({
      id: 'command',
      label: 'Command',
      help: 'Optional. Shell command shown below the buttons, e.g. `npm create @blinkk/root`.',
    }),
    schema.image({
      id: 'image',
      label: 'Image',
      help: 'Optional. Product screenshot shown below the copy. Recommended: 2880x1800 PNG.',
    }),
  ],
});
