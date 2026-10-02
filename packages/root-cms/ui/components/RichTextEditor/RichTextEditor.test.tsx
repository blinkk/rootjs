import {cleanup, render, screen} from '@testing-library/preact';
import {afterEach, describe, expect, test, vi} from 'vitest';
import {RichTextEditor} from './RichTextEditor.js';

vi.mock('./lexical/LexicalEditor.js', () => ({
  LexicalEditor: () => <div data-testid="lexical" />,
}));

afterEach(() => {
  cleanup();
});

describe('RichTextEditor', () => {
  test('uses the lexical editor', () => {
    render(<RichTextEditor />);
    expect(screen.queryByTestId('lexical')).toBeTruthy();
  });
});
