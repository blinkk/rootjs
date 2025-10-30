import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$createParagraphNode, $isParagraphNode, RootNode} from 'lexical';
import {useEffect} from 'preact/hooks';

export function TrailingParagraphPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Normalize the root so its last child is always a paragraph.
    return editor.registerNodeTransform(RootNode, (root) => {
      const last = root.getLastChild();
      if (!$isParagraphNode(last)) {
        root.append($createParagraphNode());
      }
    });
  }, [editor]);

  return null;
}
