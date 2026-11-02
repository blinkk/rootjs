import {LexicalComposer} from '@lexical/react/LexicalComposer';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {LexicalErrorBoundary} from '@lexical/react/LexicalErrorBoundary';
import {RichTextPlugin} from '@lexical/react/LexicalRichTextPlugin';
import {HeadingNode, QuoteNode} from '@lexical/rich-text';
import {cleanup, render} from '@testing-library/preact';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  LexicalEditor,
} from 'lexical';
import {afterEach, describe, expect, test, vi} from 'vitest';
import {RichTextData} from '../../../../../../../shared/richtext.js';
import {OnChangePlugin} from './OnChangePlugin.js';

afterEach(() => {
  cleanup();
});

function richText(text: string, time: number): RichTextData {
  return {
    time,
    version: '1',
    blocks: [{type: 'paragraph', data: {text}}],
  };
}

interface TestEditorProps {
  value: RichTextData | null;
  onChange?: (value: RichTextData | null) => void;
  onReady?: (editor: LexicalEditor) => void;
}

/**
 * Minimal lexical setup with the OnChangePlugin under test. The full
 * <LexicalEditor> needs the toolbar's floating UI and modals, and the value
 * syncing being tested here lives entirely in the plugin.
 */
function TestEditor(props: TestEditorProps) {
  return (
    <LexicalComposer
      initialConfig={{
        namespace: 'test',
        nodes: [HeadingNode, QuoteNode],
        onError: (err: Error) => {
          throw err;
        },
      }}
    >
      <OnChangePlugin value={props.value} onChange={props.onChange} />
      <RichTextPlugin
        contentEditable={<ContentEditable />}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <EditorRef onReady={props.onReady} />
    </LexicalComposer>
  );
}

function EditorRef(props: {onReady?: (editor: LexicalEditor) => void}) {
  const [editor] = useLexicalComposerContext();
  if (props.onReady) {
    props.onReady(editor);
  }
  return null;
}

/** Yields to the microtask/timer queue so lexical can reconcile the DOM. */
async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Renders the editor with an initial value and waits for it to settle. */
async function renderEditor(text: string) {
  let editor!: LexicalEditor;
  const onChange = vi.fn();
  const onReady = (e: LexicalEditor) => (editor = e);
  const {rerender} = render(
    <TestEditor
      value={richText(text, 1000)}
      onChange={onChange}
      onReady={onReady}
    />
  );
  await flush();
  return {editor, rerender, onChange, onReady};
}

/** Simulates a user edit that leaves the editor holding `text`. */
function setEditorText(editor: LexicalEditor, text: string) {
  editor.update(() => {
    const paragraph = $createParagraphNode();
    if (text) {
      paragraph.append($createTextNode(text));
    }
    const root = $getRoot();
    root.clear();
    root.append(paragraph);
  });
}

