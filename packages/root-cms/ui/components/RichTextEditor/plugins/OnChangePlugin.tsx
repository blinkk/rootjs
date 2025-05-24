import {useEffect} from 'preact/hooks';
import {RichTextData} from '../../../../shared/richtext.js';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {convertToRichTextData} from '../utils/convert-from-lexical.js';
import {convertToLexical} from '../utils/convert-to-lexical.js';

export interface OnChangePluginProps {
  value?: RichTextData | null;
  onChange?: (data: RichTextData | null) => void;
}

export function OnChangePlugin(props: OnChangePluginProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    console.log('rte value change upstream:', props.value);
    editor.update(() => {
      convertToLexical(props.value);
    });
  }, [editor, props.value]);

  useEffect(() => {
    return editor.registerUpdateListener(({editorState}) => {
      editorState.read(() => {
        const data = toRichTextData();
        if (props.onChange) {
          props.onChange(data);
        }
      });
    });
  }, [editor, props.onChange]);

  return null;
}

function toRichTextData(): RichTextData | null {
  return convertToRichTextData();
}
