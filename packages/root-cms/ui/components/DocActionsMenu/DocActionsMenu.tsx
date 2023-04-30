import {ActionIcon, Menu, useMantineTheme} from '@mantine/core';
import {useModals} from '@mantine/modals';
import {showNotification, updateNotification} from '@mantine/notifications';
import {
  IconCloudOff,
  IconCopy,
  IconDotsVertical,
  IconTrash,
} from '@tabler/icons-preact';

import {cmsDeleteDoc, cmsUnpublishDoc} from '../../utils/doc.js';
import {Text} from '../Text/Text.js';

interface DocData {
  sys?: {
    firstPublishedAt?: number;
    scheduledAt?: number;
  };
  fields?: Record<string, any>;
}

export interface DocActionEvent {
  action: 'copy' | 'delete' | 'unpublish';
  newDocId?: string;
}

export interface DocActionsMenuProps {
  docId: string;
  data?: DocData;
  onDelete?: () => void;
  onAction?: (event: DocActionEvent) => void;
}

export function DocActionsMenu(props: DocActionsMenuProps) {
  const docId = props.docId;
  const data = props.data || {};
  const sys = data.sys || {};
  const modals = useModals();
  const theme = useMantineTheme();

  const onCopyDoc = () => {
    // if (props.onAction) {
    //   props.onAction({action: 'copy'});
    // }
    modals.openContextModal('copyDoc', {
      title: 'Copy',
      overlayColor:
        theme.colorScheme === 'dark'
          ? theme.colors.dark[9]
          : theme.colors.gray[2],
      innerProps: {
        fromDocId: docId,
      },
    });
  };

  const onUnpublishDoc = () => {
    const notificationId = `unpublish-doc-${docId}`;
    const modalId = modals.openConfirmModal({
      title: 'unpublish doc',
      centered: true,
      children: (
        <Text size="body-sm" weight="semi-bold">
          Are you sure you want to unpublish <code>{docId}</code>? There is no
          undo.
        </Text>
      ),
      labels: {confirm: 'Unpublish', cancel: 'Cancel'},
      confirmProps: {color: 'red'},
      onCancel: () => console.log('Cancel'),
      closeOnConfirm: false,
      onConfirm: async () => {
        showNotification({
          id: notificationId,
          title: 'Unpublishing doc',
          message: `Requesting unpublish of ${docId}...`,
          loading: true,
          autoClose: false,
        });
        await cmsUnpublishDoc(docId);
        updateNotification({
          id: notificationId,
          title: 'Unpublished!',
          message: `Successfully unpublished ${docId}!`,
          loading: false,
          autoClose: 5000,
        });
        modals.closeModal(modalId);
        if (props.onAction) {
          props.onAction({
            action: 'unpublish',
          });
        }
      },
    });
  };

  const onDeleteDoc = () => {
    const notificationId = `delete-doc-${docId}`;
    const modalId = modals.openConfirmModal({
      title: 'Delete doc',
      centered: true,
      children: (
        <Text size="body-sm" weight="semi-bold">
          Are you sure you want to delete <code>{docId}</code>? There is no
          undo.
        </Text>
      ),
      labels: {confirm: 'Delete', cancel: 'Cancel'},
      confirmProps: {color: 'red'},
      onCancel: () => console.log('Cancel'),
      closeOnConfirm: false,
      onConfirm: async () => {
        showNotification({
          id: notificationId,
          title: 'Deleting doc',
          message: `Requesting deletion of ${docId}...`,
          loading: true,
          autoClose: false,
        });
        await cmsDeleteDoc(docId);
        updateNotification({
          id: notificationId,
          title: 'Deleted!',
          message: `Successfully deleted ${docId}!`,
          loading: false,
          autoClose: 5000,
        });
        modals.closeModal(modalId);
        if (props.onDelete) {
          props.onDelete();
        }
        if (props.onAction) {
          props.onAction({action: 'delete'});
        }
      },
    });
  };

  return (
    <Menu
      className="CollectionPage__collection__docsList__doc__controls__menu"
      position="bottom"
      control={
        <ActionIcon className="DocEditor__ArrayField__item__header__controls__dots">
          <IconDotsVertical size={16} />
        </ActionIcon>
      }
    >
      <Menu.Item icon={<IconCopy size={20} />} onClick={() => onCopyDoc()}>
        Copy
      </Menu.Item>
      {sys.firstPublishedAt && (
        <Menu.Item
          icon={<IconCloudOff size={20} />}
          onClick={() => onUnpublishDoc()}
        >
          Unpublish
        </Menu.Item>
      )}
      <Menu.Item icon={<IconTrash size={20} />} onClick={() => onDeleteDoc()}>
        Delete
      </Menu.Item>
    </Menu>
  );
}
