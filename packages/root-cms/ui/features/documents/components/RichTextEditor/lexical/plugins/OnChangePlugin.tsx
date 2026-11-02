import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {OnChangePlugin as LexicalOnChangePlugin} from '@lexical/react/LexicalOnChangePlugin';
import {EditorState, LexicalEditor} from 'lexical';
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

/** Update tag for writes that render `props.value` into the editor. */
const EXTERNAL_VALUE_TAG = 'root-cms-external-value';

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
   *
   * Matched by identity, not content: parents hand back the emitted object,
   * while anything external (undo history, firestore) is always a new object
   * and must render even if its content matches an earlier edit.
   */
  const recentValuesRef = useRef<Array<RichTextData | null>>([]);

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
    const echoIndex = recentValuesRef.current.indexOf(newValue);
    if (echoIndex !== -1) {
      recentValuesRef.current.splice(0, echoIndex + 1);
      return;
    }
    if (testSameRichTextContent(currentValueRef.current, newValue)) {
      return;
    }
    currentValueRef.current = newValue;
    recentValuesRef.current = [];
    // Commit synchronously so that a keystroke can't merge into this update,
    // which would hide it from onChange() below.
    editor.update(() => convertToLexical(newValue), {
      discrete: true,
      tag: EXTERNAL_VALUE_TAG,
    });
  }, [editor, props.value]);

  const onChange = (
    editorState: EditorState,
    _editor: LexicalEditor,
    tags: Set<string>
  ) => {
    // Ignore editor updates from props.value changes.
    if (tags.has(EXTERNAL_VALUE_TAG)) {
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
