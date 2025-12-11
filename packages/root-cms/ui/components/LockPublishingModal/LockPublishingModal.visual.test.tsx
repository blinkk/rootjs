import '../../styles/global.css';
import '../../styles/theme.css';
import './LockPublishingModal.css';

import {MantineProvider} from '@mantine/core';
import {ContextModalProps, ModalsProvider} from '@mantine/modals';
import {render} from '@testing-library/preact';
import {describe, it, expect} from 'vitest';
import {page} from 'vitest/browser';
import {
  LockPublishingModal,
  LockPublishingModalProps,
} from './LockPublishingModal.js';

describe('LockPublishingModal', () => {
  it('renders unlock confirmation with long doc id', async () => {
    await page.viewport(1200, 800);
    const props: ContextModalProps<LockPublishingModalProps> = {
      context: {
        closeModal: () => {},
        closeAll: () => {},
        openModal: () => {},
        openConfirmModal: () => {},
        openContextModal: () => {},
      } as any,
      id: 'test-modal',
      innerProps: {
        docId:
          'very-long-doc-id-that-should-break-word-and-wrap-to-the-next-line-to-avoid-overflowing-the-modal-content-area',
        unlock: true,
      },
    };

    render(
      <MantineProvider>
        <ModalsProvider>
          <div
            data-testid="wrapper"
            style={{width: 600, padding: 20, background: '#fff'}}
          >
            <LockPublishingModal {...props} />
          </div>
        </ModalsProvider>
      </MantineProvider>
    );

    await expect
      .element(page.getByText('Are you sure you want to unlock'))
      .toBeVisible();
    await expect.element(page.getByTestId('doc-id')).toBeVisible();

    await expect
      .element(page.getByTestId('wrapper'))
      .toMatchScreenshot('lock-publishing-modal.png');
  });
});
