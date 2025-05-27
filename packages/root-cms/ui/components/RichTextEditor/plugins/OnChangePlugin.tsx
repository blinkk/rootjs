import {useEffect, useState} from 'preact/hooks';
import {RichTextData} from '../../../../shared/richtext.js';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {convertToRichTextData} from '../utils/convert-from-lexical.js';
import {convertToLexical} from '../utils/convert-to-lexical.js';
import {OnChangePlugin as LexicalOnChangePlugin} from '@lexical/react/LexicalOnChangePlugin';
import {EditorState} from 'lexical';
import {debounce} from '../../../utils/debounce.js';

export interface OnChangePluginProps {
  value?: RichTextData | null;
  onChange?: (data: RichTextData | null) => void;
}

export function OnChangePlugin(props: OnChangePluginProps) {
  const [editor] = useLexicalComposerContext();

  const [timeSaved, setTimeSaved] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const time = props.value?.time || 0;
    if (timeSaved !== time) {
      editor.update(() => {
        console.log('lexical update, props.value changed:', props.value);
        setIsUpdating(true);
        convertToLexical(props.value);
      });
    }
  }, [editor, props.value]);

  // The tree conversion from lexical data to rich text data can be expensive,
  // so debounce the updates after a short duration.
  const onChange = debounce((editorState: EditorState) => {
    if (isUpdating) {
      setIsUpdating(false);
      return;
    }
    editorState.read(() => {
      const richTextData = convertToRichTextData();
      console.log(richTextData);
      setTimeSaved(richTextData?.time || 0);
      if (props.onChange) {
        props.onChange(richTextData);
      }
    });
  }, 500);

  return <LexicalOnChangePlugin onChange={onChange} ignoreSelectionChange />;
}
