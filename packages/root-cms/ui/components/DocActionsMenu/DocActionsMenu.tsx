import {ActionIcon, Menu, useMantineTheme} from '@mantine/core';
import {useModals} from '@mantine/modals';
import {showNotification, updateNotification} from '@mantine/notifications';
import {
  IconAlarmOff,
  IconArrowBack,
  IconCloudOff,
  IconCopy,
  IconDotsVertical,
  IconTrash,
} from '@tabler/icons-preact';

import {useModalTheme} from '../../hooks/useModalTheme.js';
import {
  cmsDeleteDoc,
  cmsRevertDraft,
  cmsUnpublishDoc,
  cmsUnscheduleDoc,
} from '../../utils/doc.js';
import {useCopyDocModal} from '../CopyDocModal/CopyDocModal.js';
import {Text} from '../Text/Text.js';

interface DocData {
  sys?: {
    modifiedAt?: number;
    scheduledAt?: number;
    firstPublishedAt?: number;
    publishedAt?: number;
  };
  fields?: Record<string, any>;
}

export interface DocActionEvent {
  action: 'copy' | 'delete' | 'revert-draft' | 'unpublish' | 'unschedule';
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
  const copyDocModal = useCopyDocModal({fromDocId: docId});
  const modalTheme = useModalTheme();

  const onRevertDraft = () => {
    const notificationId = `revert-draft-${docId}`;
    const modalId = modals.openConfirmModal({
      ...modalTheme,
      title: `Revert draft ${docId}`,
      children: (
        <Text size="body-sm" weight="semi-bold">
          Are you sure you want to revert draft changes for <code>{docId}</code>
          ? The doc data will revert to the published version. There is no undo.
        </Text>
      ),
      labels: {confirm: 'Revert draft', cancel: 'Cancel'},
      cancelProps: {size: 'xs'},
      confirmProps: {color: 'red', size: 'xs'},
      onCancel: () => console.log('Cancel'),
      closeOnConfirm: false,
      onConfirm: async () => {
        showNotification({
          id: notificationId,
          title: 'Unpublishing doc',
          message: `Requesting revert draft of ${docId}...`,
          loading: true,
          autoClose: false,
        });
        await cmsRevertDraft(docId);
        updateNotification({
          id: notificationId,
          title: 'Reverted draft!',
          message: `Successfully reverted ${docId}!`,
          loading: false,
          autoClose: 5000,
        });
        modals.closeModal(modalId);
        if (props.onAction) {
          props.onAction({
            action: 'revert-draft',
          });
        }
      },
    });
  };

  const onUnpublishDoc = () => {
    const notificationId = `unpublish-doc-${docId}`;
    const modalId = modals.openConfirmModal({
      ...modalTheme,
      title: `Unpublish ${docId}`,
      children: (
        <Text size="body-sm" weight="semi-bold">
          Are you sure you want to unpublish <code>{docId}</code>? There is no
          undo.
        </Text>
      ),
      labels: {confirm: 'Unpublish', cancel: 'Cancel'},
      cancelProps: {size: 'xs'},
      confirmProps: {color: 'red', size: 'xs'},
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

  const onUnscheduleDoc = () => {
    const notificationId = `unschedule-doc-${docId}`;
    const modalId = modals.openConfirmModal({
      ...modalTheme,
      title: `Unschedule ${docId}`,
      children: (
        <Text size="body-sm" weight="semi-bold">
          Are you sure you want to unschedule <code>{docId}</code>?
        </Text>
      ),
      labels: {confirm: 'Unschedule', cancel: 'Cancel'},
      cancelProps: {size: 'xs'},
      confirmProps: {color: 'red', size: 'xs'},
      onCancel: () => console.log('Cancel'),
      closeOnConfirm: false,
      onConfirm: async () => {
        showNotification({
          id: notificationId,
          title: 'Unschedule doc',
          message: `Requesting unschedule of ${docId}...`,
          loading: true,
          autoClose: false,
        });
        await cmsUnscheduleDoc(docId);
        updateNotification({
          id: notificationId,
          title: 'Unscheduled!',
          message: `Successfully unscheduled ${docId}!`,
          loading: false,
          autoClose: 5000,
        });
        modals.closeModal(modalId);
        if (props.onAction) {
          props.onAction({
            action: 'unschedule',
          });
        }
      },
    });
  };

  const onDeleteDoc = () => {
    const notificationId = `delete-doc-${docId}`;
    const modalId = modals.openConfirmModal({
      ...modalTheme,
      title: 'Delete doc',
      children: (
        <Text size="body-sm" weight="semi-bold">
          Are you sure you want to delete <code>{docId}</code>? There is no
          undo.
        </Text>
      ),
      labels: {confirm: 'Delete', cancel: 'Cancel'},
      cancelProps: {size: 'xs'},
      confirmProps: {color: 'red', size: 'xs'},
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
      <Menu.Item
        icon={<IconCopy size={20} />}
        onClick={() => copyDocModal.open()}
      >
        Copy
      </Menu.Item>
      {sys.modifiedAt &&
        sys.publishedAt &&
        sys.modifiedAt > sys.publishedAt && (
          <Menu.Item
            icon={<IconArrowBack size={20} />}
            onClick={() => onRevertDraft()}
          >
            Revert draft
          </Menu.Item>
        )}
      {sys.firstPublishedAt && (
        <Menu.Item
          icon={<IconCloudOff size={20} />}
          onClick={() => onUnpublishDoc()}
        >
          Unpublish
        </Menu.Item>
      )}
      {sys.scheduledAt && (
        <Menu.Item
          icon={<IconAlarmOff size={20} />}
          onClick={() => onUnscheduleDoc()}
        >
          Unschedule
        </Menu.Item>
      )}
      <Menu.Item icon={<IconTrash size={20} />} onClick={() => onDeleteDoc()}>
        Delete
      </Menu.Item>
    </Menu>
  );
}
