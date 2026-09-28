import {schema} from '@blinkk/root-cms';
import ButtonSchema from '@/components/Button/Button.schema.js';

export default schema.define({
  name: 'TemplateFeatureSpotlight',
  label: 'Feature Spotlight',
  description:
    'A single feature: copy and highlights on one side, a screenshot on the other.',
  preview: {
    title: [
      'm{_index:02}: Spotlight: {eyebrow}',
      'm{_index:02}: Spotlight: {title}',
      'm{_index:02}: Spotlight',
    ],
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
        {value: 'layout:image-left'},
        {value: 'theme:dark'},
        {value: 'theme:tint'},
        {value: 'spacing:compact'},
      ],
      creatable: true,
    }),
    schema.string({
      id: 'eyebrow',
      label: 'Eyebrow',
      help: 'Usually the feature name, e.g. "Root AI".',
      translate: true,
    }),
    schema.string({
      id: 'title',
      label: 'Title',
      help: 'The feature tagline.',
      translate: true,
      variant: 'textarea',
    }),
    schema.richtext({
      id: 'body',
      label: 'Body copy',
      translate: true,
    }),
    schema.array({
      id: 'highlights',
      label: 'Highlights',
      help: 'Short supporting points, shown as a checklist.',
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
      id: 'buttons',
      label: 'Buttons',
      preview: ['{label}'],
      of: schema.object({fields: ButtonSchema.fields}),
    }),
    schema.image({
      id: 'image',
      label: 'Image',
      help: 'Product screenshot. Recommended: 1920x1200 PNG.',
    }),
  ],
});
