import {ActionIcon, Menu} from '@mantine/core';
import {useModals} from '@mantine/modals';
import {showNotification, updateNotification} from '@mantine/notifications';
import {
  IconAlarmOff,
  IconArchive,
  IconArchiveOff,
  IconArrowBack,
  IconCloudOff,
  IconCopy,
  IconDotsVertical,
  IconHistory,
  IconLock,
  IconLockOpen,
  IconPackage,
  IconTrash,
} from '@tabler/icons-preact';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {useProjectRoles} from '../../hooks/useProjectRoles.js';
import {
  CMSDoc,
  cmsArchiveDoc,
  cmsDeleteDoc,
  cmsRevertDraft,
  cmsUnarchiveDoc,
  cmsUnpublishDoc,
  cmsUnscheduleDoc,
  testIsArchived,
  testIsScheduled,
  testPublishingLocked,
} from '../../utils/doc.js';
import {testCanEdit, testCanPublish} from '../../utils/permissions.js';
import {useAddToReleaseModal} from '../AddToReleaseModal/AddToReleaseModal.js';
import {useCopyDocModal} from '../CopyDocModal/CopyDocModal.js';
import {DocIdBadge} from '../DocIdBadge/DocIdBadge.js';
import {useLockPublishingModal} from '../LockPublishingModal/LockPublishingModal.js';
import {Text} from '../Text/Text.js';
import {useVersionHistoryModal} from '../VersionHistoryModal/VersionHistoryModal.js';

import './DocActionsMenu.css';

export interface DocActionEvent {
  action:
    | 'archive'
    | 'copy'
    | 'delete'
    | 'revert-draft'
    | 'unarchive'
    | 'unpublish'
    | 'unschedule'
    | 'locked'
    | 'unlocked';
  newDocId?: string;
}

export interface DocActionsMenuProps {
  docId: string;
  data?: CMSDoc;
  onDelete?: () => void;
  onAction?: (event: DocActionEvent) => void;
}

