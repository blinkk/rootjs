import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createGoogleTools} from '../../../core/ai-tools-google.js';
import {
  createClientGoogleToolBackend,
  extractDocSuggestions,
  extractSlides,
  limitSlides,
  parseGoogleFileRef,
} from './clientGoogleTools.js';

vi.mock('../../utils/google-auth.js', () => ({
  clearGoogleAccessToken: vi.fn(),
  ensureGoogleAccessToken: vi.fn(async () => 'test-token'),
  getGoogleAccessToken: vi.fn(() => 'test-token'),
  isGoogleApiEnabled: vi.fn(() => true),
}));

const SLIDES_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz';

/** Builds a Slides API text shape. */
function textShape(
  objectId: string,
  content: string,
  options?: {placeholder?: string; x?: number; y?: number}
) {
  return {
    objectId,
    transform: {translateX: options?.x || 0, translateY: options?.y || 0},
    shape: {
      ...(options?.placeholder
        ? {placeholder: {type: options.placeholder}}
        : {}),
      text: {textElements: [{textRun: {content}}]},
    },
  };
}

/** Builds a slide whose speaker notes contain `notes`. */
function slideWithNotes(objectId: string, pageElements: any[], notes: string) {
  return {
    objectId,
    pageElements,
    slideProperties: {
      notesPage: {
        notesProperties: {speakerNotesObjectId: `${objectId}-notes`},
        pageElements: [
          textShape(`${objectId}-notes-image`, 'ignored'),
          textShape(`${objectId}-notes`, notes),
        ],
      },
    },
  };
}

describe('parseGoogleFileRef', () => {
  it('parses Docs, Sheets and Slides URLs', () => {
    expect(
      parseGoogleFileRef(`https://docs.google.com/document/d/${SLIDES_ID}/edit`)
    ).toEqual({fileId: SLIDES_ID});
    expect(
      parseGoogleFileRef(
        `https://docs.google.com/spreadsheets/d/${SLIDES_ID}/edit#gid=123`
      )
    ).toEqual({fileId: SLIDES_ID, gid: 123});
    expect(
      parseGoogleFileRef(
        `https://docs.google.com/presentation/d/${SLIDES_ID}/edit#slide=id.g2a_3`
      )
    ).toEqual({fileId: SLIDES_ID, slideId: 'g2a_3'});
  });

  it('accepts bare file ids and rejects other input', () => {
    expect(parseGoogleFileRef(SLIDES_ID)).toEqual({fileId: SLIDES_ID});
    expect(parseGoogleFileRef('https://example.com/d/abc')).toBeNull();
    expect(parseGoogleFileRef('')).toBeNull();
  });
});

