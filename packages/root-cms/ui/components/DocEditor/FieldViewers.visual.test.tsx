import '../../styles/global.css';
import '../../styles/mantine.css';
import '../../styles/theme.css';

import {MantineProvider} from '@mantine/core';
import {cleanup, fireEvent, render} from '@testing-library/preact';
import {useRef} from 'preact/hooks';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {page} from 'vitest/browser';
import * as schema from '../../../core/schema.js';
import {DeeplinkProvider} from '../../hooks/useDeeplink.js';
import {
  DraftDocContext,
  DraftDocContextProvider,
} from '../../hooks/useDraftDoc.js';
import {ViewersProvider} from '../../hooks/useViewers.js';
import {InMemoryDraftDocController} from '../RichTextEditor/lexical/utils/InMemoryDraftDocController.js';
import {Viewers} from '../Viewers/Viewers.js';
import {DocEditor} from './DocEditor.js';

const {mockOnSnapshot, mockSetDoc} = vi.hoisted(() => {
  return {mockOnSnapshot: vi.fn(), mockSetDoc: vi.fn()};
});

vi.mock('firebase/firestore', async (importOriginal) => {
  const mod = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...mod,
    doc: vi.fn(),
    onSnapshot: mockOnSnapshot,
    setDoc: mockSetDoc,
    updateDoc: vi.fn(),
    serverTimestamp: vi.fn(),
    Timestamp: {
      now: () => ({toMillis: () => Date.now()}),
    },
  };
});

window.__ROOT_CTX = {
  experiments: {},
  rootConfig: {projectId: 'test-project'},
  collections: {},
} as any;

window.firebase = {
  db: {},
  user: {email: 'me@example.com', photoURL: ''},
} as any;

const fields = [
  schema.string({id: 'title', label: 'Title'}),
  schema.string({id: 'body', label: 'Body'}),
] as schema.FieldWithId[];

/** Mocks the presence doc with a single other viewer. */
function mockViewer(focusedField: string | null) {
  const nowMillis = Date.now();
  mockOnSnapshot.mockImplementation((ref, callback) => {
    callback({
      data: () => ({
        'other@example.com': {
          email: 'other@example.com',
          photoURL: '',
          lastViewedAt: {toMillis: () => nowMillis},
          focusedField,
        },
      }),
    });
    return () => {};
  });
}

function TestEditor(props: {onViewerClick?: () => void}) {
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={rootRef} data-testid="editor">
      <DocEditor.FocusTracker rootRef={rootRef} />
      <Viewers
        id="doc/Pages/foo"
        onViewerClick={props.onViewerClick}
        getFieldLabel={(deepKey) => deepKey.split('.').pop()!}
      />
      {fields.map((field) => (
        <DocEditor.Field
          key={field.id}
          field={field}
          deepKey={`fields.${field.id}`}
        />
      ))}
    </div>
  );
}

function renderEditor(props: {onViewerClick?: () => void} = {}) {
  const controller = new InMemoryDraftDocController({}, 'test');
  const draftContext = {
    loading: false,
    controller: controller as unknown as DraftDocContext['controller'],
  } as DraftDocContext;
  render(
    <MantineProvider>
      <ViewersProvider id="doc/Pages/foo">
        <DeeplinkProvider>
          <DraftDocContextProvider value={draftContext}>
            <TestEditor {...props} />
          </DraftDocContextProvider>
        </DeeplinkProvider>
      </ViewersProvider>
    </MantineProvider>
  );
}

function getHeader(deepKey: string) {
  return document.querySelector<HTMLElement>(
    `[data-field-header-for="${deepKey}"]`
  )!;
}

describe('DocEditor field viewers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows avatars next to the field another user is focused on', async () => {
    mockViewer('fields.body');
    renderEditor();

    await expect
      .poll(() =>
        getHeader('fields.body').querySelector(
          '.DocEditor__FieldHeader__viewers'
        )
      )
      .toBeTruthy();
    expect(
      getHeader('fields.body').classList.contains(
        'DocEditor__FieldHeader--hasViewers'
      )
    ).toBe(true);
    expect(
      getHeader('fields.title').querySelector(
        '.DocEditor__FieldHeader__viewers'
      )
    ).toBeNull();
  });

  it('reports the focused field for the current user', async () => {
    mockViewer(null);
    renderEditor();

    const input = document.querySelector<HTMLInputElement>(
      '[id="fields.title"] input, [id="fields.title"] textarea'
    )!;
    input.focus();

    await expect
      .poll(() =>
        mockSetDoc.mock.calls.some(
          (call) => call[1]?.['me@example.com']?.focusedField === 'fields.title'
        )
      )
      .toBe(true);
  });

  it('deeplinks to the field when clicking a viewer avatar', async () => {
    mockViewer('fields.body');
    const onViewerClick = vi.fn();
    renderEditor({onViewerClick});

    const button = page.getByRole('button', {
      name: 'Go to the field other@example.com is editing',
    });
    await expect.element(button).toBeVisible();

    await button.hover();
    await expect.element(page.getByText('Editing: body')).toBeVisible();

    fireEvent.click(button.element());
    expect(onViewerClick).toHaveBeenCalledWith(
      expect.objectContaining({email: 'other@example.com'}),
      'fields.body'
    );
  });

  it('does not make avatars clickable when the viewer has no focused field', async () => {
    mockViewer(null);
    renderEditor({onViewerClick: vi.fn()});

    await expect
      .poll(() => document.querySelector('.Viewers .UserAvatar'))
      .toBeTruthy();
    expect(document.querySelector('.Viewers__button')).toBeNull();
  });
});
