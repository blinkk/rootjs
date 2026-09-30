import '../../styles/global.css';
import '../../styles/mantine.css';
import '../../styles/theme.css';

import {MantineProvider} from '@mantine/core';
import {ModalsProvider} from '@mantine/modals';
import {cleanup, fireEvent, render} from '@testing-library/preact';
import {afterEach, describe, expect, it, vi} from 'vitest';
import * as schema from '../../../core/schema.js';
import {DeeplinkProvider} from '../../hooks/useDeeplink.js';
import {
  DraftDocContext,
  DraftDocContextProvider,
} from '../../hooks/useDraftDoc.js';
import {ComponentPickerModal} from '../ComponentPickerModal/ComponentPickerModal.js';
import {InMemoryDraftDocController} from '../RichTextEditor/lexical/utils/InMemoryDraftDocController.js';
import {DocEditor} from './DocEditor.js';

// Mock the context.
window.__ROOT_CTX = {
  experiments: {},
  rootConfig: {projectId: 'test-project'},
  collections: {},
} as any;

vi.mock('../EditTranslationsModal/EditTranslationsModal.js', () => ({
  useEditTranslationsModal: () => ({open: vi.fn()}),
}));

const heroSchema = schema.define({
  name: 'Hero',
  label: 'Hero',
  fields: [schema.string({id: 'headline', label: 'Headline'})],
  presets: [
    {id: 'welcome', label: 'Welcome hero', data: {headline: 'Welcome!'}},
  ],
}) as unknown as schema.Schema;

const textSchema = schema.define({
  name: 'Text',
  label: 'Text',
  fields: [schema.string({id: 'body', label: 'Body'})],
}) as unknown as schema.Schema;

function modulesField(variant: 'dropdown' | 'picker'): schema.ArrayField {
  return schema.array({
    id: 'modules',
    label: 'Modules',
    of: schema.oneOf({types: [heroSchema, textSchema], variant}),
  }) as schema.ArrayField;
}

function renderArrayField(field: schema.ArrayField) {
  const controller = new InMemoryDraftDocController({}, 'test');
  const draftContext = {
    loading: false,
    controller: controller as unknown as DraftDocContext['controller'],
  } as DraftDocContext;
  render(
    <MantineProvider>
      <ModalsProvider
        modals={{[ComponentPickerModal.id]: ComponentPickerModal}}
      >
        <DeeplinkProvider>
          <DraftDocContextProvider value={draftContext}>
            <DocEditor.ArrayField field={field} deepKey="modules" />
          </DraftDocContextProvider>
        </DeeplinkProvider>
      </ModalsProvider>
    </MantineProvider>
  );
  return controller;
}

function clickAdd() {
  const button = document.body.querySelector<HTMLButtonElement>(
    '.DocEditor__ArrayField__add__button'
  );
  fireEvent.click(button!);
}

function getItems(controller: InMemoryDraftDocController) {
  const value = controller.getValue('modules') || {};
  return (value._array || []).map((key: string) => value[key]);
}

async function waitForPickerCards() {
  let cards: NodeListOf<HTMLButtonElement> | undefined;
  await vi.waitFor(
    () => {
      cards = document.body.querySelectorAll<HTMLButtonElement>(
        '.ComponentPickerModal__Card'
      );
      expect(cards.length).toBeGreaterThan(0);
    },
    {timeout: 2000}
  );
  return Array.from(cards!);
}

describe('DocEditor.ArrayField', () => {
  afterEach(() => cleanup());

  it('opens the picker on "Add" for oneOf picker items', async () => {
    const controller = renderArrayField(modulesField('picker'));
    clickAdd();

    const cards = await waitForPickerCards();
    // Nothing is added until a component is selected.
    expect(getItems(controller)).toEqual([]);

    const presetCard = cards.find((card) =>
      card.textContent?.includes('Welcome hero')
    );
    fireEvent.click(presetCard!);

    await vi.waitFor(
      () => {
        expect(getItems(controller)).toEqual([
          {_type: 'Hero', headline: 'Welcome!'},
        ]);
      },
      {timeout: 2000}
    );
  });

  it('adds a blank item on "Add" for oneOf dropdown items', async () => {
    const controller = renderArrayField(modulesField('dropdown'));
    clickAdd();

    await vi.waitFor(
      () => {
        expect(getItems(controller)).toEqual([{}]);
      },
      {timeout: 2000}
    );
    expect(
      document.body.querySelector('.ComponentPickerModal__Card')
    ).toBeNull();
  });
});
