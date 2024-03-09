import {ActionIcon, Breadcrumbs, Tooltip} from '@mantine/core';
import {useModals} from '@mantine/modals';
import {showNotification, updateNotification} from '@mantine/notifications';
import {IconTrash, IconTrashFilled} from '@tabler/icons-preact';
import {route} from 'preact-router';
import {DataSourceForm} from '../../components/DataSourceForm/DataSourceForm.js';
import {Heading} from '../../components/Heading/Heading.js';
import {ReleaseForm} from '../../components/ReleaseForm/ReleaseForm.js';
import {Text} from '../../components/Text/Text.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {Layout} from '../../layout/Layout.js';
import './EditReleasePage.css';
import {deleteDataSource} from '../../utils/data-source.js';

export function EditReleasePage(props: {id: string}) {
  const modals = useModals();
  const modalTheme = useModalTheme();

  function onDeleteClicked() {
    // const notificationId = `delete-data-source-${props.id}`;
    // const modalId = modals.openConfirmModal({
    //   ...modalTheme,
    //   title: 'Delete data source',
    //   children: (
    //     <Text size="body-sm" weight="semi-bold">
    //       Are you sure you want to delete data source <code>{props.id}</code>?
    //       All previously synced data will be deleted. There is no undo.
    //     </Text>
    //   ),
    //   labels: {confirm: 'Delete', cancel: 'Cancel'},
    //   cancelProps: {size: 'xs'},
    //   confirmProps: {color: 'red', size: 'xs'},
    //   onCancel: () => console.log('Cancel'),
    //   closeOnConfirm: false,
    //   onConfirm: async () => {
    //     showNotification({
    //       id: notificationId,
    //       title: 'Deleting data source',
    //       message: `Deleting ${props.id} and synced data...`,
    //       loading: true,
    //       autoClose: false,
    //     });
    //     await deleteDataSource(props.id);
    //     updateNotification({
    //       id: notificationId,
    //       title: 'Deleted data source',
    //       message: `Successfully deleted ${props.id}`,
    //       loading: false,
    //       autoClose: 5000,
    //     });
    //     modals.closeModal(modalId);
    //     route('/cms/data');
    //   },
    // });
  }

  return (
    <Layout>
      <div className="EditReleasePage">
        <div className="EditReleasePage__header">
          <Breadcrumbs className="EditReleasePage__header__breadcrumbs">
            <a href="/cms/releases">Releases</a>
            <a href={`/cms/releases/${props.id}`}>{props.id}</a>
            <div>Edit</div>
          </Breadcrumbs>
          <div className="EditReleasePage__header__titleWrap">
            <Heading size="h1">Edit Release: {props.id}</Heading>
            <div className="EditReleasePage__header__controls">
              <Tooltip label="Delete">
                <ActionIcon onClick={onDeleteClicked}>
                  <IconTrashFilled size={20} stroke="1.5" />
                </ActionIcon>
              </Tooltip>
            </div>
          </div>
        </div>
        <ReleaseForm releaseId={props.id} />
      </div>
    </Layout>
  );
}
