import {ActionIcon, Menu} from '@mantine/core';
import {useModals} from '@mantine/modals';
import {showNotification, updateNotification} from '@mantine/notifications';
import {IconCopy, IconDotsVertical, IconTrash} from '@tabler/icons-preact';
import {cmsDeleteDoc} from '../../utils/doc.js';
import {Text} from '../Text/Text.js';

export interface DocActionsMenuProps {
  docId: string;
  onCopy?: () => void;
  onDelete?: () => void;
}

export function DocActionsMenu(props: DocActionsMenuProps) {
  const docId = props.docId;
  const modals = useModals();

  const onCopyDoc = () => {
    if (props.onCopy) {
      props.onCopy();
    }
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
      <Menu.Item icon={<IconTrash size={20} />} onClick={() => onDeleteDoc()}>
        Delete
      </Menu.Item>
    </Menu>
  );
}
