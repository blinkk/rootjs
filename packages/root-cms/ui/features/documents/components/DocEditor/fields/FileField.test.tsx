import {cleanup, fireEvent, render, waitFor} from '@testing-library/preact';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as schema from '../../../../../../core/schema.js';

vi.mock('./GenerateImageForm.js', () => ({
  GenerateImageForm: () => null,
}));

vi.mock('../../../../../primitives/Toast/toastStore.js', () => ({
  showNotification: vi.fn(),
  hideNotification: vi.fn(),
}));

// In-memory draft doc used by the CMS-connected `FileField` tests.
const draftDoc: Record<string, any> = {};

vi.mock('../../../useDraftDoc.js', async () => {
  const {useState} = await import('preact/hooks');
  return {
    useDraftDocValue: (key: string) => {
      const [value, setValue] = useState(draftDoc[key] ?? null);
      const setDraftValue = (newValue: any) => {
        if (newValue === null || newValue === undefined) {
          delete draftDoc[key];
        } else {
          draftDoc[key] = newValue;
        }
        setValue(newValue ?? null);
      };
      return [value, setDraftValue];
    },
  };
});

vi.mock('../../../../../integrations/useGapiClient.js', () => ({
  useGapiClient: () => ({enabled: false}),
}));

vi.mock(
  '../../../../assets/components/AssetPickerModal/AssetPickerModal.js',
  () => ({
    useAssetPickerModal: () => ({open: vi.fn(), close: vi.fn()}),
  })
);

const uploadFileToGCS = vi.fn(async () => ({
  src: 'https://example.com/hero.png',
  filename: 'hero.png',
}));

vi.mock('../../../../../integrations/gcs.js', async (importOriginal) => {
  const gcs =
    await importOriginal<typeof import('../../../../../integrations/gcs.js')>();
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
const {FileField, FileFieldInternal} = await import('./FileField.js');

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
function dropFile(container: Element) {
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

describe('FileField preview', () => {
  afterEach(() => {
    cleanup();
  });

  function renderWithValue(value: any) {
    return render(
      <FileFieldInternal
        field={{type: 'file', label: 'File'}}
        value={value}
        setValue={vi.fn()}
        loadingState={null}
        setLoadingState={vi.fn()}
      />
    );
  }

  it('shows the image preview for GCI urls without an image extension', () => {
    const {container} = renderWithValue({
      src: 'https://lh3.googleusercontent.com/abc123',
      filename: 'hero',
      width: 1600,
      height: 900,
    });
    const img = container.querySelector('img.FileField__Preview__Image');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe(
      'https://lh3.googleusercontent.com/abc123'
    );
    expect(
      container.querySelector('.FileField__Canvas--infoOpened')
    ).toBeNull();
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
});

describe('FileField aspect ratio metadata', () => {
  beforeEach(() => {
    for (const key of Object.keys(draftDoc)) {
      delete draftDoc[key];
    }
    uploadFileToGCS.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  const field: schema.FileField = {
    type: 'file',
    id: 'image',
    label: 'Image',
    aspectRatio: '16:9',
  };

  it('stores the dismissed warning in the field metadata', () => {
    draftDoc['fields.image'] = {
      src: 'https://example.com/old.png',
      filename: 'old.png',
      width: 1600,
      height: 1200,
    };
    const {container} = render(
      <FileField field={field} deepKey="fields.image" variant="image" />
    );
    const dismiss = Array.from(
      container.querySelectorAll('.FileField__AspectRatioWarning__Button')
    ).find((el) => el.textContent === 'Dismiss')!;
    fireEvent.click(dismiss);
    expect(draftDoc['fields.@image']).toEqual({ignoreAspectRatioWarning: true});
    expect(
      container.querySelector('.FileField__AspectRatioWarning')
    ).toBeNull();
  });

  it('resets the dismissed warning when a new file is uploaded', async () => {
    draftDoc['fields.image'] = {
      src: 'https://example.com/old.png',
      filename: 'old.png',
      width: 1600,
      height: 1200,
    };
    draftDoc['fields.@image'] = {alt: false, ignoreAspectRatioWarning: true};
    uploadFileToGCS.mockImplementationOnce(async () => ({
      src: 'https://example.com/new.png',
      filename: 'new.png',
      width: 1000,
      height: 1000,
    }));
    const {container} = render(
      <FileField field={field} deepKey="fields.image" variant="image" />
    );
    expect(
      container.querySelector('.FileField__AspectRatioWarning')
    ).toBeNull();

    dropFile(container);
    await waitFor(() =>
      expect(draftDoc['fields.image']?.src).toBe('https://example.com/new.png')
    );
    // Other metadata is preserved.
    expect(draftDoc['fields.@image']).toEqual({alt: false});
    await waitFor(() =>
      expect(
        container.querySelector('.FileField__AspectRatioWarning')
      ).not.toBeNull()
    );
  });
});
