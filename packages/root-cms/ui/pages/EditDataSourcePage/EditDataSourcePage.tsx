import {ActionIcon, Breadcrumbs, Tooltip} from '@mantine/core';
import {useModals} from '@mantine/modals';
import {showNotification, updateNotification} from '@mantine/notifications';
import {IconTrash, IconTrashFilled} from '@tabler/icons-preact';
import {route} from 'preact-router';
import {DataSourceForm} from '../../components/DataSourceForm/DataSourceForm.js';
import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {Layout} from '../../layout/Layout.js';
import './EditDataSourcePage.css';
import {deleteDataSource} from '../../utils/data-source.js';

export function EditDataSourcePage(props: {id: string}) {
  const modals = useModals();
  const modalTheme = useModalTheme();

  function onDeleteClicked() {
    const notificationId = `delete-data-source-${props.id}`;
    const modalId = modals.openConfirmModal({
      ...modalTheme,
      title: 'Delete data source',
      children: (
        <Text size="body-sm" weight="semi-bold">
          Are you sure you want to delete data source <code>{props.id}</code>?
          All previously synced data will be deleted. There is no undo.
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
          title: 'Deleting data source',
          message: `Deleting ${props.id} and synced data...`,
          loading: true,
          autoClose: false,
        });
        await deleteDataSource(props.id);
        updateNotification({
          id: notificationId,
          title: 'Deleted data source',
          message: `Successfully deleted ${props.id}`,
          loading: false,
          autoClose: 5000,
        });
        modals.closeModal(modalId);
        route('/cms/data');
      },
    });
  }

  return (
    <Layout>
      <div className="EditDataSourcePage">
        <div className="EditDataSourcePage__header">
          <Breadcrumbs className="EditDataSourcePage__header__breadcrumbs">
            <a href="/cms/data">Data Sources</a>
            <a href={`/cms/data/${props.id}`}>{props.id}</a>
            <div>Edit</div>
          </Breadcrumbs>
          <div className="EditDataSourcePage__header__titleWrap">
            <Heading size="h1">Edit Data Source: {props.id}</Heading>
            <div className="EditDataSourcePage__header__controls">
              <Tooltip label="Delete">
                <ActionIcon onClick={onDeleteClicked}>
                  <IconTrashFilled size={20} stroke="1.5" />
                </ActionIcon>
              </Tooltip>
            </div>
          </div>
        </div>
        <DataSourceForm dataSourceId={props.id} />
      </div>
    </Layout>
  );
}
