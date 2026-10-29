import '../../../../../../styles/tailwind.out.css';
import '../LexicalEditor.css';
import '../../../../../../styles/global.css';
import '../../../../../../styles/theme.css';

import {cleanup, render} from '@testing-library/preact';
import {afterEach, describe, expect, it, vi} from 'vitest';
import * as schema from '../../../../../../../core/schema.js';
import {ModalsProvider} from '../../../../../../primitives/modals/ModalsProvider.js';
import {DeeplinkProvider} from '../../../../useDeeplink.js';
import {BlockComponentModal} from './BlockComponentModal.js';

// Mock the context.
window.__ROOT_CTX = {
  experiments: {},
  rootConfig: {projectId: 'test-project'},
  collections: {},
} as any;

vi.mock(
  '../../../../../translations/components/EditTranslationsModal/EditTranslationsModal.js',
  () => ({
    useEditTranslationsModal: () => ({open: vi.fn()}),
  })
);

const carouselSchema = schema.define({
  name: 'MediaCarousel',
  label: 'Media Carousel',
  fields: [
    schema.array({
      id: 'slides',
      label: 'Slides',
      of: schema.object({
        fields: [schema.string({id: 'title', label: 'Title'})],
      }),
    }),
  ],
}) as unknown as schema.Schema;

function renderModal(initialValue: Record<string, any>) {
  return render(
    <ModalsProvider>
      <DeeplinkProvider>
        <BlockComponentModal
          schema={carouselSchema}
          opened={true}
          initialValue={initialValue}
          mode="edit"
          onClose={() => {}}
          onSubmit={() => {}}
        />
      </DeeplinkProvider>
    </ModalsProvider>
  );
}

describe('BlockComponentModal', () => {
  afterEach(() => cleanup());

  it('renders items after close+reopen (array-map preserved)', async () => {
    const initialValue = {
      slides: {
        _array: ['k1', 'k2'],
        k1: {title: 'Slide 1'},
        k2: {title: 'Slide 2'},
      },
    };
    // First open.
    const first = renderModal(initialValue);
    await vi.waitFor(
      () => {
        const items = document.body.querySelectorAll(
          '.DocEditor__ArrayField__item'
        );
        expect(items.length).toBe(2);
      },
      {timeout: 2000}
    );
    // Close (unmount).
    first.unmount();
    cleanup();
    // Reopen with the same data (simulates close+reopen without editing).
    renderModal(initialValue);
    await vi.waitFor(
      () => {
        const items = document.body.querySelectorAll(
          '.DocEditor__ArrayField__item'
        );
        expect(items.length).toBe(2);
      },
      {timeout: 2000}
    );
  });
});
