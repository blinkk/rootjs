import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {TextNode} from 'lexical';
import {useEffect} from 'preact/hooks';
import {
  $createSpecialCharacterNode,
  $isSpecialCharacterNode,
  SpecialCharacterNode,
} from '../nodes/SpecialCharacterNode.js';

const SPECIAL_CHARS = /[\u00A0\u2011]/;

export function SpecialCharacterPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([SpecialCharacterNode])) {
      throw new Error(
        'SpecialCharacterPlugin: SpecialCharacterNode not registered on editor'
      );
    }

    return editor.registerNodeTransform(TextNode, (node) => {
      if ($isSpecialCharacterNode(node)) {
        return;
      }

      const text = node.getTextContent();
      const match = SPECIAL_CHARS.exec(text);

      if (match) {
        const index = match.index;
        const char = match[0];
        let targetNode;

        if (index === 0) {
          [targetNode] = node.splitText(index + 1);
        } else {
          [, targetNode] = node.splitText(index, index + 1);
        }

        const specialCharNode = $createSpecialCharacterNode(char);
        targetNode.replace(specialCharNode);
      }
    });
  }, [editor]);

  return null;
}
