import {EmojiFields} from '@/root-cms.js';
import {EMOJIS} from './emojis.js';

export type EmojiProps = EmojiFields;

export function Emoji(props: EmojiProps) {
  if (!props.emojiName) {
    return '';
  }
  return EMOJIS[props.emojiName] || `:${props.emojiName}:`;
}
