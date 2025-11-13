import {TOGGLE_LINK_COMMAND} from '@lexical/link';
import {HeadingTagType} from '@lexical/rich-text';
import {
  COMMAND_PRIORITY_NORMAL,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  isModifierMatch,
  KEY_DOWN_COMMAND,
  LexicalEditor,
  OUTDENT_CONTENT_COMMAND,
} from 'lexical';
import {Dispatch, useEffect} from 'preact/hooks';

import {useToolbar} from '../hooks/useToolbar.js';
import {
  isClearFormatting,
  isFormatBulletList,
  isFormatHeading,
  isFormatNumberedList,
  isFormatParagraph,
  isIndent,
  isInsertLink,
  isOutdent,
  isStrikeThrough,
  isSubscript,
  isSuperscript,
} from '../utils/shortcuts.js';
import {
  clearFormatting,
  formatBulletList,
  formatHeading,
  formatNumberedList,
  formatParagraph,
} from '../utils/toolbar.js';
import {sanitizeUrl} from '../utils/url.js';

export interface ShortcutsPluginProps {
  editor: LexicalEditor;
  setIsLinkEditMode: Dispatch<boolean>;
}

export function ShortcutsPlugin(props: ShortcutsPluginProps): null {
  const {editor, setIsLinkEditMode} = props;
  const {toolbarState} = useToolbar();

  useEffect(() => {
    const keyboardShortcutsHandler = (event: KeyboardEvent) => {
      // At least one modifier must be set.
      if (isModifierMatch(event, {})) {
        return false;
      }
      if (isFormatParagraph(event)) {
        formatParagraph(editor);
      } else if (isFormatHeading(event)) {
        const {code} = event;
        const headingSize = `h${code[code.length - 1]}` as HeadingTagType;
        formatHeading(editor, toolbarState.blockType, headingSize);
      } else if (isFormatBulletList(event)) {
        formatBulletList(editor, toolbarState.blockType);
      } else if (isFormatNumberedList(event)) {
        formatNumberedList(editor, toolbarState.blockType);
      } else if (isStrikeThrough(event)) {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough');
      } else if (isIndent(event)) {
        editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
      } else if (isOutdent(event)) {
        editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
      } else if (isSubscript(event)) {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'subscript');
      } else if (isSuperscript(event)) {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'superscript');
      } else if (isClearFormatting(event)) {
        clearFormatting(editor);
      } else if (isInsertLink(event)) {
        const url = toolbarState.isLink ? null : '';
        setIsLinkEditMode(!toolbarState.isLink);
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
      } else {
        // No match for any of the event handlers.
        return false;
      }
      event.preventDefault();
      return true;
    };

    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      keyboardShortcutsHandler,
      COMMAND_PRIORITY_NORMAL
    );
  }, [editor, toolbarState.isLink, toolbarState.blockType, setIsLinkEditMode]);

  return null;
}