export function DocActionsMenu(props: DocActionsMenuProps) {
  const {roles} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canEdit = testCanEdit(roles, currentUserEmail);
  const canPublish = testCanPublish(roles, currentUserEmail);

  const docId = props.docId;
  const data = (props.data || {}) as CMSDoc;
  const sys = data.sys || {};
  const isArchived = testIsArchived(data);
  const modals = useModals();
  const copyDocModal = useCopyDocModal({fromDocId: docId});
  const modalTheme = useModalTheme();
  const versionHistoryModal = useVersionHistoryModal({docId});
  const lockPublishingModal = useLockPublishingModal({docId});
  const addToReleaseModal = useAddToReleaseModal({docIds: [docId]});

  const onRevertDraft = () => {
    const notificationId = `revert-draft-${docId}`;
    const modalId = modals.openConfirmModal({
      ...modalTheme,
      title: `Discard draft edits for ${docId}`,
      children: (
        <>
          <Text
            size="body-sm"
            weight="semi-bold"
            className="DocActionsMenu__confirmText"
          >
            Are you sure you want to discard draft changes for the following
            doc? The doc data will revert to the published version. There is no
            undo.
          </Text>
          <DocIdBadge docId={docId} />
        </>
      ),
      labels: {confirm: 'Discard draft edits', cancel: 'Cancel'},
      cancelProps: {size: 'xs'},
      confirmProps: {color: 'red', size: 'xs'},
      onCancel: () => console.log('Cancel'),
      closeOnConfirm: false,
      onConfirm: async () => {
        showNotification({
          id: notificationId,
          title: 'Unpublishing doc',
          message: `Discarding draft edits of ${docId}...`,
          loading: true,
          autoClose: false,
        });
        await cmsRevertDraft(docId);
        updateNotification({
          id: notificationId,
          title: 'Discarded draft edited',
          message: `Successfully reverted ${docId} back to its published version`,
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
        <>
          <Text
            size="body-sm"
            weight="semi-bold"
            className="DocActionsMenu__confirmText"
          >
            Are you sure you want to unpublish the following doc? There is no
            undo.
          </Text>
          <DocIdBadge docId={docId} />
        </>
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

  const onLockChanged = (state: 'locked' | 'unlocked') => {
    if (props.onAction) {
      props.onAction({action: state});
    }
  };

  const onUnscheduleDoc = () => {
    const notificationId = `unschedule-doc-${docId}`;
    const modalId = modals.openConfirmModal({
      ...modalTheme,
      title: `Unschedule ${docId}`,
      children: (
        <>
          <Text
            size="body-sm"
            weight="semi-bold"
            className="DocActionsMenu__confirmText"
          >
            Are you sure you want to unschedule the following doc?
          </Text>
          <DocIdBadge docId={docId} />
        </>
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

  const onArchiveDoc = () => {
    const notificationId = `archive-doc-${docId}`;
    const modalId = modals.openConfirmModal({
      ...modalTheme,
      title: `Archive ${docId}`,
      children: (
        <>
          <Text
            size="body-sm"
            weight="semi-bold"
            className="DocActionsMenu__confirmText"
          >
            Are you sure you want to archive the following doc? Archived docs
            are hidden from the collection list by default but can be restored
            later.
          </Text>
          <DocIdBadge docId={docId} />
        </>
      ),
      labels: {confirm: 'Archive', cancel: 'Cancel'},
      cancelProps: {size: 'xs'},
      confirmProps: {color: 'red', size: 'xs'},
      onCancel: () => console.log('Cancel'),
      closeOnConfirm: false,
      onConfirm: async () => {
        showNotification({
          id: notificationId,
          title: 'Archiving doc',
          message: `Requesting archive of ${docId}...`,
          loading: true,
          autoClose: false,
        });
        await cmsArchiveDoc(docId);
        updateNotification({
          id: notificationId,
          title: 'Archived!',
          message: `Successfully archived ${docId}!`,
          loading: false,
          autoClose: 5000,
        });
        modals.closeModal(modalId);
        if (props.onAction) {
          props.onAction({action: 'archive'});
        }
      },
    });
  };

  const onUnarchiveDoc = async () => {
    const notificationId = `unarchive-doc-${docId}`;
    showNotification({
      id: notificationId,
      title: 'Unarchiving doc',
      message: `Requesting unarchive of ${docId}...`,
      loading: true,
      autoClose: false,
    });
    await cmsUnarchiveDoc(docId);
    updateNotification({
      id: notificationId,
      title: 'Unarchived!',
      message: `Successfully unarchived ${docId}!`,
      loading: false,
      autoClose: 5000,
    });
    if (props.onAction) {
      props.onAction({action: 'unarchive'});
    }
  };

  const onDeleteDoc = () => {
    const notificationId = `delete-doc-${docId}`;
    const modalId = modals.openConfirmModal({
      ...modalTheme,
      title: 'Delete doc',
      children: (
        <>
          <Text
            size="body-sm"
            weight="semi-bold"
            className="DocActionsMenu__confirmText"
          >
            Are you sure you want to delete the following doc? There is no undo.
          </Text>
          <DocIdBadge docId={docId} />
        </>
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
      {!isArchived && (
        <Menu.Item
          icon={<IconPackage size={20} />}
          onClick={() => addToReleaseModal.open()}
          disabled={!canPublish}
        >
          Add to release
        </Menu.Item>
      )}
      <Menu.Item
        icon={<IconHistory size={20} />}
        onClick={() => versionHistoryModal.open()}
      >
        Version history
      </Menu.Item>
      <Menu.Item
        icon={<IconCopy size={20} />}
        onClick={() => copyDocModal.open()}
        disabled={!canEdit}
      >
        Copy
      </Menu.Item>
      {!isArchived &&
        sys.modifiedAt &&
        sys.publishedAt &&
        sys.modifiedAt > sys.publishedAt && (
          <Menu.Item
            icon={<IconArrowBack size={20} />}
            onClick={() => onRevertDraft()}
            disabled={!canEdit}
          >
            Discard draft edits
          </Menu.Item>
        )}
      {!isArchived && sys.firstPublishedAt && (
        <Menu.Item
          icon={<IconCloudOff size={20} />}
          onClick={() => onUnpublishDoc()}
          disabled={!canPublish}
        >
          Unpublish
        </Menu.Item>
      )}
      {!isArchived && sys.scheduledAt && (
        <Menu.Item
          icon={<IconAlarmOff size={20} />}
          onClick={() => onUnscheduleDoc()}
          disabled={!canPublish}
        >
          Unschedule
        </Menu.Item>
      )}
      {!isArchived &&
        (testPublishingLocked(data) ? (
          <Menu.Item
            icon={<IconLockOpen size={20} />}
            onClick={() =>
              lockPublishingModal.open({unlock: true, onChange: onLockChanged})
            }
            disabled={!canEdit}
          >
            Unlock publishing
          </Menu.Item>
        ) : (
          <Menu.Item
            icon={<IconLock size={20} />}
            onClick={() =>
              lockPublishingModal.open({unlock: false, onChange: onLockChanged})
            }
            // Prevent "publishing lock" if the doc has an existing scheduled
            // publish.
            disabled={!canEdit || testIsScheduled(data)}
          >
            Lock publishing
          </Menu.Item>
        ))}
      {isArchived ? (
        <Menu.Item
          icon={<IconArchiveOff size={20} />}
          onClick={() => onUnarchiveDoc()}
          disabled={!canEdit}
        >
          Unarchive
        </Menu.Item>
      ) : (
        !sys.publishedAt && (
          <Menu.Item
            icon={<IconArchive size={20} />}
            onClick={() => onArchiveDoc()}
            disabled={!canEdit}
          >
            Archive
          </Menu.Item>
        )
      )}
      <Menu.Item
        icon={<IconTrash size={20} />}
        onClick={() => onDeleteDoc()}
        disabled={!canEdit}
      >
        Delete
      </Menu.Item>
    </Menu>
  );
}
