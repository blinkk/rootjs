import '../../styles/global.css';
import '../../styles/theme.css';
import './AssetsPage.css';

import {MantineProvider} from '@mantine/core';
import {cleanup, render} from '@testing-library/preact';
import {page} from '@vitest/browser/context';
import {LocationProvider} from 'preact-iso';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AssetsPage} from './AssetsPage.js';

const MOCK_ASSETS = vi.hoisted(() => {
  const ts = {
    toMillis: () => new Date('2026-01-02T00:00:00Z').getTime(),
  };
  const sys = {
    createdAt: ts,
    createdBy: 'test@example.com',
    modifiedAt: ts,
    modifiedBy: 'test@example.com',
  };
  return [
    {
      id: 'folder-marketing',
      type: 'folder',
      parent: '',
      name: 'marketing',
      ...sys,
    },
    {
      id: 'assetimg12345',
      type: 'file',
      parent: '',
      name: 'hero.png',
      file: {
        // A 1x1 red pixel data URI keeps the image preview deterministic.
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        filename: 'hero.png',
        width: 1600,
        height: 900,
      },
      ...sys,
    },
    {
      id: 'assetpdf12345',
      type: 'file',
      parent: '',
      name: 'whitepaper.pdf',
      file: {
        src: 'https://example.com/whitepaper.pdf',
        filename: 'whitepaper.pdf',
      },
      ...sys,
    },
  ];
});

vi.mock('../../utils/assets.js', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    listAssets: vi.fn(async () => MOCK_ASSETS),
    getAsset: vi.fn(async () => null),
    findDocsUsingAsset: vi.fn(async () => []),
  };
});

vi.mock('../../hooks/useProjectRoles.js', () => ({
  useProjectRoles: () => ({
    roles: {'test@example.com': 'ADMIN'},
    loading: false,
  }),
}));

describe('AssetsPage', () => {
  beforeEach(() => {
    window.firebase = {
      user: {
        email: 'test@example.com',
      },
    } as any;

    window.__ROOT_CTX = {
      rootConfig: {
        projectId: 'test-project',
      },
      collections: {},
    } as any;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the asset browser', async () => {
    await page.viewport(900, 640);
    render(
      <MantineProvider>
        <LocationProvider>
          <AssetsPage />
        </LocationProvider>
      </MantineProvider>
    );
    await expect
      .element(page.getByRole('heading', {name: 'Assets'}))
      .toBeVisible();
    await expect.element(page.getByText('marketing')).toBeVisible();
    await expect.element(page.getByText('hero.png')).toBeVisible();
    await expect.element(page.getByText('whitepaper.pdf')).toBeVisible();
    await expect
      .element(page.getByTestId('assets-page'))
      .toMatchScreenshot('assets-page-default.png');
  });
});
