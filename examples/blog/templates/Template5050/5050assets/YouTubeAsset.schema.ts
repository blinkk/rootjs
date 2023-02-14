import {schema} from '@blinkk/root-cms';

export default schema.define({
  name: 'YouTubeAsset',
  description: 'Embedded YouTube image.',
  fields: [
    schema.string({
      id: 'internalDesc',
      label: 'Internal Description',
    }),
    schema.string({
      id: 'youtubeUrl',
      label: 'YouTube URL',
    }),
    schema.image({
      id: 'thumbnail',
      label: 'Thumbnail image',
      help: 'Optional. If not provided, the default YT thumbnail is used.',
    }),
  ],
});
