import {cleanup, fireEvent, render, waitFor} from '@testing-library/preact';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as schema from '../../../../core/schema.js';

// Mock Mantine components. The real components require a MantineProvider
// context that isn't available under @preact/compat in jsdom; these stubs keep
// the test focused on the field's own upload logic.
vi.mock('@mantine/core', () => {
  const Passthrough = ({children}: any) => <div>{children}</div>;
  const Menu: any = Passthrough;
  Menu.Target = Passthrough;
  Menu.Dropdown = Passthrough;
  Menu.Item = Passthrough;
  Menu.Label = Passthrough;
  Menu.Divider = Passthrough;
  return {
    ActionIcon: Passthrough,
    Box: Passthrough,
    Button: Passthrough,
    Checkbox: Passthrough,
    Divider: Passthrough,
    Group: Passthrough,
    Loader: Passthrough,
    LoadingOverlay: Passthrough,
    Menu,
    Modal: Passthrough,
    Select: Passthrough,
    Table: Passthrough,
    Text: Passthrough,
    Textarea: Passthrough,
    Tooltip: Passthrough,
    useMantineTheme: () => ({
      colorScheme: 'light',
      primaryColor: 'blue',
      colors: {
        blue: Array(10).fill('#228be6'),
        dark: Array(10).fill('#1a1b1e'),
        gray: Array(10).fill('#ced4da'),
      },
    }),
  };
});

vi.mock('./GenerateImageForm.js', () => ({
  GenerateImageForm: () => null,
}));

vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
  hideNotification: vi.fn(),
}));

vi.mock('../../../hooks/useGapiClient.js', () => ({
  useGapiClient: () => ({enabled: false}),
}));

vi.mock('../../AssetPickerModal/AssetPickerModal.js', () => ({
  useAssetPickerModal: () => ({open: vi.fn(), close: vi.fn()}),
}));

const uploadFileToGCS = vi.fn(async () => ({
  src: 'https://example.com/hero.png',
  filename: 'hero.png',
}));

vi.mock('../../../utils/gcs.js', async (importOriginal) => {
  const gcs = await importOriginal<typeof import('../../../utils/gcs.js')>();
  return {
    ...gcs,
    uploadFileToGCS: (...args: any[]) => uploadFileToGCS(...(args as [])),
    checkFileExists: async () => false,
  };
});

window.__ROOT_CTX = {
  experiments: {},
  rootConfig: {projectId: 'test-project'},
} as any;

// Import after the mocks are registered.
const {FileFieldInternal} = await import('./FileField.js');

function renderField(field: schema.FileField) {
  return render(
    <FileFieldInternal
      field={field}
      value={null}
      setValue={vi.fn()}
      loadingState={null}
      setLoadingState={vi.fn()}
    />
  );
}

/** Drops a file onto the field's dropzone. */
function dropFile(container: HTMLElement) {
  const dropZone = container.querySelector('.FileField__Dropzone')!;
  const file = new File(['hello'], 'hero.png', {type: 'image/png'});
  fireEvent.drop(dropZone, {dataTransfer: {files: [file]}});
}

describe('FileField naming mode', () => {
  beforeEach(() => {
    uploadFileToGCS.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('hashes the filename by default', async () => {
    const {container} = renderField({type: 'file', label: 'File'});
    dropFile(container);
    await waitFor(() => expect(uploadFileToGCS).toHaveBeenCalled());
    expect((uploadFileToGCS.mock.calls[0] as any)[1]).toMatchObject({
      namingMode: 'hash',
    });
  });

  it('preserves the filename when the field opts in', async () => {
    const {container} = renderField({
      type: 'file',
      label: 'File',
      preserveFilename: true,
    });
    dropFile(container);
    await waitFor(() => expect(uploadFileToGCS).toHaveBeenCalled());
    expect((uploadFileToGCS.mock.calls[0] as any)[1]).toMatchObject({
      namingMode: 'hash-path',
    });
  });
});

describe('FileField aspect ratio warning', () => {
  afterEach(() => {
    cleanup();
  });

  const field: schema.FileField = {
    type: 'file',
    label: 'Image',
    aspectRatio: '16:9',
  };

  function renderWithValue(
    value: any,
    options?: {ignored?: boolean; setIgnored?: (ignored: boolean) => void}
  ) {
    return render(
      <FileFieldInternal
        field={field}
        value={value}
        setValue={vi.fn()}
        loadingState={null}
        setLoadingState={vi.fn()}
        aspectRatioWarningIgnored={options?.ignored}
        setAspectRatioWarningIgnored={options?.setIgnored}
      />
    );
  }

  const mismatched = {
    src: 'https://example.com/hero.png',
    filename: 'hero.png',
    width: 1600,
    height: 1200,
  };

  it('warns when the image does not match the recommended ratio', () => {
    const {container} = renderWithValue(mismatched);
    const warning = container.querySelector('.FileField__AspectRatioWarning');
    expect(warning).not.toBeNull();
    expect(warning!.textContent).toContain('4:3');
    expect(warning!.textContent).toContain('16:9');
  });

  it('does not warn when the image matches the recommended ratio', () => {
    const {container} = renderWithValue({
      ...mismatched,
      width: 1920,
      height: 1080,
    });
    expect(
      container.querySelector('.FileField__AspectRatioWarning')
    ).toBeNull();
  });

  it('warns for videos', () => {
    const {container} = renderWithValue({
      src: 'https://example.com/hero.mp4',
      filename: 'hero.mp4',
      width: 1080,
      height: 1080,
    });
    const warning = container.querySelector('.FileField__AspectRatioWarning');
    expect(warning!.textContent).toContain('This video is');
  });

  it('can be dismissed', () => {
    const setIgnored = vi.fn();
    const {container} = renderWithValue(mismatched, {setIgnored});
    const dismiss = Array.from(
      container.querySelectorAll('.FileField__AspectRatioWarning__Button')
    ).find((el) => el.textContent === 'Dismiss')!;
    fireEvent.click(dismiss);
    expect(setIgnored).toHaveBeenCalledWith(true);
  });

  it('hides the warning once dismissed', () => {
    const {container} = renderWithValue(mismatched, {
      ignored: true,
      setIgnored: vi.fn(),
    });
    expect(
      container.querySelector('.FileField__AspectRatioWarning')
    ).toBeNull();
  });
});
