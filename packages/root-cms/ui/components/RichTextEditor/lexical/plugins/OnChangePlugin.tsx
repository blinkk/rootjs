import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {OnChangePlugin as LexicalOnChangePlugin} from '@lexical/react/LexicalOnChangePlugin';
import {EditorState} from 'lexical';
import {useEffect, useRef} from 'preact/hooks';
import {
  RichTextData,
  testSameRichTextContent,
} from '../../../../../shared/richtext.js';
import {convertToRichTextData} from '../utils/convert-from-lexical.js';
import {convertToLexical} from '../utils/convert-to-lexical.js';

export interface OnChangePluginProps {
  value?: RichTextData | null;
  onChange?: (data: RichTextData | null) => void;
}

export function OnChangePlugin(props: OnChangePluginProps) {
  const [editor] = useLexicalComposerContext();

  /**
   * The content currently reflected in the editor, either because the user
   * typed it or because it was rendered from `props.value`. Compared against
   * incoming values to tell an echo of the editor's own change apart from an
   * external replacement.
   */
  const currentValueRef = useRef<RichTextData | null>(null);
  const isUpdatingRef = useRef(false);

  useEffect(() => {
    // When props.value changes, convert the RichTextData to lexical data and
    // write to the active editor. Values that match what the editor already
    // holds are ignored, so typing doesn't re-render (and reset the cursor).
    // NOTE(stevenle): the content is compared rather than `time` because an
    // external replacement can carry an older timestamp, e.g. "discard draft
    // edits" restores the published version of the doc.
    const newValue = props.value ?? null;
    if (testSameRichTextContent(currentValueRef.current, newValue)) {
      return;
    }
    currentValueRef.current = newValue;
    editor.update(() => {
      isUpdatingRef.current = true;
      convertToLexical(newValue);
    });
  }, [editor, props.value]);

  const onChange = (editorState: EditorState) => {
    // Ignore editor updates from props.value changes.
    if (isUpdatingRef.current) {
      isUpdatingRef.current = false;
      return;
    }
    // When the user enters new content, read the current lexical data, convert
    // it to RichTextData, and then call the onChange() callback.
    editorState.read(
      () => {
        const richTextData = convertToRichTextData();
        currentValueRef.current = richTextData;
        if (props.onChange) {
          props.onChange(richTextData);
        }
      },
      {editor}
    );
  };

  return <LexicalOnChangePlugin onChange={onChange} ignoreSelectionChange />;
}
