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
});
