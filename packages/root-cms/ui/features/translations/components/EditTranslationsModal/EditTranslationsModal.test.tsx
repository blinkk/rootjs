import {render, fireEvent, screen, cleanup} from '@testing-library/preact';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import type {ModalsContextProps} from '../../../../primitives/modals/ModalsProvider.js';
import {
  EditTranslationsModal,
  type EditTranslationsModalProps,
} from './EditTranslationsModal.js';

const mockCloseModal = vi.fn();
const mockLoadTranslations = vi.fn();
const mockCmsDocImportTranslations = vi.fn();

vi.mock('../../l10n.js', () => ({
  loadTranslations: (...args: any[]) => mockLoadTranslations(...args),
  toTranslationLanguages: (locales: string[]) => locales,
  getTranslationForLanguage: (
    translations: Record<string, string>,
    lang: string
  ) => translations?.[lang] || '',
}));

vi.mock('../../../documents/doc.js', () => ({
  cmsDocImportTranslations: (...args: any[]) =>
    mockCmsDocImportTranslations(...args),
}));

vi.mock('../PortTranslationsModal/PortTranslationsModal.js', () => ({
  usePortTranslationsModal: () => ({open: vi.fn()}),
}));

vi.mock('../../../../primitives/Toast/toastStore.js', () => ({
  showNotification: vi.fn(),
  updateNotification: vi.fn(),
}));

describe('EditTranslationsModal', () => {
  const mockDraft = {
    controller: {
      getValue: vi.fn(),
      updateKey: vi.fn(),
      flush: vi.fn(),
      docId: 'Pages/test',
    },
    loading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadTranslations.mockResolvedValue({});
    mockCmsDocImportTranslations.mockResolvedValue({});
    (window as any).__ROOT_CTX = {
      rootConfig: {
        i18n: {locales: ['en', 'es', 'fr']},
      },
    };
  });

  afterEach(() => {
    cleanup();
  });

  const defaultProps = {
    innerProps: {
      docId: 'Pages/test',
      strings: ['Hello World', 'Goodbye'],
      field: {id: 'title', deepKey: 'fields.title'},
      draft: mockDraft as unknown as EditTranslationsModalProps['draft'],
    },
    context: {closeModal: mockCloseModal} as unknown as ModalsContextProps,
    id: 'modal-id',
  };

  it('should hide translation table when "Do not translate" is checked', async () => {
    mockDraft.controller.getValue.mockReturnValue({
      translate: false,
    });

    render(<EditTranslationsModal {...defaultProps} />);

    // Wait for the translations to load, then check the table is hidden.
    await vi.waitFor(() => screen.getByLabelText('Do not translate'));
    expect(
      (screen.getByLabelText('Do not translate') as HTMLInputElement).checked
    ).toBe(true);
    expect(screen.queryByText('SOURCE')).toBeFalsy();
    expect(screen.queryByText('Hello World')).toBeFalsy();
  });

  it('should save metadata when save is clicked', async () => {
    mockDraft.controller.getValue.mockReturnValue({});

    render(<EditTranslationsModal {...defaultProps} />);

    await vi.waitFor(() => screen.getByLabelText('Do not translate'));

    const checkbox = screen.getByLabelText(
      'Do not translate'
    ) as HTMLInputElement;
    fireEvent.click(checkbox);

    const textarea = screen.getByPlaceholderText(
      'Add context or notes for translators...'
    ) as HTMLTextAreaElement;
    fireEvent.input(textarea, {target: {value: 'Important context'}});

    const saveButton = screen.getByRole('button', {name: 'Save'});
    fireEvent.click(saveButton);

    await vi.waitFor(() => {
      expect(mockDraft.controller.updateKey).toHaveBeenCalledWith(
        'fields.@title',
        expect.objectContaining({
          translate: false,
          description: 'Important context',
        })
      );
      expect(mockDraft.controller.flush).toHaveBeenCalled();
    });
  });

  it('should not import translations when translate is false', async () => {
    mockDraft.controller.getValue.mockReturnValue({});

    render(<EditTranslationsModal {...defaultProps} />);

    await vi.waitFor(() => screen.getByLabelText('Do not translate'));

    const checkbox = screen.getByLabelText(
      'Do not translate'
    ) as HTMLInputElement;
    fireEvent.click(checkbox);

    const saveButton = screen.getByRole('button', {name: 'Save'});
    fireEvent.click(saveButton);

    await vi.waitFor(() => {
      expect(mockDraft.controller.flush).toHaveBeenCalled();
    });

    expect(mockCmsDocImportTranslations).not.toHaveBeenCalled();
  });

  it('should work without draft controller (when opened outside doc editor)', async () => {
    const propsWithoutDraft = {
      ...defaultProps,
      innerProps: {
        ...defaultProps.innerProps,
        draft: undefined,
      },
    };

    render(<EditTranslationsModal {...propsWithoutDraft} />);

    await vi.waitFor(() => {
      const checkbox = screen.getByLabelText('Do not translate');
      expect(checkbox).toBeTruthy();
    });

    // Should render but not crash
    expect(screen.getByRole('button', {name: 'Save'})).toBeTruthy();
  });
});
