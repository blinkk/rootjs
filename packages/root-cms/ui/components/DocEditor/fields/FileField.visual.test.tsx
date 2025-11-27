import {render} from '@testing-library/preact';
import {describe, it, expect, vi} from 'vitest';
import {page} from 'vitest/browser';
import * as schema from '../../../../core/schema.js';
import {FileField} from './FileField.js';

window.__ROOT_CTX = {
  experiments: {},
  rootConfig: {
    projectId: 'test-project',
  },
} as any;

const SVG_DATA_URI =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNjAiIGhlaWdodD0iOTAiIHZpZXdCb3g9IjAgMCAxNjAgOTAiPjxyZWN0IHdpZHRoPSIxNjAiIGhlaWdodD0iOTAiIGZpbGw9IiNjY2NjY2MiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjAiIGZpbGw9IiNGRkZGRkYiPjE2eDk8L3RleHQ+PC9zdmc+';

vi.mock('../../../hooks/useDraftDoc.js', () => ({
  useDraftDocValue: () => {
    return [
      {
        src: SVG_DATA_URI,
        filename: 'test.svg',
        width: 1600,
        height: 900,
        uploadedAt: 1647485978000,
        uploadedBy: 'test@example.com',
      },
      vi.fn(),
    ];
  },
  useFileField: () => ({
    field: {},
    value: {
      src: SVG_DATA_URI,
      filename: 'test.svg',
      width: 1600,
      height: 900,
      uploadedAt: 1647485978000,
      uploadedBy: 'test@example.com',
    },
    setValue: vi.fn(),
    loadingState: null,
    variant: 'image',
    acceptedFileTypes: [],
    focusDropZone: vi.fn(),
    handleFile: vi.fn(),
    removeFile: vi.fn(),
    requestFileUpload: vi.fn(),
    requestFileDownload: vi.fn(),
    requestGenerateAltText: vi.fn(),
    requestPlaceholderModalOpen: vi.fn(),
    showAltText: true,
    altText: '',
    setAltText: vi.fn(),
  }),
}));

describe('FileField', () => {
  it('renders with autosize textarea', async () => {
    page.viewport(640, 480);
    const field: schema.FileField = {
      type: 'file',
      label: 'Hero Image',
    };

    render(
      <div style={{padding: '20px', width: '600px'}} data-testid="wrapper">
        <FileField field={field} deepKey="heroImage" variant="image" />
      </div>
    );

    const element = page.getByTestId('wrapper');
    await expect.element(element).toBeVisible();
    await expect.element(element).toMatchScreenshot('file-field-initial.png');

    // Click the info button to show the details table where the URL textarea is
    const infoButton = page.getByRole('button', {name: 'Toggle file info'});
    await infoButton.click();

    await expect.element(element).toMatchScreenshot('file-field-autosize.png');
  });
});
