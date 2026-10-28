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
import {cleanPastedHtml} from '../utils/paste-cleanup.js';

/**
 * Plugin that cleans up pasted HTML to remove unsupported formatting.
 * - Removes `text-decoration:underline` from spans inside links (Google Docs).
 * - Removes `text-align` styles (not currently supported in the CMS).
 * - Removes blank paragraphs and stray line breaks used for spacing.
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

        // Let lexical handle copy/paste between editors, which uses a
        // lossless serialization of the copied nodes.
        if (clipboardData.getData('application/x-lexical-editor')) {
          return false;
        }

        const html = clipboardData.getData('text/html');
        if (!html) {
          return false;
        }

        const parser = new DOMParser();
        const dom = parser.parseFromString(html, 'text/html');

        if (!cleanPastedHtml(dom)) {
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
