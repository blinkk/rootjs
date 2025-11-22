import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {TextNode} from 'lexical';
import {useEffect} from 'preact/hooks';
import {SPECIAL_CHARACTER_REGEX} from '../../../../utils/special-characters.js';

const SPECIAL_CHARACTER_STYLE =
  'background-color: #fff3bf; font-weight: 600; border-radius: 2px; padding: 0 2px; outline: 1px dashed #f59f00; --rootcms-special-char: 1;';

function removeSpecialCharacterStyle(style: string) {
  if (!style) {
    return '';
  }
  return style
    .replace('--rootcms-special-char: 1;', '')
    .replace(/background-color:[^;]+;?/g, '')
    .replace(/font-weight:[^;]+;?/g, '')
    .replace(/border-radius:[^;]+;?/g, '')
    .replace(/padding:[^;]+;?/g, '')
    .replace(/outline:[^;]+;?/g, '')
    .trim();
}

function combineStyle(baseStyle: string) {
  const trimmed = removeSpecialCharacterStyle(baseStyle);
  return [trimmed, SPECIAL_CHARACTER_STYLE].filter(Boolean).join(' ');
}

function $findAndTransformText(node: TextNode): null | TextNode {
  const text = node.getTextContent();
  SPECIAL_CHARACTER_REGEX.lastIndex = 0;
  const match = SPECIAL_CHARACTER_REGEX.exec(text);

  if (match) {
    const startIndex = match.index;
    const matchLength = match[0].length;

    // If the node is already styled and is exactly the special char, skip it.
    if (
      node.getStyle().includes('--rootcms-special-char') &&
      text.length === matchLength
    ) {
      return null;
    }

    let targetNode: TextNode;
    if (startIndex === 0) {
      if (text.length === matchLength) {
        targetNode = node;
      } else {
        [targetNode] = node.splitText(matchLength);
      }
    } else {
      [, targetNode] = node.splitText(startIndex, startIndex + matchLength);
    }

    targetNode.setStyle(combineStyle(targetNode.getStyle()));
    return targetNode;
  }

  // If the node has the special char style but doesn't match the regex anymore
  // (e.g. user edited it), remove the style.
  if (node.getStyle().includes('--rootcms-special-char')) {
    node.setStyle(removeSpecialCharacterStyle(node.getStyle()));
  }

  return null;
}

function $textNodeTransform(node: TextNode): void {
  let targetNode: TextNode | null = node;

  while (targetNode !== null) {
    if (!targetNode.isSimpleText()) {
      return;
    }

    targetNode = $findAndTransformText(targetNode);
  }
}

export function SpecialCharacterHighlightPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerNodeTransform(TextNode, $textNodeTransform);
  }, [editor]);

  return null;
}
