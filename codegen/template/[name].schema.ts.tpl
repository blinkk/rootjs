import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: '[[name]]',
  fields: [
    schema.string({
      id: 'title',
      label: 'Title',
    }),
    schema.richtext({
      id: 'body',
      label: 'Body',
    }),
  ],
});