describe('extractSlides', () => {
  it('extracts titles, text in reading order, and speaker notes', () => {
    const slides = extractSlides(
      {
        slides: [
          slideWithNotes(
            's1',
            [
              textShape('body', 'Body copy\n', {placeholder: 'BODY', y: 200}),
              textShape('title', 'Welcome\n', {placeholder: 'TITLE', y: 10}),
              textShape('right', 'Right column', {x: 500, y: 100}),
              textShape('left', 'Left column', {x: 0, y: 100}),
            ],
            'Say hello.\n'
          ),
        ],
      },
      undefined
    );
    expect(slides).toEqual([
      {
        slideNumber: 1,
        objectId: 's1',
        title: 'Welcome',
        text: 'Left column\n\nRight column\n\nBody copy',
        notes: 'Say hello.',
      },
    ]);
  });

  it('renders bullets, links, tables, groups and image alt text', () => {
    const [slide] = extractSlides(
      {
        slides: [
          {
            objectId: 's1',
            slideProperties: {isSkipped: true},
            pageElements: [
              {
                objectId: 'list',
                transform: {translateY: 0},
                shape: {
                  text: {
                    textElements: [
                      {paragraphMarker: {bullet: {listId: 'l'}}},
                      {textRun: {content: 'First\n'}},
                      {
                        paragraphMarker: {
                          bullet: {listId: 'l', nestingLevel: 1},
                        },
                      },
                      {
                        textRun: {
                          content: 'Docs\n',
                          style: {link: {url: 'https://example.com'}},
                        },
                      },
                      {autoText: {type: 'SLIDE_NUMBER'}},
                    ],
                  },
                },
              },
              {
                objectId: 'table',
                transform: {translateY: 100},
                table: {
                  tableRows: [
                    {
                      tableCells: [
                        {text: {textElements: [{textRun: {content: 'A\n'}}]}},
                        {text: {textElements: [{textRun: {content: 'B\n'}}]}},
                      ],
                    },
                    {tableCells: [{}, {}]},
                  ],
                },
              },
              {
                objectId: 'group',
                transform: {translateY: 200},
                elementGroup: {
                  children: [textShape('child', 'Grouped\u000bline')],
                },
              },
              {
                objectId: 'image',
                transform: {translateY: 300},
                description: 'A red car',
                image: {contentUrl: 'https://example.com/car.png'},
              },
              {
                objectId: 'bare-image',
                transform: {translateY: 400},
                image: {},
              },
            ],
          },
        ],
      },
      's1'
    );
    expect(slide).toEqual({
      slideNumber: 1,
      objectId: 's1',
      text: [
        '- First\n  - [Docs](https://example.com)',
        'A | B',
        'Grouped\nline',
        '[Image: A red car]',
      ].join('\n\n'),
      skipped: true,
      linked: true,
    });
  });
});

describe('limitSlides', () => {
  const slides = [
    {slideNumber: 1, objectId: 'a', title: 'One', text: 'aaaa'},
    {slideNumber: 2, objectId: 'b', text: 'bbbb', notes: 'nnnn'},
    {slideNumber: 3, objectId: 'c', text: 'cccc'},
  ];

  it('returns every slide when under the limit', () => {
    expect(limitSlides(slides, 100)).toEqual({slides, truncated: false});
  });

  it('cuts the slide that crosses the limit and drops the rest', () => {
    expect(limitSlides(slides, 10)).toEqual({
      slides: [slides[0], {slideNumber: 2, objectId: 'b', text: 'bbb'}],
      truncated: true,
    });
    expect(limitSlides(slides, 13)).toEqual({
      slides: [slides[0], {...slides[1], notes: 'nn'}],
      truncated: true,
    });
  });
});

describe('gslides_get', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  function jsonResponse(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: {'Content-Type': 'application/json'},
    });
  }

  const driveMetadata = {
    id: SLIDES_ID,
    name: 'Launch deck',
    mimeType: 'application/vnd.google-apps.presentation',
    webViewLink: `https://docs.google.com/presentation/d/${SLIDES_ID}/edit`,
  };

  async function runTool(url: string) {
    const tools = createGoogleTools(createClientGoogleToolBackend());
    return await (tools.gslides_get as any).execute(
      {url, maxChars: 20000},
      {toolCallId: 'call-1', messages: []}
    );
  }

  it('reads a deck via the Slides API with the user token', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('https://www.googleapis.com/drive/v3/files/')) {
        return jsonResponse(driveMetadata);
      }
      if (url.startsWith('https://slides.googleapis.com/v1/presentations/')) {
        return jsonResponse({
          slides: [
            {
              objectId: 'p1',
              pageElements: [textShape('t', 'Hi', {placeholder: 'TITLE'})],
            },
          ],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await runTool(
      `https://docs.google.com/presentation/d/${SLIDES_ID}/edit#slide=id.p1`
    );
    expect(result).toEqual({
      success: true,
      presentation: {
        fileId: SLIDES_ID,
        name: 'Launch deck',
        mimeType: 'application/vnd.google-apps.presentation',
        url: driveMetadata.webViewLink,
        slides: [
          {slideNumber: 1, objectId: 'p1', title: 'Hi', text: '', linked: true},
        ],
        slideCount: 1,
        truncated: false,
      },
    });
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers.Authorization).toBe('Bearer test-token');
    }
  });

  it('falls back to a Drive text export when the Slides API is disabled', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/export?')) {
        return new Response('Slide one text');
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files/')) {
        return jsonResponse(driveMetadata);
      }
      return jsonResponse(
        {
          error: {
            code: 403,
            message: 'Google Slides API has not been used in project 123.',
            errors: [{reason: 'accessNotConfigured'}],
          },
        },
        403
      );
    });

    const result = await runTool(SLIDES_ID);
    expect(result.success).toBe(true);
    expect(result.presentation.slides).toEqual([]);
    expect(result.presentation.text).toBe('Slide one text');
  });

  it('points at the right tool for non-Slides files', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ...driveMetadata,
        mimeType: 'application/vnd.google-apps.document',
      })
    );
    const result = await runTool(SLIDES_ID);
    expect(result).toMatchObject({
      success: false,
      error: 'GOOGLE_UNSUPPORTED_FILE',
      hint: 'Call `gdoc_get` for this file instead.',
    });
  });

  it('reports a disabled API as not configured instead of permission denied', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 403,
            status: 'PERMISSION_DENIED',
            message: 'Google Drive API has not been used in project 123.',
            details: [{reason: 'SERVICE_DISABLED'}],
          },
        },
        403
      )
    );
    const result = await runTool(SLIDES_ID);
    expect(result).toMatchObject({
      success: false,
      error: 'GOOGLE_NOT_CONFIGURED',
    });
  });
});