describe('OnChangePlugin', () => {
  test('renders the incoming value', async () => {
    const {container} = render(<TestEditor value={richText('hello', 1000)} />);
    await flush();
    expect(container.textContent).toContain('hello');
  });

  test('renders external replacements with an older timestamp', async () => {
    // "Discard draft edits" restores the published version of the doc, whose
    // rich text data was serialized before the draft edits.
    // https://github.com/blinkk/rootjs/issues/1393
    const {container, rerender} = render(
      <TestEditor value={richText('draft text', 2000)} />
    );
    await flush();
    expect(container.textContent).toContain('draft text');

    rerender(<TestEditor value={richText('published text', 1000)} />);
    await flush();
    expect(container.textContent).toContain('published text');
    expect(container.textContent).not.toContain('draft text');
  });

  test('clears the editor when the value is emptied', async () => {
    const {container, rerender} = render(
      <TestEditor value={richText('draft text', 2000)} />
    );
    await flush();
    expect(container.textContent).toContain('draft text');

    rerender(<TestEditor value={null} />);
    await flush();
    expect(container.textContent).not.toContain('draft text');
  });

  test('ignores values that echo the editor content', async () => {
    // Values flow back into the editor after every keystroke. Re-rendering
    // them would reset the user's cursor.
    let editor!: LexicalEditor;
    const onChange = vi.fn();
    const value = richText('hello', 1000);
    const {rerender} = render(
      <TestEditor
        value={value}
        onChange={onChange}
        onReady={(e) => (editor = e)}
      />
    );
    await flush();

    // Simulate a user edit.
    editor.update(() => {
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('hello world'));
      const root = $getRoot();
      root.clear();
      root.append(paragraph);
    });
    await flush();
    expect(onChange).toHaveBeenCalled();
    const editedValue = onChange.mock.lastCall![0] as RichTextData;
    const editorState = editor.getEditorState();

    // The edit round-trips back through the parent component.
    rerender(
      <TestEditor
        value={editedValue}
        onChange={onChange}
        onReady={(e) => (editor = e)}
      />
    );
    await flush();
    expect(editor.getEditorState()).toBe(editorState);
  });

  test('ignores stale echoes of earlier edits', async () => {
    // A controlled parent re-renders each emitted value, but its effects can
    // lag behind fast typing. When the render for an earlier keystroke lands
    // after a later keystroke was already applied, the editor must keep the
    // later content rather than reverting (and resetting the cursor).
    let editor!: LexicalEditor;
    const onChange = vi.fn();
    const {rerender} = render(
      <TestEditor
        value={richText('h', 1000)}
        onChange={onChange}
        onReady={(e) => (editor = e)}
      />
    );
    await flush();

    const type = (text: string) => {
      editor.update(() => {
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode(text));
        const root = $getRoot();
        root.clear();
        root.append(paragraph);
      });
    };
    type('he');
    await flush();
    type('hel');
    await flush();
    expect(onChange).toHaveBeenCalledTimes(2);
    const staleValue = onChange.mock.calls[0][0] as RichTextData;
    const editorState = editor.getEditorState();

    // The first keystroke's value arrives after the second was applied.
    rerender(
      <TestEditor
        value={staleValue}
        onChange={onChange}
        onReady={(e) => (editor = e)}
      />
    );
    await flush();
    expect(editor.getEditorState()).toBe(editorState);
    expect(editor.getRootElement()?.textContent).toContain('hel');
  });

  test('ignores a stale echo of the emptied editor', async () => {
    // Select-all + delete emits `null`. When that value renders back after the
    // next keystroke, it must not clear what the user just typed.
    const {editor, rerender, onChange, onReady} = await renderEditor('hello');
    setEditorText(editor, '');
    await flush();
    expect(onChange.mock.lastCall![0]).toBe(null);
    setEditorText(editor, 'a');
    await flush();

    rerender(<TestEditor value={null} onChange={onChange} onReady={onReady} />);
    await flush();
    expect(editor.getRootElement()?.textContent).toBe('a');
  });

  test('ignores every lagging echo after the editor is emptied', async () => {
    const {editor, rerender, onChange, onReady} = await renderEditor('hello');
    const echo = async (value: RichTextData | null) => {
      rerender(
        <TestEditor value={value} onChange={onChange} onReady={onReady} />
      );
      await flush();
    };

    setEditorText(editor, '');
    await flush();
    setEditorText(editor, 'a');
    await flush();
    setEditorText(editor, 'ab');
    await flush();
    const emitted = onChange.mock.calls.map((call) => call[0]);

    await echo(emitted[0]);
    setEditorText(editor, 'abc');
    await flush();
    await echo(emitted[1]);
    setEditorText(editor, 'abcd');
    await flush();
    await echo(emitted[2]);
    expect(editor.getRootElement()?.textContent).toBe('abcd');
  });

  test('renders an external clear after echoes settle', async () => {
    // A `null` echo must only be ignored once. Later on, `null` is a real
    // replacement, e.g. discarding edits to a doc with an empty field.
    const {editor, rerender, onChange, onReady} = await renderEditor('hello');
    setEditorText(editor, '');
    await flush();
    setEditorText(editor, 'a');
    await flush();
    for (const [value] of onChange.mock.calls) {
      rerender(
        <TestEditor value={value} onChange={onChange} onReady={onReady} />
      );
      await flush();
    }

    rerender(<TestEditor value={null} onChange={onChange} onReady={onReady} />);
    await flush();
    expect(editor.getRootElement()?.textContent).toBe('');
  });

  test('renders an external value matching an older edit', async () => {
    // Once its echo has been seen, an older edit can only come back from
    // outside the editor, e.g. undoing changes at the doc level.
    const {editor, rerender, onChange, onReady} = await renderEditor('hello');
    setEditorText(editor, 'hello w');
    await flush();
    setEditorText(editor, 'hello wo');
    await flush();
    for (const [value] of onChange.mock.calls) {
      rerender(
        <TestEditor value={value} onChange={onChange} onReady={onReady} />
      );
      await flush();
    }

    rerender(
      <TestEditor
        value={richText('hello w', 3000)}
        onChange={onChange}
        onReady={onReady}
      />
    );
    await flush();
    expect(editor.getRootElement()?.textContent).toBe('hello w');
  });

  test('ignores values that only differ by timestamp', async () => {
    let editor!: LexicalEditor;
    const {rerender} = render(
      <TestEditor
        value={richText('hello', 1000)}
        onReady={(e) => (editor = e)}
      />
    );
    await flush();
    const editorState = editor.getEditorState();

    rerender(
      <TestEditor
        value={richText('hello', 5000)}
        onReady={(e) => (editor = e)}
      />
    );
    await flush();
    expect(editor.getEditorState()).toBe(editorState);
  });
});
