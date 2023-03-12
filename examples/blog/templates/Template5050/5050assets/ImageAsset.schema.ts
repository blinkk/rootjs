import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'ImageAsset',
  description: 'Static image embed.',
  fields: [
    schema.image({
      id: 'image',
      label: 'Image to embed',
      help: 'Optional. If not provided, the default YT thumbnail is used.',
    }),
  ],
});
