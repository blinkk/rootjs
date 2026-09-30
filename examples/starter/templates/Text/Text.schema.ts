import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'Text',
  description: 'Heading and body copy.',
  fields: [
    schema.string({
      id: 'title',
      label: 'Title',
      translate: true,
    }),
    schema.string({
      id: 'body',
      label: 'Body',
      help: 'Separate paragraphs with a blank line.',
      translate: true,
      variant: 'textarea',
    }),
  ],
});
