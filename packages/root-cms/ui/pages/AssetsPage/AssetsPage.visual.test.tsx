import '../../styles/global.css';
import '../../styles/theme.css';
import './AssetsPage.css';

import {MantineProvider} from '@mantine/core';
import {cleanup, render} from '@testing-library/preact';
import {page} from '@vitest/browser/context';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AssetsPage} from './AssetsPage.js';

vi.mock('../../utils/gcs.js', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    checkFileExists: vi.fn(),
    uploadFileToGCS: vi.fn(),
  };
});

describe('AssetsPage', () => {
  beforeEach(() => {
    // Mock globals required by gcs.ts and FileField
    window.firebase = {
      storage: {
        app: {
          options: {
            storageBucket: 'test-bucket',
          },
        },
      },
      user: {
        email: 'test@example.com',
      },
    } as any;

    window.__ROOT_CTX = {
      rootConfig: {
        projectId: 'test-project',
      },
    } as any;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders default state', async () => {
    await page.viewport(640, 480);
    render(
      <MantineProvider>
        <AssetsPage />
      </MantineProvider>
    );
    await expect
      .element(page.getByRole('heading', {name: 'Assets'}))
      .toBeVisible();
    await expect
      .element(page.getByTitle('Drop or paste to upload a file'))
      .toBeVisible();
    await expect
      .element(page.getByTestId('assets-page'))
      .toMatchScreenshot('assets-page-default.png');
  });
});
