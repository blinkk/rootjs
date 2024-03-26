import {schema} from '@blinkk/root-cms';
import ButtonSchema from '@/components/Button/Button.schema';

export default schema.define({
  name: 'ButtonsBlock',
  description: '',
  fields: [
    schema.multiselect({
      id: 'options',
      label: 'Block Options',
      options: ['align:center'],
      creatable: true,
    }),
    schema.array({
      id: 'buttons',
      label: 'Buttons',
      preview: ['{label}'],
      of: schema.object({fields: ButtonSchema.fields}),
    }),
  ],
});
