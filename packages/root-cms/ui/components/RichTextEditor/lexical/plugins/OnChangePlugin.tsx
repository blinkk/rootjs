import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {OnChangePlugin as LexicalOnChangePlugin} from '@lexical/react/LexicalOnChangePlugin';
import {EditorState} from 'lexical';
import {useEffect, useRef} from 'preact/hooks';
import {RichTextData} from '../../../../../shared/richtext.js';
import {convertToRichTextData} from '../utils/convert-from-lexical.js';
import {convertToLexical} from '../utils/convert-to-lexical.js';

export interface OnChangePluginProps {
  value?: RichTextData | null;
  onChange?: (data: RichTextData | null) => void;
}

export function OnChangePlugin(props: OnChangePluginProps) {
  const [editor] = useLexicalComposerContext();

  const timeSavedRef = useRef(props.value?.time || 0);
  const isUpdatingRef = useRef(false);

  useEffect(() => {
    // When props.value changes, convert the RichTextData to lexical data and
    // write to the active editor.
    const time = props.value?.time || 0;
    if (time > timeSavedRef.current) {
      timeSavedRef.current = time;
      editor.update(() => {
        isUpdatingRef.current = true;
        convertToLexical(props.value);
      });
    }
  }, [editor, props.value]);

  const onChange = (editorState: EditorState) => {
    // Ignore editor updates from props.value changes.
    if (isUpdatingRef.current) {
      isUpdatingRef.current = false;
      return;
    }
    // When the user enters new content, read the current lexical data, convert
    // it to RichTextData, and then call the onChange() callback.
    editorState.read(() => {
      const richTextData = convertToRichTextData();
      timeSavedRef.current = richTextData?.time || 0;
      if (props.onChange) {
        props.onChange(richTextData);
      }
    });
  };

  return <LexicalOnChangePlugin onChange={onChange} ignoreSelectionChange />;
}
