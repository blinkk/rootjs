import '../../styles/global.css';
import '../../styles/theme.css';

import {cleanup, render} from '@testing-library/preact';
import {afterEach, describe, expect, it} from 'vitest';
import {RichTextData} from '../../../shared/richtext.js';
import {CommentBody} from './CommentBody.js';

afterEach(() => {
  cleanup();
});

/** A typical Google Docs share link: one unbreakable token of ~120 chars. */
const LONG_URL =
  'https://docs.google.com/document/d/1aB2cD3eF4gH5iJ6kL7mN8oP9qR0sT1uV2wX3yZ4aB5cD6eF7gH8iJ9kL0mN/edit?usp=sharing&tab=t.0#heading=h.abc123';

function richText(text: string): RichTextData {
  return {
    version: '1',
    time: 0,
    blocks: [{type: 'paragraph', data: {text}}],
  };
}

describe('CommentBody', () => {
  it('wraps long urls instead of overflowing the container', () => {
    const {container} = render(
      <div style={{width: '320px'}}>
        <CommentBody
          body={richText(
            `Please review <a href="${LONG_URL}">${LONG_URL}</a> and the plain ${LONG_URL} too.`
          )}
        />
      </div>
    );
    const body = container.querySelector<HTMLElement>('.CommentBody')!;
    expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth);
    expect(body.getBoundingClientRect().width).toBeLessThanOrEqual(320);
  });

  it('keeps mentions on a single line', () => {
    const {container} = render(
      <div style={{width: '120px'}}>
        <CommentBody
          body={richText(
            'cc <a href="mailto:alex@example.com" data-mention="alex@example.com">@Alex Example</a> thanks'
          )}
        />
      </div>
    );
    const mention = container.querySelector<HTMLElement>(
      '.CommentBody__mention'
    )!;
    expect(mention.getClientRects().length).toBe(1);
  });
});
