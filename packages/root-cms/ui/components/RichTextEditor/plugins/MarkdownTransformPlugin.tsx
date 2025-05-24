import {
  HEADING,
  UNORDERED_LIST,
  ORDERED_LIST,
} from '@lexical/markdown';
import {MarkdownShortcutPlugin} from '@lexical/react/LexicalMarkdownShortcutPlugin';

export function MarkdownTransformPlugin() {
  return (
    <MarkdownShortcutPlugin transformers={[
      HEADING,
      UNORDERED_LIST,
      ORDERED_LIST,
    ]} />
  );
}
