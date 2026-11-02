import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {OnChangePlugin as LexicalOnChangePlugin} from '@lexical/react/LexicalOnChangePlugin';
import {EditorState} from 'lexical';
import {useEffect, useRef} from 'preact/hooks';
import {
  RichTextData,
  testSameRichTextContent,
} from '../../../../../../../shared/richtext.js';
import {convertToRichTextData} from '../utils/convert-from-lexical.js';
import {convertToLexical} from '../utils/convert-to-lexical.js';

export interface OnChangePluginProps {
  value?: RichTextData | null;
  onChange?: (data: RichTextData | null) => void;
}

/**
 * Number of recently emitted values remembered so that late echoes of the
 * editor's own changes can be recognized. Only a handful of keystrokes can
 * be in flight between the editor and a controlled parent at once.
 */
const RECENT_VALUES_LIMIT = 20;

export function OnChangePlugin(props: OnChangePluginProps) {
  const [editor] = useLexicalComposerContext();

  /**
   * The content currently reflected in the editor, either because the user
   * typed it or because it was rendered from `props.value`. Compared against
   * incoming values to tell an echo of the editor's own change apart from an
   * external replacement.
   */
  const currentValueRef = useRef<RichTextData | null>(null);
  /**
   * Values emitted via `onChange()` that haven't been echoed back yet, newest
   * last. A controlled parent renders each emitted value back into
   * `props.value`, but its effects can lag behind fast typing: by the time the
   * effect for one keystroke runs, the editor may already hold the next one.
   * Treating these values as echoes keeps those stale renders from rewriting
   * the editor (and resetting the cursor). Includes `null`, which is what an
   * emptied editor emits.
   */
  const recentValuesRef = useRef<Array<RichTextData | null>>([]);
  const isUpdatingRef = useRef(false);

  useEffect(() => {
    // When props.value changes, convert the RichTextData to lexical data and
    // write to the active editor. Values that match what the editor already
    // holds (or recently emitted) are ignored, so typing doesn't re-render
    // (and reset the cursor).
    // NOTE(stevenle): the content is compared rather than `time` because an
    // external replacement can carry an older timestamp, e.g. "discard draft
    // edits" restores the published version of the doc.
    const newValue = props.value ?? null;
    // Echoes arrive in order, so an echo also accounts for anything emitted
    // before it (a parent can batch several values into one render). Dropping
    // those lets the same content through later as a real replacement, e.g.
    // undoing an edit or clearing the field.
    const echoIndex = recentValuesRef.current.findIndex((recent) =>
      testSameRichTextContent(recent, newValue)
    );
    if (echoIndex !== -1) {
      recentValuesRef.current.splice(0, echoIndex + 1);
      return;
    }
    if (testSameRichTextContent(currentValueRef.current, newValue)) {
      return;
    }
    currentValueRef.current = newValue;
    recentValuesRef.current = [];
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
        const recent = recentValuesRef.current;
        recent.push(richTextData);
        if (recent.length > RECENT_VALUES_LIMIT) {
          recent.splice(0, recent.length - RECENT_VALUES_LIMIT);
        }
        if (props.onChange) {
          props.onChange(richTextData);
        }
      },
      {editor}
    );
  };

  return <LexicalOnChangePlugin onChange={onChange} ignoreSelectionChange />;
}
