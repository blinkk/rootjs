import {schema} from '@blinkk/root-cms';
import {EMOJIS} from './emojis.js';

const options = Object.entries(EMOJIS).map(([emojiName, emojiText]) => {
  return {value: emojiName, label: `${emojiName} ${emojiText}`};
});

export default schema.define({
  name: 'Emoji',
  fields: [
    schema.select({
      id: 'emojiName',
      label: 'Emoji',
      options: options,
    }),
  ],
});
