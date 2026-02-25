import './ReferenceQuickEditModal.css';

import {Button, Group, Modal} from '@mantine/core';
import {IconExternalLink} from '@tabler/icons-preact';
import {DraftDocProvider} from '../../../hooks/useDraftDoc.js';
import {useModalTheme} from '../../../hooks/useModalTheme.js';
import {DocEditor} from '../DocEditor.js';

interface ReferenceQuickEditModalProps {
  docId: string | null;
  opened: boolean;
  onClose: () => void;
}

/**
 * Modal for quickly editing referenced docs without navigating away.
 */
export function ReferenceQuickEditModal(props: ReferenceQuickEditModalProps) {
  const modalTheme = useModalTheme();
  if (!props.docId) {
    return null;
  }

  return (
    <Modal
      {...modalTheme}
      opened={props.opened}
      onClose={props.onClose}
      title={`Edit ${props.docId}`}
      size="xl"
      zIndex={190}
    >
      <div className="ReferenceQuickEditModal">
        <Group position="right" mb="sm">
          <Button
            component="a"
            href={`/cms/content/${props.docId}`}
            target="_blank"
            rel="noopener noreferrer"
            size="xs"
            variant="default"
            leftIcon={<IconExternalLink size={14} />}
          >
            Open in new tab
          </Button>
        </Group>
        <DraftDocProvider docId={props.docId}>
          <DocEditor docId={props.docId} />
        </DraftDocProvider>
      </div>
    </Modal>
  );
}
