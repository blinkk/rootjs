import {render, fireEvent, screen, cleanup} from '@testing-library/preact';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {EditTranslationsModal} from './EditTranslationsModal.js';

const mockCloseModal = vi.fn();
const mockLoadTranslations = vi.fn();
const mockCmsDocImportTranslations = vi.fn();

vi.mock('../../utils/l10n.js', () => ({
  loadTranslations: (...args: any[]) => mockLoadTranslations(...args),
}));

vi.mock('../../utils/doc.js', () => ({
  cmsDocImportTranslations: (...args: any[]) =>
    mockCmsDocImportTranslations(...args),
}));

vi.mock('@mantine/core', async () => {
  const actual: any = await vi.importActual('@mantine/core');
  return {
    ...actual,
    Button: ({children, onClick, ...props}: any) => (
      <button onClick={onClick} {...props}>
        {children}
      </button>
    ),
    Checkbox: ({label, checked, onChange}: any) => (
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={onChange}
      />
    ),
    Textarea: ({value, onChange, placeholder}: any) => (
      <textarea value={value} onChange={onChange} placeholder={placeholder} />
    ),
    Tooltip: ({children}: any) => <div>{children}</div>,
    Loader: () => <div>Loading...</div>,
  };
});

vi.mock('@mantine/notifications', () => ({
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
      draft: mockDraft,
    },
    context: {closeModal: mockCloseModal},
    id: 'modal-id',
  };

  it('should load translation metadata from draft controller', async () => {
    mockDraft.controller.getValue.mockReturnValue({
      disableTranslations: true,
      description: 'Keep it simple',
    });

    render(<EditTranslationsModal {...defaultProps} />);

    await vi.waitFor(() => {
      expect(mockDraft.controller.getValue).toHaveBeenCalledWith(
        'fields.@title'
      );
    });
  });

  it('should render "Do not translate" checkbox', async () => {
    render(<EditTranslationsModal {...defaultProps} />);

    await vi.waitFor(() => {
      const checkbox = screen.getByLabelText('Do not translate');
      expect(checkbox).toBeTruthy();
    });
  });

  it('should render "Translator notes" textarea', async () => {
    render(<EditTranslationsModal {...defaultProps} />);

    await vi.waitFor(() => {
      const textarea = screen.getByPlaceholderText(
        'Add context or notes for translators...'
      );
      expect(textarea).toBeTruthy();
    });
  });

  it('should hide translation table when "Do not translate" is checked', async () => {
    mockDraft.controller.getValue.mockReturnValue({
      disableTranslations: true,
    });

    render(<EditTranslationsModal {...defaultProps} />);

    await vi.waitFor(() => {
      const sourceHeader = screen.queryByText('SOURCE');
      expect(sourceHeader).toBeFalsy();
    });
  });

  it('should save metadata when save is clicked', async () => {
    mockDraft.controller.getValue.mockReturnValue({});

    render(<EditTranslationsModal {...defaultProps} />);

    await vi.waitFor(() => screen.getByLabelText('Do not translate'));

    const checkbox = screen.getByLabelText(
      'Do not translate'
    ) as HTMLInputElement;
    fireEvent.change(checkbox, {target: {checked: true}});

    const textarea = screen.getByPlaceholderText(
      'Add context or notes for translators...'
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, {target: {value: 'Important context'}});

    const saveButton = screen.getByText('Save') as HTMLButtonElement;
    fireEvent.click(saveButton);

    await vi.waitFor(() => {
      expect(mockDraft.controller.updateKey).toHaveBeenCalledWith(
        'fields.@title',
        expect.objectContaining({
          disableTranslations: true,
          description: 'Important context',
        })
      );
      expect(mockDraft.controller.flush).toHaveBeenCalled();
    });
  });

  it('should not import translations when disableTranslations is true', async () => {
    mockDraft.controller.getValue.mockReturnValue({});

    render(<EditTranslationsModal {...defaultProps} />);

    await vi.waitFor(() => screen.getByLabelText('Do not translate'));

    const checkbox = screen.getByLabelText(
      'Do not translate'
    ) as HTMLInputElement;
    fireEvent.change(checkbox, {target: {checked: true}});

    const saveButton = screen.getByText('Save') as HTMLButtonElement;
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
    expect(screen.getByText('Save')).toBeTruthy();
  });
});
