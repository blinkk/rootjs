import {
  HEADING,
  UNORDERED_LIST,
  ORDERED_LIST,
  QUOTE,
  INLINE_CODE,
} from '@lexical/markdown';
import {MarkdownShortcutPlugin} from '@lexical/react/LexicalMarkdownShortcutPlugin';

export function MarkdownTransformPlugin() {
  return (
    <MarkdownShortcutPlugin
      transformers={[HEADING, UNORDERED_LIST, ORDERED_LIST, QUOTE, INLINE_CODE]}
    />
  );
}
