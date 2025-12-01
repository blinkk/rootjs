import '../../../../styles/global.css';
import '../../../../styles/theme.css';

import {MantineProvider} from '@mantine/core';
import {render, screen} from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import {describe, it, expect, vi} from 'vitest';
import {page} from 'vitest/browser';
import {LexicalEditor} from '../LexicalEditor.js';

// Mock URL.createObjectURL to return a data URI for the carrot icon.
// This avoids potential issues with blob URLs in the test environment.
const CARROT_ICON_DATA_URI =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cGF0aCBkPSJNMTAwIDE4MCBMNDAgNDAgTDE2MCA0MCBaIiBmaWxsPSJvcmFuZ2UiIC8+CiAgPHJlY3QgeD0iOTAiIHk9IjEwIiB3aWR0aD0iMjAiIGhlaWdodD0iMzAiIGZpbGw9ImdyZWVuIiAvPgo8L3N2Zz4=';

window.URL.createObjectURL = vi.fn(() => CARROT_ICON_DATA_URI);
window.URL.revokeObjectURL = vi.fn();

// Mock the GCS upload utility.
vi.mock('../../../../utils/gcs.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../utils/gcs.js')>();
  return {
    ...actual,
    uploadFileToGCS: async (file: File) => {
      // Simulate a delay to capture the loading state.
      await new Promise((resolve) => setTimeout(resolve, 500));
      return {
        src: CARROT_ICON_DATA_URI,
        width: 200,
        height: 200,
        alt: file.name,
      };
    },
  };
});

// Mock the context.
window.__ROOT_CTX = {
  experiments: {},
  rootConfig: {
    projectId: 'test-project',
  },
} as any;

describe('ImagePastePlugin', () => {
  it('renders loading state and then final image on paste', async () => {
    page.viewport(800, 600);
    const user = userEvent.setup();

    render(
      <div style={{padding: '20px', width: '600px'}} data-testid="wrapper">
        <MantineProvider>
          <LexicalEditor
            value={null}
            onChange={() => {}}
            placeholder="Paste an image here..."
          />
        </MantineProvider>
      </div>
    );

    const editorTextbox = screen.getByRole('textbox');
    await expect.element(editorTextbox).toBeVisible();

    // Create a carrot icon SVG.
    const svgContent = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <path d="M100 180 L40 40 L160 40 Z" fill="orange" />
        <rect x="90" y="10" width="20" height="30" fill="green" />
      </svg>
    `;
    const file = new File([svgContent], 'carrot.svg', {
      type: 'image/svg+xml',
    });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    // Paste the content.
    await user.click(editorTextbox);
    await user.paste(dataTransfer);

    // Wait for the image block to appear.
    const image = screen.getByRole('img');
    await expect.element(image).toBeVisible();

    // Wait for the loading spinner to disappear.
    await vi.waitFor(() => {
      const spinner = document.querySelector(
        '.LexicalEditor__customBlock__previewImage__loading'
      );
      expect(spinner).toBeNull();
    });

    // Take screenshot of final state.
    await expect
      .element(screen.getByTestId('wrapper'))
      .toMatchScreenshot('image-paste-complete.png');
  });
});
