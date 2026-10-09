import '../../styles/global.css';
import '../../styles/mantine.css';
import '../../styles/theme.css';
import './FieldHistory.css';

import {MantineProvider} from '@mantine/core';
import {render, cleanup} from '@testing-library/preact';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {page} from 'vitest/browser';
import {FieldHistory} from './FieldHistory.js';

const style = document.createElement('style');
style.textContent = `
  [data-testid="wrapper"] {
    display: flex;
    flex-direction: column;
    padding: 20px;
    background: #fff;
  }
`;
document.head.appendChild(style);

const BASE_MILLIS = 1647485978000;

function mockTimestamp(millis: number) {
  return {toDate: () => new Date(millis)};
}

function richText(blocks: any[], time: number) {
  return {blocks, time, version: '2.0.0'};
}

const DRAFT_BODY = richText(
  [
    {type: 'heading', data: {level: 2, text: 'Welcome to Root.js'}},
    {
      type: 'paragraph',
      data: {
        text: 'Build <b>fast</b> websites with a modern, flexible CMS.',
      },
    },
    {
      type: 'unorderedList',
      data: {
        style: 'unordered',
        items: [{content: 'Server-side rendering'}, {content: 'Live preview'}],
      },
    },
  ],
  BASE_MILLIS + 30000
);

const V2_BODY = richText(
  [
    {type: 'heading', data: {level: 2, text: 'Welcome to Root.js'}},
    {
      type: 'paragraph',
      data: {text: 'Build fast websites with a modern, flexible CMS.'},
    },
    {
      type: 'unorderedList',
      data: {
        style: 'unordered',
        items: [{content: 'Server-side rendering'}, {content: 'Live preview'}],
      },
    },
  ],
  BASE_MILLIS + 20000
);

const V1_BODY = richText(
  [
    {type: 'heading', data: {level: 2, text: 'Welcome'}},
    {
      type: 'paragraph',
      data: {text: 'Build websites with a flexible CMS.'},
    },
    {
      type: 'unorderedList',
      data: {
        style: 'unordered',
        items: [{content: 'Server-side rendering'}],
      },
    },
  ],
  BASE_MILLIS
);

vi.mock('../../utils/doc.js', () => ({
  cmsListVersions: vi.fn(() =>
    Promise.resolve({
      versions: [
        {
          _versionId: 'v2',
          sys: {
            modifiedAt: mockTimestamp(BASE_MILLIS + 20000),
            modifiedBy: 'editor@example.com',
          },
          fields: {body: V2_BODY},
        },
        {
          _versionId: 'v1',
          sys: {
            modifiedAt: mockTimestamp(BASE_MILLIS),
            modifiedBy: 'author@example.com',
          },
          fields: {body: V1_BODY},
        },
      ],
      lastDoc: null,
      hasMore: false,
    })
  ),
  cmsReadDocVersion: vi.fn(() =>
    Promise.resolve({
      sys: {
        modifiedAt: mockTimestamp(BASE_MILLIS + 30000),
        modifiedBy: 'current-user@example.com',
      },
      fields: {body: DRAFT_BODY},
    })
  ),
}));

function TestWrapper({children}: {children: any}) {
  return (
    <MantineProvider>
      <div data-testid="wrapper">{children}</div>
    </MantineProvider>
  );
}

beforeEach(async () => {
  await page.viewport(800, 600);
});

afterEach(() => {
  cleanup();
});

describe('FieldHistory', () => {
  it('renders rich text history as readable text', async () => {
    render(
      <TestWrapper>
        <FieldHistory
          docId="Pages/home"
          deepKey="fields.body"
          translatable={true}
        />
      </TestWrapper>
    );

    const element = page.getByTestId('wrapper');
    await expect
      .element(page.getByText('current-user@example.com'))
      .toBeVisible();
    await expect
      .element(page.getByText('Only the formatting or embedded content'))
      .toBeVisible();
    await expect
      .element(element)
      .toMatchScreenshot('field-history-richtext.png');
  });
});
