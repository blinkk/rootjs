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

function highlightNode(textNode: TextNode) {
  const textContent = textNode.getTextContent();
  SPECIAL_CHARACTER_REGEX.lastIndex = 0;
  const hasSpecialCharacter = SPECIAL_CHARACTER_REGEX.test(textContent);
  if (!hasSpecialCharacter) {
    if (textNode.getStyle().includes('--rootcms-special-char')) {
      textNode.setStyle(removeSpecialCharacterStyle(textNode.getStyle()));
    }
    return;
  }

  if (
    textContent.length === 1 &&
    textNode.getStyle().includes('--rootcms-special-char')
  ) {
    return;
  }

  const baseStyle = textNode.getStyle();
  const nodes: TextNode[] = [];
  let lastIndex = 0;
  SPECIAL_CHARACTER_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = SPECIAL_CHARACTER_REGEX.exec(textContent)) !== null) {
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      const normalNode = textNode.clone();
      normalNode.setTextContent(textContent.slice(lastIndex, matchIndex));
      normalNode.setStyle(removeSpecialCharacterStyle(baseStyle));
      nodes.push(normalNode);
    }

    const specialNode = textNode.clone();
    specialNode.setTextContent(match[0]);
    specialNode.setStyle(combineStyle(baseStyle));
    nodes.push(specialNode);

    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < textContent.length) {
    const trailingNode = textNode.clone();
    trailingNode.setTextContent(textContent.slice(lastIndex));
    trailingNode.setStyle(removeSpecialCharacterStyle(baseStyle));
    nodes.push(trailingNode);
  }

  if (nodes.length > 0) {
    textNode.replace(nodes);
  }
}

export function SpecialCharacterHighlightPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerTextNodeTransform(TextNode, highlightNode);
  }, [editor]);

  return null;
}
