import {ActionIcon, Breadcrumbs, Tooltip} from '@mantine/core';
import {useModals} from '@mantine/modals';
import {showNotification, updateNotification} from '@mantine/notifications';
import {
  IconArchive,
  IconCloudOff,
  IconRestore,
  IconTrashFilled,
} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {ConditionalTooltip} from '../../components/ConditionalTooltip/ConditionalTooltip.js';
import {DataSourceForm} from '../../components/DataSourceForm/DataSourceForm.js';
import {Heading} from '../../components/Heading/Heading.js';
import {Text} from '../../components/Text/Text.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {useProjectRoles} from '../../hooks/useProjectRoles.js';
import {Layout} from '../../layout/Layout.js';
import {
  DataSource,
  archiveDataSource,
  deleteDataSource,
  getDataSource,
  unarchiveDataSource,
  unpublishDataSource,
} from '../../utils/data-source.js';
import {testCanPublish} from '../../utils/permissions.js';
import './EditDataSourcePage.css';

export function EditDataSourcePage(props: {id: string}) {
  usePageTitle(`Edit Data Source: ${props.id}`);
  const {route} = useLocation();
  const [dataSource, setDataSource] = useState<DataSource | null>(null);
  const modals = useModals();
  const modalTheme = useModalTheme();
  const {roles} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canPublish = testCanPublish(roles, currentUserEmail);

  useEffect(() => {
    getDataSource(props.id).then((ds) => {
      setDataSource(ds);
    });
  }, [props.id]);

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

  function onArchiveClicked() {
    const notificationId = `archive-data-source-${props.id}`;
    const isPublished = Boolean(dataSource?.publishedAt);
    const modalId = modals.openConfirmModal({
      ...modalTheme,
      title: 'Archive data source',
      children: (
        <Text size="body-sm" weight="semi-bold">
          Are you sure you want to archive data source <code>{props.id}</code>?
          Archived data sources cannot be synced or published.
          {isPublished && (
            <>
              {' '}
              Note: previously published data will remain available until the
              data source is unpublished.
            </>
          )}
        </Text>
      ),
      labels: {confirm: 'Archive', cancel: 'Cancel'},
      cancelProps: {size: 'xs'},
      confirmProps: {color: 'red', size: 'xs'},
      onCancel: () => console.log('Cancel'),
      closeOnConfirm: false,
      onConfirm: async () => {
        showNotification({
          id: notificationId,
          title: 'Archiving data source',
          message: `Archiving ${props.id}...`,
          loading: true,
          autoClose: false,
        });
        await archiveDataSource(props.id);
        const newDataSource = await getDataSource(props.id);
        setDataSource(newDataSource);
        updateNotification({
          id: notificationId,
          title: 'Archived data source',
          message: `Successfully archived ${props.id}`,
          loading: false,
          autoClose: 5000,
        });
        modals.closeModal(modalId);
        route('/cms/data');
      },
    });
  }

  function onUnarchiveClicked() {
    const notificationId = `unarchive-data-source-${props.id}`;
    const modalId = modals.openConfirmModal({
      ...modalTheme,
      title: 'Unarchive data source',
      children: (
        <Text size="body-sm" weight="semi-bold">
          Are you sure you want to unarchive data source{' '}
          <code>{props.id}</code>?
        </Text>
      ),
      labels: {confirm: 'Unarchive', cancel: 'Cancel'},
      cancelProps: {size: 'xs'},
      confirmProps: {color: 'dark', size: 'xs'},
      onCancel: () => console.log('Cancel'),
      closeOnConfirm: false,
      onConfirm: async () => {
        showNotification({
          id: notificationId,
          title: 'Unarchiving data source',
          message: `Unarchiving ${props.id}...`,
          loading: true,
          autoClose: false,
        });
        await unarchiveDataSource(props.id);
        const newDataSource = await getDataSource(props.id);
        setDataSource(newDataSource);
        updateNotification({
          id: notificationId,
          title: 'Unarchived data source',
          message: `Successfully unarchived ${props.id}`,
          loading: false,
          autoClose: 5000,
        });
        modals.closeModal(modalId);
        route(`/cms/data/${props.id}`);
      },
    });
  }

  function onUnpublishClicked() {
    const notificationId = `unpublish-data-source-${props.id}`;
    const modalId = modals.openConfirmModal({
      ...modalTheme,
      title: 'Unpublish data source',
      children: (
        <Text size="body-sm" weight="semi-bold">
          Are you sure you want to unpublish data source{' '}
          <code>{props.id}</code>? The published data will be removed and will
          no longer be available to production. There is no undo.
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
          title: 'Unpublishing data source',
          message: `Unpublishing ${props.id}...`,
          loading: true,
          autoClose: false,
        });
        await unpublishDataSource(props.id);
        const newDataSource = await getDataSource(props.id);
        setDataSource(newDataSource);
        updateNotification({
          id: notificationId,
          title: 'Unpublished data source',
          message: `Successfully unpublished ${props.id}`,
          loading: false,
          autoClose: 5000,
        });
        modals.closeModal(modalId);
      },
    });
  }

  const isPublished = Boolean(dataSource?.publishedAt);
  const isArchived = Boolean(dataSource?.archivedAt);

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
              {isPublished && !isArchived && (
                <ConditionalTooltip
                  label="You don't have access to unpublish data sources"
                  condition={!canPublish}
                >
                  <Tooltip label="Unpublish" disabled={!canPublish}>
                    <ActionIcon
                      onClick={onUnpublishClicked}
                      loading={!roles}
                      disabled={!canPublish}
                    >
                      <IconCloudOff size={20} stroke="1.5" />
                    </ActionIcon>
                  </Tooltip>
                </ConditionalTooltip>
              )}
              <ConditionalTooltip
                label="You don't have access to archive data sources"
                condition={!canPublish}
              >
                {isArchived ? (
                  <Tooltip label="Unarchive" disabled={!canPublish}>
                    <ActionIcon
                      onClick={onUnarchiveClicked}
                      loading={!roles}
                      disabled={!canPublish}
                    >
                      <IconRestore size={20} stroke="1.5" />
                    </ActionIcon>
                  </Tooltip>
                ) : (
                  <Tooltip label="Archive" disabled={!canPublish}>
                    <ActionIcon
                      onClick={onArchiveClicked}
                      loading={!roles}
                      disabled={!canPublish}
                    >
                      <IconArchive size={20} stroke="1.5" />
                    </ActionIcon>
                  </Tooltip>
                )}
              </ConditionalTooltip>
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
