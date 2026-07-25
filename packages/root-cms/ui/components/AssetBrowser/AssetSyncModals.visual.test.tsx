/**
 * @fileoverview Visual tests for the sync progress and summary views.
 *
 * Reference screenshots are not committed for this file -- run
 * `pnpm test:visual` once to generate them for your platform.
 */

import '../../styles/global.css';
import './AssetBrowser.css';
import {cleanup, render} from '@testing-library/preact';
import {afterEach, beforeEach, describe, it, expect} from 'vitest';
import {page} from 'vitest/browser';
import {SyncRunningView, SyncSummaryView} from './AssetSyncModals.js';

/** Wraps a view at the width it renders at inside the sync modal. */
function Wrapper(props: {children: any}) {
  return (
    <div
      data-testid="wrapper"
      style={{
        padding: '16px',
        width: '480px',
        background: '#ffffff',
        fontFamily: 'sans-serif',
      }}
    >
      <div className="AssetBrowser__syncProgress">{props.children}</div>
    </div>
  );
}

beforeEach(async () => {
  // Wide enough for the modal body these views render inside of.
  await page.viewport(560, 700);
});

afterEach(() => {
  cleanup();
});

describe('SyncRunningView', () => {
  // Not screenshotted: the indeterminate bar animates, so no frame of it is
  // stable enough to diff against a reference image.
  it('renders an indeterminate bar while enumerating', async () => {
    const {container} = render(
      <Wrapper>
        <SyncRunningView progress={{phase: 'enumerating'}} />
      </Wrapper>
    );
    await expect.element(page.getByTestId('wrapper')).toBeVisible();
    const bar = container.querySelector('[role="progressbar"]')!;
    expect(bar.className).toContain(
      'AssetBrowser__syncProgress__bar--indeterminate'
    );
    expect(bar.getAttribute('aria-valuenow')).toBe(null);
    expect(container.textContent).toContain('Finding exportable assets…');
  });

  it('renders a determinate bar while downloading', async () => {
    render(
      <Wrapper>
        <SyncRunningView
          progress={{
            phase: 'downloading',
            total: 48,
            completed: 18,
            currentName: 'icon-chevron-right@2x',
          }}
        />
      </Wrapper>
    );
    const element = page.getByTestId('wrapper');
    await expect.element(element).toBeVisible();
    await expect.element(element).toMatchScreenshot('running-downloading.png');
  });

  it('renders provider status notes', async () => {
    render(
      <Wrapper>
        <SyncRunningView
          progress={{
            phase: 'downloading',
            total: 48,
            completed: 18,
            currentName: 'icon-chevron-right@2x',
            note: 'Rate limited by Figma. Retrying in 28s…',
          }}
        />
      </Wrapper>
    );
    const element = page.getByTestId('wrapper');
    await expect.element(element).toBeVisible();
    await expect.element(element).toMatchScreenshot('running-note.png');
  });
});

describe('SyncSummaryView', () => {
  it('renders a successful run', async () => {
    render(
      <Wrapper>
        <SyncSummaryView
          summary={{
            upToDate: false,
            added: 12,
            updated: 3,
            unchanged: 33,
            missing: 0,
            failed: [],
            updatedDocIds: ['pages/foo', 'pages/bar', 'pages/foo'],
          }}
        />
      </Wrapper>
    );
    const element = page.getByTestId('wrapper');
    await expect.element(element).toBeVisible();
    await expect.element(element).toMatchScreenshot('summary-success.png');
  });

  it('renders an up-to-date run', async () => {
    render(
      <Wrapper>
        <SyncSummaryView
          summary={{
            upToDate: true,
            added: 0,
            updated: 0,
            unchanged: 48,
            missing: 0,
            failed: [],
            updatedDocIds: [],
          }}
        />
      </Wrapper>
    );
    const element = page.getByTestId('wrapper');
    await expect.element(element).toBeVisible();
    await expect.element(element).toMatchScreenshot('summary-up-to-date.png');
  });

  it('renders missing assets and per-item failures', async () => {
    render(
      <Wrapper>
        <SyncSummaryView
          summary={{
            upToDate: false,
            added: 2,
            updated: 1,
            unchanged: 40,
            missing: 3,
            failed: [
              {name: 'hero-banner', error: 'Export failed: node not found.'},
              {name: 'logo-mark', error: 'Request timed out after 30s.'},
            ],
            updatedDocIds: ['pages/home'],
          }}
        />
      </Wrapper>
    );
    const element = page.getByTestId('wrapper');
    await expect.element(element).toBeVisible();
    await expect.element(element).toMatchScreenshot('summary-failures.png');
  });
});
