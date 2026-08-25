import {cleanup, render} from '@testing-library/preact';
import {act} from 'preact/test-utils';
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import * as schema from '../../../../core/schema.js';
import {RichTextData} from '../../../../shared/richtext.js';
import {FieldProps} from './FieldProps.js';

// Capture the props passed to the rich text editor so the test can drive its
// `onChange()` and inspect the value it receives.
let editorProps: any = null;
vi.mock('../../RichTextEditor/RichTextEditor.js', () => ({
  RichTextEditor: (props: any) => {
    editorProps = props;
    return <div data-testid="editor" />;
  },
}));

// Mock the draft doc controller so the field can be rendered without the full
// draft doc context. `fieldCallback` stands in for the db subscription.
const updateKey = vi.fn();
let fieldCallback: ((value: any) => void) | null = null;
vi.mock('../../../hooks/useDraftDoc.js', () => ({
  useDraftDoc: () => ({controller: {updateKey}}),
  useDraftDocField: (_deepKey: string, cb: (value: any) => void) => {
    fieldCallback = cb;
  },
}));

// Import after mocks are registered.
const {RichTextField} = await import('./RichTextField.js');

function richText(text: string, time: number): RichTextData {
  return {time, version: '1', blocks: [{type: 'paragraph', data: {text}}]};
}

function renderField() {
  const field: schema.RichTextField = {
    type: 'richtext',
    id: 'body',
  };
  const props: FieldProps = {
    field,
    deepKey: 'fields.body',
  };
  return render(<RichTextField {...props} />);
}

beforeEach(() => {
  editorProps = null;
  fieldCallback = null;
  updateKey.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('RichTextField', () => {
  test('passes db values to the editor', () => {
    renderField();
    act(() => fieldCallback!(richText('published text', 1000)));
    expect(editorProps.value).toEqual(richText('published text', 1000));
  });

  test('saves edits to the draft', () => {
    renderField();
    act(() => fieldCallback!(richText('published text', 1000)));
    act(() => editorProps.onChange(richText('draft text', 2000)));
    expect(updateKey).toHaveBeenCalledWith(
      'fields.body',
      richText('draft text', 2000)
    );
  });

  test('does not save an editor echo of the current value', () => {
    // After an external replacement (e.g. "discard draft edits") the editor
    // re-emits the value it was given with a fresh timestamp. Saving that would
    // mark the doc as edited again.
    // https://github.com/blinkk/rootjs/issues/1393
    renderField();
    act(() => fieldCallback!(richText('published text', 1000)));
    act(() => editorProps.onChange(richText('published text', 9000)));
    expect(updateKey).not.toHaveBeenCalled();
  });
});
