import '../../styles/global.css';
import '../../styles/mantine.css';
import '../../styles/theme.css';
import {MantineProvider} from '@mantine/core';
import {cleanup, render, waitFor} from '@testing-library/preact';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {page, userEvent} from 'vitest/browser';
import {ActionLogs} from './ActionLogs.js';

const MOCK_ACTIONS = vi.hoisted(() => {
  const millis = 1647485978000; // Wed Mar 16 19:59:38 2022 -0700.
  const timestamp = {seconds: Math.floor(millis / 1000), nanoseconds: 0};
  return [
    // Renders a tooltip-wrapped link ("Open doc") followed by a link with no
    // tooltip ("Show changes").
    {
      action: 'cms-edit.set',
      by: 'test@example.com',
      metadata: {docId: 'Pages/index'},
      links: [{label: 'Show changes', url: '/cms/compare'}],
      timestamp: timestamp,
    },
    // Renders a link without a tooltip.
    {
      action: 'translations.export',
      by: 'test@example.com',
      metadata: {sheetId: 'abc123'},
      timestamp: timestamp,
    },
    // Renders an "Open task" link.
    {
      action: 'tasks.updateStatus',
      by: 'test@example.com',
      metadata: {taskId: '42', status: 'done'},
      timestamp: timestamp,
    },
    // Renders the asset's file path instead of its id.
    {
      action: 'asset.upload',
      by: 'test@example.com',
      metadata: {
        assetId: 'a1b2c3d4e5f6',
        name: 'hero.png',
        path: 'images/home/hero.png',
      },
      timestamp: timestamp,
    },
  ];
});

const listActions = vi.hoisted(() => vi.fn());

vi.mock('../../utils/actions.js', () => ({
  listActions: listActions,
}));

describe('ActionLogs', () => {
  beforeEach(() => {
    listActions.mockResolvedValue(MOCK_ACTIONS);
  });

  afterEach(() => {
    cleanup();
  });

  function renderCompact(props: {showOnboarding?: boolean} = {}) {
    return render(
      <MantineProvider>
        <div style={{width: '900px'}}>
          <ActionLogs compact {...props} />
        </div>
      </MantineProvider>
    );
  }

  async function waitForRows(container: HTMLElement) {
    return await waitFor(() => {
      const els = container.querySelectorAll('.ActionLogsCompactItemPreview');
      expect(els.length).toBe(MOCK_ACTIONS.length);
      return Array.from(els) as HTMLElement[];
    });
  }

  it('vertically aligns the action buttons within a row', async () => {
    const {container} = renderCompact();
    const rows = await waitForRows(container);
    // Expand the first row to reveal its full set of quick links.
    const control = rows[0].closest('button') as HTMLElement;
    control.click();
    const buttons = await waitFor(() => {
      const details = container.querySelector(
        '.ActionLogsCompactItemDetails'
      ) as HTMLElement;
      expect(details).not.toBeNull();
      const els = details.querySelectorAll('.ActionsLogs__table__buttons a');
      expect(els.length).toBe(2);
      expect(els[0].getBoundingClientRect().height).toBeGreaterThan(0);
      return Array.from(els) as HTMLElement[];
    });
    const rects = buttons.map((el) => el.getBoundingClientRect());
    expect(rects[0].top).toBeCloseTo(rects[1].top, 1);
    expect(rects[0].height).toBeCloseTo(rects[1].height, 1);
  });

  it('vertically aligns the action buttons across rows', async () => {
    const {container} = renderCompact();
    const rows = await waitForRows(container);
    const offsets = rows.map((row) => {
      const button = row.querySelector(
        '.ActionLogsCompactItemPreview__buttons a'
      ) as HTMLElement;
      expect(button).not.toBeNull();
      const rowRect = row.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      return {
        centerY: buttonRect.top + buttonRect.height / 2 - rowRect.top,
        right: rowRect.right - buttonRect.right,
        height: buttonRect.height,
      };
    });
    expect(offsets[0].centerY).toBeCloseTo(offsets[1].centerY, 1);
    expect(offsets[0].right).toBeCloseTo(offsets[1].right, 1);
    expect(offsets[0].height).toBeCloseTo(offsets[1].height, 1);
  });

  it('links task actions to the task page', async () => {
    const {container} = renderCompact();
    const rows = await waitForRows(container);
    const button = rows[2].querySelector(
      '.ActionLogsCompactItemPreview__buttons a'
    ) as HTMLAnchorElement;
    expect(button).not.toBeNull();
    expect(button.getAttribute('href')).toBe('/cms/tasks/42');
    expect(button.textContent).toBe('Open');
  });

  it('shows the file path for asset actions', async () => {
    const {container} = renderCompact();
    const rows = await waitForRows(container);
    const label = rows[3].querySelector(
      '.ActionLogsCompactItemPreview__actionMetaId'
    );
    expect(label?.textContent).toBe('images/home/hero.png');
    const button = rows[3].querySelector(
      '.ActionLogsCompactItemPreview__buttons a'
    ) as HTMLAnchorElement;
    expect(button.getAttribute('href')).toBe('/cms/assets?asset=a1b2c3d4e5f6');
  });

  it('keeps the timestamp in place when its tooltip opens', async () => {
    const {container} = renderCompact();
    const rows = await waitForRows(container);
    const timestamp = rows[0].querySelector(
      '.ActionsLogs__timestamp'
    ) as HTMLElement;
    expect(timestamp).not.toBeNull();
    // Hovering scrolls the timestamp into view, so measure it relative to its
    // row rather than to the viewport.
    const offset = () => {
      const rowRect = rows[0].getBoundingClientRect();
      const rect = timestamp.getBoundingClientRect();
      return {
        top: rect.top - rowRect.top,
        height: rect.height,
        rowHeight: rowRect.height,
      };
    };
    const before = offset();
    await userEvent.hover(timestamp);
    await waitFor(() => {
      expect(document.querySelector('.mantine-Tooltip-body')).not.toBeNull();
    });
    const after = offset();
    expect(after.top).toBeCloseTo(before.top, 1);
    expect(after.height).toBeCloseTo(before.height, 1);
    expect(after.rowHeight).toBeCloseTo(before.rowHeight, 1);
  });

  it('shows an onboarding message when there are no actions', async () => {
    await page.viewport(1000, 600);
    listActions.mockResolvedValue([]);
    const {container} = renderCompact();
    const onboarding = await waitFor(() => {
      const el = container.querySelector('.ActionLogsOnboarding');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(container.querySelector('.ActionLogsCompact__table')).toBeNull();
    const link = onboarding.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://rootjs.dev/guides/');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    await expect
      .element(onboarding)
      .toMatchScreenshot('ActionLogs-onboarding.png');
  });

  it('shows the onboarding message when forced, even with actions', async () => {
    const {container} = renderCompact({showOnboarding: true});
    await waitFor(() => {
      expect(container.querySelector('.ActionLogsOnboarding')).not.toBeNull();
    });
    expect(container.querySelector('.ActionLogsCompact__table')).toBeNull();
  });
});