describe('extractDocSuggestions', () => {
  /** Builds a Docs API text run element. */
  function run(
    content: string,
    options?: {insert?: string[]; remove?: string[]}
  ) {
    return {
      textRun: {
        content,
        ...(options?.insert ? {suggestedInsertionIds: options.insert} : {}),
        ...(options?.remove ? {suggestedDeletionIds: options.remove} : {}),
      },
    };
  }

  it('returns before/after text for paragraphs with suggestions', () => {
    const edits = extractDocSuggestions({
      body: {
        content: [
          {paragraph: {elements: [run('Untouched paragraph.\n')]}},
          {
            paragraph: {
              elements: [run('Split here.'), run('\n', {insert: ['split']})],
            },
          },
          {
            paragraph: {
              elements: [
                run('Build '),
                run('fast', {remove: ['suggest.1']}),
                run('faster', {insert: ['suggest.1']}),
                run(' sites.'),
                run(' Today.', {insert: ['suggest.2']}),
                run('\n'),
              ],
            },
          },
          {
            table: {
              tableRows: [
                {
                  tableCells: [
                    {
                      content: [
                        {
                          paragraph: {
                            elements: [
                              run('Old cell', {remove: ['suggest.3']}),
                              run('\n'),
                            ],
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    });
    expect(edits).toEqual([
      {
        original: 'Build fast sites.',
        suggested: 'Build faster sites. Today.',
        changes: [
          {suggestionId: 'suggest.1', deleted: 'fast', inserted: 'faster'},
          {suggestionId: 'suggest.2', inserted: ' Today.'},
        ],
      },
      {
        original: 'Old cell',
        suggested: '',
        changes: [{suggestionId: 'suggest.3', deleted: 'Old cell'}],
      },
    ]);
  });

  it('walks child tabs and labels edits with the tab title', () => {
    const tab = (title: string, text: string, childTabs: any[] = []) => ({
      tabProperties: {title},
      documentTab: {
        body: {
          content: [
            {paragraph: {elements: [run(text, {insert: [`s-${title}`]})]}},
          ],
        },
      },
      childTabs,
    });
    const edits = extractDocSuggestions({
      tabs: [tab('Intro', 'A'), tab('FAQ', 'B', [tab('More', 'C')])],
    });
    expect(edits.map((edit) => [edit.tab, edit.suggested])).toEqual([
      ['Intro', 'A'],
      ['FAQ', 'B'],
      ['More', 'C'],
    ]);
  });
});

describe('gdoc_getFeedback', () => {
  const fetchMock = vi.fn();
  const DOC_ID = SLIDES_ID;

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  function jsonResponse(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: {'Content-Type': 'application/json'},
    });
  }

  const driveMetadata = {
    id: DOC_ID,
    name: 'Homepage copy',
    mimeType: 'application/vnd.google-apps.document',
    webViewLink: `https://docs.google.com/document/d/${DOC_ID}/edit`,
  };

  const commentsPage = {
    comments: [
      {
        id: 'c1',
        author: {displayName: 'Ada'},
        content: 'Make this punchier.',
        quotedFileContent: {value: 'Build fast sites.'},
        resolved: false,
        replies: [
          {author: {displayName: 'Bo'}, content: 'Agreed.'},
          {author: {displayName: 'Cy'}, content: '', deleted: true},
        ],
      },
      {
        id: 'c2',
        author: {displayName: 'Ada'},
        content: 'Done already.',
        resolved: true,
        replies: [
          {author: {displayName: 'Bo'}, content: '', action: 'resolve'},
        ],
      },
      {id: 'c3', deleted: true},
    ],
  };

  async function runTool(input: Record<string, unknown>) {
    const tools = createGoogleTools(createClientGoogleToolBackend());
    return await (tools.gdoc_getFeedback as any).execute(
      {url: DOC_ID, includeResolved: false, maxItems: 100, ...input},
      {toolCallId: 'call-1', messages: []}
    );
  }

  it('returns open comments and suggested edits', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/comments?')) {
        return jsonResponse(commentsPage);
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files/')) {
        return jsonResponse(driveMetadata);
      }
      if (url.startsWith('https://docs.googleapis.com/v1/documents/')) {
        expect(url).toContain('suggestionsViewMode=SUGGESTIONS_INLINE');
        return jsonResponse({
          tabs: [
            {
              documentTab: {
                body: {
                  content: [
                    {
                      paragraph: {
                        elements: [
                          {
                            textRun: {
                              content: 'Hello',
                              suggestedInsertionIds: ['s1'],
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          ],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await runTool({});
    expect(result).toEqual({
      success: true,
      feedback: {
        fileId: DOC_ID,
        name: 'Homepage copy',
        mimeType: 'application/vnd.google-apps.document',
        url: driveMetadata.webViewLink,
        comments: [
          {
            id: 'c1',
            author: 'Ada',
            content: 'Make this punchier.',
            quotedText: 'Build fast sites.',
            resolved: false,
            replies: [{author: 'Bo', content: 'Agreed.'}],
          },
        ],
        commentsTruncated: false,
        suggestedEdits: [
          {
            original: '',
            suggested: 'Hello',
            changes: [{suggestionId: 's1', inserted: 'Hello'}],
          },
        ],
        suggestedEditsTruncated: false,
      },
    });
  });

  it('includes resolved threads on request and still returns comments when the Docs API is disabled', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/comments?')) {
        return jsonResponse(commentsPage);
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files/')) {
        return jsonResponse(driveMetadata);
      }
      return jsonResponse(
        {
          error: {
            code: 403,
            message: 'Google Docs API has not been used in project 123.',
            errors: [{reason: 'accessNotConfigured'}],
          },
        },
        403
      );
    });

    const result = await runTool({includeResolved: true});
    expect(result.success).toBe(true);
    expect(result.feedback.comments.map((c: any) => c.id)).toEqual([
      'c1',
      'c2',
    ]);
    expect(result.feedback.comments[1].replies).toEqual([
      {author: 'Bo', content: '', action: 'resolve'},
    ]);
    expect(result.feedback.suggestedEdits).toEqual([]);
    expect(result.feedback.suggestionsError).toContain('Google Docs API');
  });

  it('rejects files that are not Google Docs', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ...driveMetadata,
        mimeType: 'application/vnd.google-apps.spreadsheet',
      })
    );
    const result = await runTool({});
    expect(result).toMatchObject({
      success: false,
      error: 'GOOGLE_UNSUPPORTED_FILE',
      hint: 'Call `gsheet_get` for this file instead.',
    });
  });
});
