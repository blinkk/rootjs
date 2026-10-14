import '../../styles/global.css';
import '../../styles/mantine.css';
import '../../styles/theme.css';
import './PortTranslationsModal.css';

import {MantineProvider} from '@mantine/core';
import {ContextModalProps, ModalsProvider} from '@mantine/modals';
import {cleanup, render} from '@testing-library/preact';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {page} from 'vitest/browser';
import {
  PortTranslationsModal,
  PortTranslationsModalProps,
} from './PortTranslationsModal.js';

vi.mock('../../utils/actions.js', () => ({
  logAction: vi.fn(),
}));

window.__ROOT_CTX = {
  rootConfig: {
    i18n: {
      locales: ['en', 'de', 'es', 'fr', 'ja'],
    },
  },
} as any;

const OLD_SOURCE = '© 2025 Google LLC. All rights reserved.';
const NEW_SOURCE = '© 2026 Google LLC. All rights reserved!';

/** Returns the ported translation textarea values, keyed by language. */
function getPortedValues(): Record<string, string> {
  const values: Record<string, string> = {};
  document
    .querySelectorAll('.PortTranslationsModal__table tbody tr')
    .forEach((row) => {
      const lang = row.querySelector('.PortTranslationsModal__table__lang');
      const textarea = row.querySelector('textarea');
      if (lang && textarea) {
        values[lang.textContent || ''] = textarea.value;
      }
    });
  return values;
}

function renderModal(overrides?: Partial<PortTranslationsModalProps>) {
  const closeModal = vi.fn();
  const onSave = vi.fn().mockResolvedValue(undefined);
  const props: ContextModalProps<PortTranslationsModalProps> = {
    context: {closeModal} as any,
    id: 'test-modal',
    innerProps: {
      id: 'Pages/index',
      targetSource: NEW_SOURCE,
      targetTranslations: {fr: '© 2026 Google LLC. Tous droits réservés.'},
      languages: ['de', 'es', 'fr', 'ja'],
      loadCandidates: async () => [
        {source: 'Contact us', translations: {de: 'Kontakt'}},
        {
          source: OLD_SOURCE,
          translations: {
            de: '© 2025 Google LLC. Alle Rechte vorbehalten.',
            es: '© 2025 Google LLC. Todos los derechos reservados.',
            fr: '© 2025 Google LLC. Tous droits réservés.',
          },
          label: 'unused',
        },
      ],
      lookupSource: async () => null,
      onSave,
      ...overrides,
    },
  };
  render(
    <MantineProvider>
      <ModalsProvider>
        <div
          data-testid="wrapper"
          style={{width: 960, padding: 20, background: '#fff'}}
        >
          <PortTranslationsModal {...props} />
        </div>
      </ModalsProvider>
    </MantineProvider>
  );
  return {onSave, closeModal};
}

describe('PortTranslationsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('ports translations with carried-over edits and rules', async () => {
    await page.viewport(1200, 1000);
    const {onSave, closeModal} = renderModal();
    const wrapper = page.getByTestId('wrapper');

    // The most similar candidate is preselected and the year change is
    // carried over to each translation.
    await expect
      .element(wrapper.getByText('applied in 3 of 3 languages'))
      .toBeVisible();
    expect(getPortedValues()).toEqual({
      de: '© 2026 Google LLC. Alle Rechte vorbehalten.',
      es: '© 2026 Google LLC. Todos los derechos reservados.',
      fr: '© 2026 Google LLC. Tous droits réservés.',
    });
    await expect.element(wrapper.getByText('replaces existing')).toBeVisible();

    // Add a find/replace rule.
    await wrapper.getByRole('button', {name: 'Add find/replace rule'}).click();
    await wrapper.getByPlaceholder('Find', {exact: true}).fill('Todos los');
    await wrapper.getByPlaceholder('Replace', {exact: true}).fill('Todos');
    await vi.waitFor(() =>
      expect(getPortedValues().es).toBe(
        '© 2026 Google LLC. Todos derechos reservados.'
      )
    );

    await expect
      .element(wrapper)
      .toMatchScreenshot('port-translations-modal.png');

    // Languages with an existing translation (fr) aren't selected by default.
    await wrapper.getByRole('button', {name: 'Port 2 translations'}).click();
    expect(onSave).toHaveBeenCalledWith({
      de: '© 2026 Google LLC. Alle Rechte vorbehalten.',
      es: '© 2026 Google LLC. Todos derechos reservados.',
    });
    await vi.waitFor(() => expect(closeModal).toHaveBeenCalled());
  });

  it('shows an error for invalid regex rules', async () => {
    await page.viewport(1200, 1000);
    renderModal();
    const wrapper = page.getByTestId('wrapper');
    await expect
      .element(wrapper.getByText('applied in 3 of 3 languages'))
      .toBeVisible();
    await wrapper.getByRole('button', {name: 'Add find/replace rule'}).click();
    await wrapper.getByRole('checkbox', {name: 'Regex'}).click();
    await wrapper.getByPlaceholder('Find (regex)').fill('(');
    await expect
      .element(wrapper.getByText(/Invalid regular expression/))
      .toBeVisible();
  });
});
