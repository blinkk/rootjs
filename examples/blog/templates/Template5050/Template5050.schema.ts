import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'Template5050',
  description: 'Basic 50x50.',
  fields: [
    schema.string({
      id: 'id',
      label: 'ID',
      help: 'Used for deep linking, tracking, etc.',
    }),
    schema.string({
      id: 'title',
      label: 'Title',
      translate: true,
    }),
    schema.string({
      id: 'body',
      label: 'Body',
      translate: true,
      variant: 'textarea',
    }),
    schema.oneOf({
      id: 'asset',
      label: 'Asset',
      types: schema.glob('/templates/Template5050/5050assets/*.schema.ts'),
    }),
  ],
});
