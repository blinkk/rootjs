import {$generateNodesFromDOM} from '@lexical/html';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  COMMAND_PRIORITY_NORMAL,
  PASTE_COMMAND,
} from 'lexical';
import {useEffect} from 'preact/hooks';

/**
 * Strips `text-decoration:underline` from elements inside `<a>` tags.
 * Google Docs formats links as:
 * `<a href="..." style="text-decoration:none;"><span style="...text-decoration:underline;...">text</span></a>`
 */
function cleanLinkUnderlines(doc: Document): boolean {
  let modified = false;
  doc.querySelectorAll('a [style]').forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const style = el.style;
    if (
      style.textDecoration?.includes('underline') ||
      style.getPropertyValue('text-decoration')?.includes('underline')
    ) {
      style.removeProperty('text-decoration');
      style.removeProperty('text-decoration-skip-ink');
      style.removeProperty('-webkit-text-decoration-skip');
      modified = true;
    }
  });
  return modified;
}

/**
 * Strips `text-align` styles from all elements. The CMS rich text editor
 * doesn't currently support text alignment.
 */
function cleanTextAlign(doc: Document): boolean {
  let modified = false;
  doc.querySelectorAll('[style]').forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    if (el.style.textAlign) {
      el.style.removeProperty('text-align');
      modified = true;
    }
  });
  return modified;
}

/**
 * Plugin that cleans up pasted HTML to remove unsupported formatting.
 * - Removes `text-decoration:underline` from spans inside links (Google Docs).
 * - Removes `text-align` styles (not currently supported in the CMS).
 */
export function PasteCleanupPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        const {clipboardData} = event;
        if (!clipboardData) {
          return false;
        }

        const html = clipboardData.getData('text/html');
        if (!html) {
          return false;
        }

        const parser = new DOMParser();
        const dom = parser.parseFromString(html, 'text/html');

        let modified = false;
        modified = cleanLinkUnderlines(dom) || modified;
        modified = cleanTextAlign(dom) || modified;

        if (!modified) {
          return false;
        }

        event.preventDefault();

        const nodes = $generateNodesFromDOM(editor, dom);
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selection.insertNodes(nodes);
        } else {
          $insertNodes(nodes);
        }

        return true;
      },
      COMMAND_PRIORITY_NORMAL
    );
  }, [editor]);

  return null;
}
