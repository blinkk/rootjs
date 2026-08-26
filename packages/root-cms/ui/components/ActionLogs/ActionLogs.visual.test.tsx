import '../../styles/global.css';
import '../../styles/theme.css';
import {MantineProvider} from '@mantine/core';
import {render, waitFor} from '@testing-library/preact';
import {describe, expect, it, vi} from 'vitest';
import {userEvent} from 'vitest/browser';
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
  ];
});

vi.mock('../../utils/actions.js', () => ({
  listActions: async () => MOCK_ACTIONS,
}));

describe('ActionLogs', () => {
  function renderCompact() {
    return render(
      <MantineProvider>
        <div style={{width: '900px'}}>
          <ActionLogs compact />
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
});
