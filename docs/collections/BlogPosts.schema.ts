import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'BlogPosts',
  fields: [
    schema.string({
      id: 'title',
      label: 'Blog title',
    }),
    schema.richtext({
      id: 'content',
      label: 'Blog content',
    }),
  ],
});
