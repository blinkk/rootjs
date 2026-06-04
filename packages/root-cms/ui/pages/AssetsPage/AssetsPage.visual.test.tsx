import '../../styles/global.css';
import '../../styles/theme.css';
import './AssetsPage.css';

import {MantineProvider} from '@mantine/core';
import {cleanup, render} from '@testing-library/preact';
import {page} from '@vitest/browser/context';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AssetsPage} from './AssetsPage.js';

vi.mock('preact-iso', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useLocation: () => ({url: '/cms/assets'}),
  };
});

vi.mock('../../utils/asset-library.js', () => {
  const DEFAULT_ASSET_FOLDER = 'uploads';
  const normalizeAssetFolderPath = (path?: string) =>
    (path || DEFAULT_ASSET_FOLDER)
      .replaceAll('\\', '/')
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean)
      .join('/') || DEFAULT_ASSET_FOLDER;
  return {
    DEFAULT_ASSET_FOLDER,
    createAssetFolder: vi.fn(),
    createLibraryAsset: vi.fn(),
    getLibraryAssetFolder: (asset: any) =>
      normalizeAssetFolderPath(asset.folder),
    getLibraryAssetPath: (asset: any) =>
      `${normalizeAssetFolderPath(asset.folder)}/${
        asset.filename || asset.file?.filename || asset.id
      }`,
    listLibraryAssetFolders: vi.fn(async () => [
      {
        id: 'uploads',
        path: 'uploads',
        name: 'uploads',
        parentPath: '',
      },
    ]),
    listLibraryAssets: vi.fn(async () => []),
    normalizeAssetFolderPath,
    replaceLibraryAsset: vi.fn(),
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
      .element(page.getByRole('button', {name: 'Upload asset'}))
      .toBeVisible();
    await expect
      .element(page.getByRole('button', {name: 'uploads'}))
      .toBeVisible();
    await expect
      .element(page.getByTestId('assets-page'))
      .toMatchScreenshot('assets-page-default.png');
  });
});
