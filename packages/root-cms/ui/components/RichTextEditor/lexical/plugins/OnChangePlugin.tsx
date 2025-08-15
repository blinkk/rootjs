import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {OnChangePlugin as LexicalOnChangePlugin} from '@lexical/react/LexicalOnChangePlugin';
import {EditorState} from 'lexical';
import {useEffect, useState} from 'preact/hooks';
import {RichTextData} from '../../../../../shared/richtext.js';
import {debounce} from '../../../../utils/debounce.js';
import {deepEqual} from '../../../../utils/objects.js';
import {convertToRichTextData} from '../utils/convert-from-lexical.js';
import {convertToLexical} from '../utils/convert-to-lexical.js';

export interface OnChangePluginProps {
  value?: RichTextData | null;
  onChange?: (data: RichTextData | null) => void;
}

export function OnChangePlugin(props: OnChangePluginProps) {
  const [editor] = useLexicalComposerContext();
  const [isUpdating, setIsUpdating] = useState(false);
  const [value, setValue] = useState<RichTextData | null>(null);

  useEffect(() => {
    if (!deepEqual(props.value, value)) {
      editor.update(() => {
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
      if (!deepEqual(value, richTextData)) {
        setValue(richTextData);
        if (props.onChange) {
          props.onChange(richTextData);
        }
      }
    });
  }, 500);

  return <LexicalOnChangePlugin onChange={onChange} ignoreSelectionChange />;
}
