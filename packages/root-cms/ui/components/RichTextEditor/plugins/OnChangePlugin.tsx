import {useEffect, useState} from 'preact/hooks';
import {RichTextData} from '../../../../shared/richtext.js';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {convertToRichTextData} from '../utils/convert-from-lexical.js';
import {convertToLexical} from '../utils/convert-to-lexical.js';
import {OnChangePlugin as LexicalOnChangePlugin} from '@lexical/react/LexicalOnChangePlugin';
import {EditorState} from 'lexical';

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

  function onChange(editorState: EditorState) {
    if (isUpdating) {
      setIsUpdating(false);
      return;
    }
    editorState.read(() => {
      const richTextData = toRichTextData();
      setTimeSaved(richTextData?.time || 0);
      if (props.onChange) {
        props.onChange(richTextData);
      }
    });
  }

  return <LexicalOnChangePlugin onChange={onChange} ignoreSelectionChange />;
}

function toRichTextData(): RichTextData | null {
  return convertToRichTextData();
}
