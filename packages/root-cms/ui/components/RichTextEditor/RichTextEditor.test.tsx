import {cleanup, render, screen} from '@testing-library/preact';
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {RichTextEditor} from './RichTextEditor.js';

const userPreferences = {EnableEditorJSEditor: false};

vi.mock('../../hooks/useUserPreferences.js', () => ({
  useUserPreferences: () => ({preferences: userPreferences}),
}));

vi.mock('./editorjs/EditorJSEditor.js', () => ({
  EditorJSEditor: () => <div data-testid="editorjs" />,
}));

vi.mock('./lexical/LexicalEditor.js', () => ({
  LexicalEditor: () => <div data-testid="lexical" />,
}));

beforeEach(() => {
  userPreferences.EnableEditorJSEditor = false;
});

afterEach(() => {
  cleanup();
});

describe('RichTextEditor', () => {
  test('uses the lexical editor by default', () => {
    render(<RichTextEditor />);
    expect(screen.queryByTestId('lexical')).toBeTruthy();
  });

  test('honors the legacy editor preference', () => {
    userPreferences.EnableEditorJSEditor = true;
    render(<RichTextEditor />);
    expect(screen.queryByTestId('editorjs')).toBeTruthy();
  });

  test('overrides the legacy editor preference when the field offers sizes', () => {
    // EditorJS rebuilds blocks on save and would drop `data.size`, so a field
    // that offers sizes must never open in it.
    userPreferences.EnableEditorJSEditor = true;
    render(<RichTextEditor paragraphSizes={['small', 'large']} />);
    expect(screen.queryByTestId('lexical')).toBeTruthy();
    expect(screen.queryByTestId('editorjs')).toBeNull();
  });

  test('keeps the legacy editor when the sizes list is empty or unusable', () => {
    userPreferences.EnableEditorJSEditor = true;
    render(<RichTextEditor paragraphSizes={['  ']} />);
    expect(screen.queryByTestId('editorjs')).toBeTruthy();
  });

  test('overrides the preference when the value already has a size', () => {
    // The field never declared sizes, but a pasted paragraph carries one and a
    // site's CSS is global, so the size renders and must not be stripped.
    userPreferences.EnableEditorJSEditor = true;
    render(
      <RichTextEditor
        value={{
          version: '1',
          time: 0,
          blocks: [{type: 'paragraph', data: {size: 'small', text: 'Hi.'}}],
        }}
      />
    );
    expect(screen.queryByTestId('lexical')).toBeTruthy();
    expect(screen.queryByTestId('editorjs')).toBeNull();
  });

  test('overrides the preference for a size inside a table cell', () => {
    userPreferences.EnableEditorJSEditor = true;
    render(
      <RichTextEditor
        value={{
          version: '1',
          time: 0,
          blocks: [
            {
              type: 'table',
              data: {
                rows: [
                  {
                    cells: [
                      {
                        type: 'data',
                        blocks: [
                          {
                            type: 'paragraph',
                            data: {size: 'large', text: 'Cell.'},
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          ],
        }}
      />
    );
    expect(screen.queryByTestId('lexical')).toBeTruthy();
  });

  test('keeps the lexical editor once a size has been seen', () => {
    userPreferences.EnableEditorJSEditor = true;
    const value = {
      version: '1',
      time: 0,
      blocks: [{type: 'paragraph', data: {size: 'small', text: 'Hi.'}}],
    };
    const {rerender} = render(<RichTextEditor value={value} />);
    expect(screen.queryByTestId('lexical')).toBeTruthy();

    // Removing the last sized paragraph must not swap the editor mid-edit.
    rerender(
      <RichTextEditor
        value={{...value, blocks: [{type: 'paragraph', data: {text: 'Hi.'}}]}}
      />
    );
    expect(screen.queryByTestId('lexical')).toBeTruthy();
    expect(screen.queryByTestId('editorjs')).toBeNull();
  });
});
