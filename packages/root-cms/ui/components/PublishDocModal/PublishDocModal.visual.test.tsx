import '../../styles/global.css';
import '../../styles/theme.css';
import './PublishDocModal.css';

import {MantineProvider} from '@mantine/core';
import {ModalsProvider, ContextModalProps} from '@mantine/modals';
import {render} from '@testing-library/preact';
import {describe, it, expect, beforeAll} from 'vitest';
import {page} from 'vitest/browser';
import {PublishDocModal, PublishDocModalProps} from './PublishDocModal.js';

describe('PublishDocModal', () => {
  beforeAll(() => {
    (window as any).__ROOT_CTX = {experiments: {}};
  });

  it('renders publish confirmation with long doc id', async () => {
    await page.viewport(640, 480);
    const props: ContextModalProps<PublishDocModalProps> = {
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
      },
    };

    render(
      <MantineProvider>
        <ModalsProvider>
          <div
            data-testid="wrapper"
            style={{width: 640, height: 480, padding: 20, background: '#fff'}}
          >
            <PublishDocModal {...props} />
          </div>
        </ModalsProvider>
      </MantineProvider>
    );

    // Select "Publish now"
    await page.getByText('Now').click();

    // Click "Publish" button
    await page.getByRole('button', {name: 'Publish'}).click();

    // Now the confirm modal should appear.
    await expect
      .element(page.getByText('Are you sure you want to publish'))
      .toBeVisible();
    await expect.element(page.getByTestId('doc-id')).toBeVisible();

    await expect
      .element(page.getByTestId('wrapper'))
      .toMatchScreenshot('publish-doc-modal.png');
  });
});
